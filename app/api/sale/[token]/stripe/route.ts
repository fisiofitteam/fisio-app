/**
 * POST /api/sale/[token]/stripe
 *
 * Crea la Stripe Checkout Session para un Sale existente y devuelve
 * su URL de hosted checkout. Espejo del /paypal endpoint.
 *
 * Ramas:
 *   - installmentCount null/0/1 → mode=payment (pago único, tarjeta+klarna+…)
 *   - installmentCount >= 2      → mode=subscription con precio ad-hoc
 *     de N cobros mensuales del mismo importe.
 *
 * Metadata en la session: { saleId, paymentToken } → el webhook lo
 * usa para saber a qué Sale activar.
 */
import {firstInstallments} from "@/lib/first-sale-terms";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, PRODUCT_CONFIG } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://app.fisiofitteam.com";

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe no está configurado" }, { status: 503 });
  }

  const sale = await prisma.sale.findUnique({
    where: { paymentToken: params.token },
    include: { lead: { select: { email: true, fullName: true } } },
  });
  if (!sale) return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  if (sale.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Este link ha expirado" }, { status: 410 });
  }
  if (sale.status === "paid") {
    return NextResponse.json({ error: "Este pago ya está completado" }, { status: 409 });
  }

  const newFlow=sale.grossAmountCents!=null || sale.isReservation;
  if(newFlow){
    if(sale.paymentProvider!=="stripe"||sale.status!=="pending")return NextResponse.json({error:"El enlace no admite este pago."},{status:409});
    // Mark it before contacting a provider: a simultaneous cancel/replacement must not
    // issue a second collectible order. Provider calls below have stable idempotency keys.
    const lock=await prisma.sale.updateMany({where:{id:sale.id,status:"pending",paymentProvider:"stripe",tokenExpiresAt:{gt:new Date()}},data:{checkoutStartedAt:sale.checkoutStartedAt??new Date()}});
    if(!lock.count)return NextResponse.json({error:"Este enlace ha cambiado. Vuelve a abrirlo."},{status:409});
  }

  const config = PRODUCT_CONFIG[sale.productCode as keyof typeof PRODUCT_CONFIG];
  if (!config) {
    return NextResponse.json({ error: "Configuración del producto no encontrada" }, { status: 500 });
  }

  const successUrl = `${APP_URL}/pagar/gracias?token=${sale.paymentToken}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${APP_URL}/contratar/${sale.paymentToken}?cancelled=1`;
  const totalCents = sale.amountCents;
  const totalEuros = totalCents / 100;
  let idempotencySuffix="first";
  if(newFlow && sale.stripeSessionId){
    const prior=await stripe.checkout.sessions.retrieve(sale.stripeSessionId);
    if(prior.status==="open" && prior.url)return NextResponse.json({url:prior.url,sessionId:prior.id});
    if(prior.status!=="expired")return NextResponse.json({error:"El pago ya se ha iniciado. Consulta su confirmación."},{status:409});
    idempotencySuffix=prior.id; // Regenerate only after provider confirms the old session expired.
  }
  const idempotent=newFlow?{idempotencyKey:"sale-"+sale.id+"-"+idempotencySuffix}:undefined;

  const installments = sale.installmentCount ?? 0;
  const useSubscription = installments >= 2;

  const productName = sale.isReservation ? "FisioFit · Señal de reserva de plaza" : `FisioFit ${config.programType} ${config.durationMonths}m`;
  const productDescription = sale.isReservation
    ? `Reserva de plaza · ${sale.lead.fullName}`
    : `${config.label} · ${sale.lead.fullName}`;

  try {
    if (useSubscription) {
      // ─── Rama subscription: N cobros mensuales del mismo importe ────────
      // Creamos un Price ad-hoc con recurring monthly y unit_amount = total/N.
      const terms=firstInstallments(totalCents,installments);
      const perCobroCents = sale.grossAmountCents!=null ? terms.regularCents : Math.round(totalCents / installments);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: sale.currency,
              recurring: { interval: "month" },
              unit_amount: perCobroCents,
              product_data: {
                name: `${productName} · Cuota mensual (${installments} pagos)`,
                description: productDescription,
              },
            },
          },
          ...(sale.grossAmountCents!=null && terms.remainderCents ? [{quantity:1,price_data:{currency:sale.currency,unit_amount:terms.remainderCents,product_data:{name:"Ajuste de céntimos de la primera cuota"}}}] : []),
        ],
        // Cortamos la subscription automáticamente tras N cobros con un
        // cancellation schedule. Como Stripe no soporta "cancel after N
        // invoices" nativo en Checkout, lo dejamos abierto y el webhook lo
        // cancela cuando llegan N invoice.paid.
        subscription_data: {
          metadata: {
            saleId: sale.id,
            paymentToken: sale.paymentToken,
            installments: String(installments),
            productType: "sale",
          },
        },
        ...(sale.lead.email ? { customer_email: sale.lead.email } : {}),
        metadata: {
          saleId: sale.id,
          paymentToken: sale.paymentToken,
          productType: "sale",
          installments: String(installments),
          isReservation: (sale as any).isReservation ? "true" : "false",
        },
        allow_promotion_codes: !newFlow,
        success_url: successUrl,
        cancel_url: cancelUrl,
      },idempotent);
      await prisma.sale.update({
        where: { id: sale.id },
        data: { stripeSessionId: session.id, paymentMethod: null },
      });
      if (!session.url) throw new Error("Stripe no devolvió URL");
      return NextResponse.json({ url: session.url, sessionId: session.id, mode: "subscription" });
    }

    // ─── Rama payment: pago único ───────────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: sale.currency,
            unit_amount: totalCents,
            product_data: {
              name: productName,
              description: productDescription,
            },
          },
        },
      ],
      ...(sale.lead.email ? { customer_email: sale.lead.email } : {}),
      metadata: {
        saleId: sale.id,
        paymentToken: sale.paymentToken,
        productType: "sale",
        isReservation: (sale as any).isReservation ? "true" : "false",
      },
      allow_promotion_codes: !sale.isReservation && (sale as {grossAmountCents?:number|null}).grossAmountCents==null,
      success_url: successUrl,
      cancel_url: cancelUrl,
    },idempotent);
    await prisma.sale.update({
      where: { id: sale.id },
      data: { stripeSessionId: session.id, paymentMethod: null },
    });
    if (!session.url) throw new Error("Stripe no devolvió URL");
    return NextResponse.json({ url: session.url, sessionId: session.id, mode: "payment", amountEuros: totalEuros });
  } catch (e: any) {
    console.error("[sale-stripe] Error:", e);
    return NextResponse.json({ error: e?.message ?? "No se pudo crear el pago" }, { status: 500 });
  }
}
