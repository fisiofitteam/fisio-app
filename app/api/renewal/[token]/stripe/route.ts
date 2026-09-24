/**
 * POST /api/renewal/[token]/stripe
 *
 * Crea la Stripe Checkout Session para un RenewalCheckout.
 * Espejo de /paypal para renovaciones.
 *
 * Metadata en session: { renewalCheckoutId, paymentToken, productType: "renewal" }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://app.fisiofitteam.com";

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe no está configurado" }, { status: 503 });
  }

  const checkout = await prisma.renewalCheckout.findUnique({
    where: { paymentToken: params.token },
    include: { patient: { select: { email: true, fullName: true } } },
  });
  if (!checkout) return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  if (checkout.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Este link ha expirado" }, { status: 410 });
  }
  if (checkout.status === "paid") {
    return NextResponse.json({ error: "Este pago ya está completado" }, { status: 409 });
  }

  const successUrl = `${APP_URL}/renovar/gracias?token=${checkout.paymentToken}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${APP_URL}/renovar/${checkout.paymentToken}?cancelled=1`;
  const totalCents = checkout.amountCents;
  const isReservation = (checkout as any).isReservation === true;
  const installments = checkout.installmentCount ?? 0;
  const useSubscription = installments >= 2;

  const label = isReservation
    ? `Reserva de plaza · ${checkout.programType}`
    : `Renovación ${checkout.programType} · ${checkout.durationMonths}m`;

  try {
    if (useSubscription) {
      const perCobroCents = Math.round(totalCents / installments);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: checkout.currency,
              recurring: { interval: "month" },
              unit_amount: perCobroCents,
              product_data: {
                name: `${label} · Cuota mensual (${installments} pagos)`,
                description: checkout.patient.fullName,
              },
            },
          },
        ],
        subscription_data: {
          metadata: {
            renewalCheckoutId: checkout.id,
            paymentToken: checkout.paymentToken,
            installments: String(installments),
            productType: "renewal",
          },
        },
        ...(checkout.patient.email ? { customer_email: checkout.patient.email } : {}),
        metadata: {
          renewalCheckoutId: checkout.id,
          paymentToken: checkout.paymentToken,
          productType: "renewal",
          installments: String(installments),
          isReservation: isReservation ? "true" : "false",
        },
        allow_promotion_codes: true,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      await prisma.renewalCheckout.update({
        where: { id: checkout.id },
        data: { stripeSessionId: session.id, paymentMethod: null },
      });
      if (!session.url) throw new Error("Stripe no devolvió URL");
      return NextResponse.json({ url: session.url, sessionId: session.id, mode: "subscription" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: checkout.currency,
            unit_amount: totalCents,
            product_data: {
              name: label,
              description: checkout.patient.fullName,
            },
          },
        },
      ],
      ...(checkout.patient.email ? { customer_email: checkout.patient.email } : {}),
      metadata: {
        renewalCheckoutId: checkout.id,
        paymentToken: checkout.paymentToken,
        productType: "renewal",
        isReservation: isReservation ? "true" : "false",
      },
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    await prisma.renewalCheckout.update({
      where: { id: checkout.id },
      data: { stripeSessionId: session.id, paymentMethod: null },
    });
    if (!session.url) throw new Error("Stripe no devolvió URL");
    return NextResponse.json({ url: session.url, sessionId: session.id, mode: "payment" });
  } catch (e: any) {
    console.error("[renewal-stripe] Error:", e);
    return NextResponse.json({ error: e?.message ?? "No se pudo crear el pago" }, { status: 500 });
  }
}
