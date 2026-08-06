/**
 * POST /api/renewal/[token]/paypal
 *
 * Genera el flujo de pago PayPal para el RenewalCheckout identificado por
 * token. Devuelve la URL a la que redirigir al usuario (approve URL).
 *
 * Dos ramas según `checkout.installmentCount`:
 *   - null / 0 / 1  → Order de un solo pago (Orders API v2) con Pay Later.
 *   - 2..12         → Subscription con N cobros mensuales del mismo importe.
 *
 * En ambos casos `custom_id` = `renewal:${checkout.paymentToken}`, así el
 * webhook sabe que es una renovación (no un alta) y aplica la lógica de
 * `applyRenewal` en vez de crear un Patient.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOrder } from "@/lib/paypal/orders";
import { createPlan, createSubscription } from "@/lib/paypal/subscriptions";
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

  const checkout = await prisma.renewalCheckout.findUnique({
    where: { paymentToken: params.token },
  });
  if (!checkout) return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  if (checkout.tokenExpiresAt < new Date())
    return NextResponse.json({ error: "Este link ha expirado" }, { status: 410 });
  if (checkout.status === "paid")
    return NextResponse.json({ error: "Esta renovación ya está pagada" }, { status: 409 });

  const base = appBaseUrl();
  const returnUrl = `${base}/renovar/gracias?token=${checkout.paymentToken}`;
  const cancelUrl = `${base}/renovar/${checkout.paymentToken}?cancelled=1`;
  const totalEur = checkout.amountCents / 100;

  // El custom_id lleva prefijo "renewal:" para que el webhook distinga
  // entre altas (paymentToken de Sale) y renovaciones (RenewalCheckout).
  const customId = `renewal:${checkout.paymentToken}`;

  const installments = checkout.installmentCount ?? 0;
  const useSubscription = installments >= 2;

  try {
    if (useSubscription) {
      // ─── Rama Subscription: N cobros mensuales ───────────────────────────
      const plan = await createPlan({
        requestId: `renewal-plan-${checkout.id}`,
        name: `Renovación ${checkout.programType} ${checkout.durationMonths}m — ${installments} cuotas`,
        totalAmountEur: totalEur,
        totalCycles: installments,
      });
      const sub = await createSubscription({
        requestId: `renewal-sub-${checkout.id}`,
        planId: plan.id,
        customId,
        returnUrl,
        cancelUrl,
        locale: "es-ES",
      });
      await prisma.renewalCheckout.update({
        where: { id: checkout.id },
        data: {
          paypalPlanId: plan.id,
          paypalSubscriptionId: sub.id,
          paymentMethod: null,
        },
      });
      return NextResponse.json({
        url: sub.approveUrl,
        subscriptionId: sub.id,
        mode: "subscription",
      });
    }

    // ─── Rama Order: pago único con Pay Later ──────────────────────────────
    const order = await createOrder({
      requestId: `renewal-${checkout.id}`,
      amountEur: totalEur,
      description: `Renovación ${checkout.programType} ${checkout.durationMonths}m`,
      returnUrl,
      cancelUrl,
      customId,
      referenceLabel: `Renovación ${checkout.programType} ${checkout.durationMonths}m`,
      locale: "es-ES",
    });
    await prisma.renewalCheckout.update({
      where: { id: checkout.id },
      data: { paypalOrderId: order.id, paymentMethod: null },
    });
    return NextResponse.json({ url: order.approveUrl, orderId: order.id, mode: "order" });
  } catch (e: any) {
    console.error("[paypal renewal] fallo en el flujo de pago:", e);
    return NextResponse.json({ error: e?.message ?? "No se pudo crear el pago" }, { status: 500 });
  }
}
