/**
 * POST /api/sale/[token]/paypal
 *
 * Genera el flujo de pago PayPal para el Sale identificado por token.
 * Devuelve la URL a la que redirigir al usuario (approve URL).
 *
 * Dos ramas según `sale.installmentCount`:
 *   - null / 0 / 1  → Order de un solo pago (Orders API v2) con Pay Later.
 *   - 2..12         → Subscription con N cobros mensuales del mismo importe.
 *
 * En ambos casos `custom_id` = `sale.paymentToken`, así que el webhook
 * resuelve el Sale desde PayPal sin necesidad de otro id.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRODUCT_CONFIG } from "@/lib/stripe";
import { createOrder, getOrder } from "@/lib/paypal/orders";
import { createPlan, createSubscription, getSubscription } from "@/lib/paypal/subscriptions";
import { appBaseUrl, paypalCredentials } from "@/lib/paypal/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  if (!paypalCredentials()) {
    return NextResponse.json(
      { error: "PayPal aún no está configurado. Contacta con el equipo." },
      { status: 503 },
    );
  }

  const sale = await prisma.sale.findUnique({ where: { paymentToken: params.token } });
  if (!sale) return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  if (sale.tokenExpiresAt < new Date()) return NextResponse.json({ error: "Este link ha expirado" }, { status: 410 });
  if (sale.status === "paid") return NextResponse.json({ error: "Este pago ya está completado" }, { status: 409 });

  const newFlow=sale.grossAmountCents!=null || sale.isReservation;
  if(newFlow){
    if(sale.paymentProvider!=="paypal"||sale.status!=="pending")return NextResponse.json({error:"El enlace no admite este pago."},{status:409});
    // Mark it before contacting a provider: a simultaneous cancel/replacement must not
    // issue a second collectible order. Provider calls below have stable idempotency keys.
    const lock=await prisma.sale.updateMany({where:{id:sale.id,status:"pending",paymentProvider:"paypal",tokenExpiresAt:{gt:new Date()}},data:{checkoutStartedAt:sale.checkoutStartedAt??new Date()}});
    if(!lock.count)return NextResponse.json({error:"Este enlace ha cambiado. Vuelve a abrirlo."},{status:409});
  }

  const config = PRODUCT_CONFIG[sale.productCode as keyof typeof PRODUCT_CONFIG];
  if (!config) {
    return NextResponse.json({ error: "Configuración del producto no encontrada" }, { status: 500 });
  }

  const base = appBaseUrl();
  const returnUrl = `${base}/pagar/gracias?token=${sale.paymentToken}`;
  const cancelUrl = `${base}/contratar/${sale.paymentToken}?cancelled=1`;
  const totalEur = sale.amountCents / 100;

  const installments = sale.installmentCount ?? 0;
  const useSubscription = installments >= 2;

  try {
    // A provider's request-id has limited retention. Once the ID is known, never create
    // another collectible order or subscription just because the patient opened the link again.
    if(newFlow && (sale.paypalSubscriptionId || sale.paypalOrderId)){
      const prior=sale.paypalSubscriptionId ? await getSubscription(sale.paypalSubscriptionId) : await getOrder(sale.paypalOrderId!);
      if(prior?.id!==(sale.paypalSubscriptionId||sale.paypalOrderId))throw Error("No se ha podido verificar la referencia de PayPal.");
      const proceed=["CREATED","SAVED","PAYER_ACTION_REQUIRED","APPROVAL_PENDING"].includes(prior.status);
      const url=proceed ? prior.links?.find((l:{rel:string})=>l.rel==="approve"||l.rel==="payer-action")?.href :
        ["APPROVED","ACTIVE","COMPLETED"].includes(prior.status)?returnUrl:null;
      if(!url)return NextResponse.json({error:"El intento de PayPal requiere revisión antes de emitir otro."},{status:409});
      return NextResponse.json({url,...(sale.paypalSubscriptionId?{subscriptionId:prior.id,mode:"subscription"}:{orderId:prior.id,mode:"order"})});
    }
    if (useSubscription) {
      // ─── Rama Subscription: N cobros mensuales ───────────────────────────
      const plan = await createPlan({
        requestId: `plan-${sale.id}`,
        name: `FisioFit ${config.programType} ${config.durationMonths}m — ${installments} cuotas`,
        totalAmountEur: totalEur,
        totalCycles: installments,
        exactTotal: sale.grossAmountCents!=null,
      });
      const sub = await createSubscription({
        requestId: `sub-${sale.id}`,
        planId: plan.id,
        customId: sale.paymentToken,
        returnUrl,
        cancelUrl,
        locale: "es-ES",
      });
      await prisma.sale.update({
        where: { id: sale.id },
        data: {
          paypalPlanId: plan.id,
          paypalSubscriptionId: sub.id,
          paymentMethod: null,
        },
      });
      return NextResponse.json({ url: sub.approveUrl, subscriptionId: sub.id, mode: "subscription" });
    }

    // ─── Rama Order: pago único con Pay Later ──────────────────────────────
    const order = await createOrder({
      requestId: `sale-${sale.id}`,
      amountEur: totalEur,
      description: config.label,
      returnUrl,
      cancelUrl,
      customId: sale.paymentToken,
      referenceLabel: `FisioFit ${config.programType} ${config.durationMonths}m`,
      locale: "es-ES",
    });
    await prisma.sale.update({
      where: { id: sale.id },
      data: { paypalOrderId: order.id, paymentMethod: null },
    });
    return NextResponse.json({ url: order.approveUrl, orderId: order.id, mode: "order" });
  } catch (e: any) {
    console.error("[paypal] fallo en el flujo de pago:", e);
    return NextResponse.json({ error: e?.message ?? "No se pudo crear el pago" }, { status: 500 });
  }
}
