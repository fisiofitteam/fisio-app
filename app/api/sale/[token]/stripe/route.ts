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

  const config = PRODUCT_CONFIG[sale.productCode as keyof typeof PRODUCT_CONFIG];
  if (!config) {
    return NextResponse.json({ error: "Configuración del producto no encontrada" }, { status: 500 });
  }

  const successUrl = `${APP_URL}/pagar/gracias?token=${sale.paymentToken}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${APP_URL}/contratar/${sale.paymentToken}?cancelled=1`;
  const totalCents = sale.amountCents;
  const totalEuros = totalCents / 100;

  const installments = sale.installmentCount ?? 0;
  const useSubscription = installments >= 2;

  const productName = `FisioFit ${config.programType} ${config.durationMonths}m${(sale as any).isReservation ? " · Reserva" : ""}`;
  const productDescription = (sale as any).isReservation
    ? `Reserva de plaza · ${sale.lead.fullName}`
    : `${config.label} · ${sale.lead.fullName}`;

  try {
    if (useSubscription) {
      // ─── Rama subscription: N cobros mensuales del mismo importe ────────
      // Creamos un Price ad-hoc con recurring monthly y unit_amount = total/N.
      const perCobroCents = Math.round(totalCents / installments);
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
        allow_promotion_codes: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
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
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
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
