/**
 * GET /api/renewal/[token]/status
 *
 * Estado de la renovación, para que la página de gracias haga polling tras el
 * pago. Incluye un fallback contra Stripe por si el webhook aún no llegó.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { captureOrder, getOrder } from "@/lib/paypal/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const checkout = await prisma.renewalCheckout.findUnique({
    where: { paymentToken: params.token },
    select: { id: true, status: true, stripeSessionId: true, paypalOrderId: true, paypalCaptureId: true },
  });

  if (!checkout) return NextResponse.json({ error: "Link no válido" }, { status: 404 });

  // ─── Fallback PayPal ────────────────────────────────────────────────
  // Si sigue pending pero PayPal dice APPROVED/COMPLETED, forzamos que
  // la UI vea el pago como confirmado — así el paciente no se queda 60s
  // con el spinner esperando al webhook.
  if (checkout.status !== "paid" && checkout.paypalOrderId) {
    try {
      let order = await getOrder(checkout.paypalOrderId);
      if (order?.status === "APPROVED") {
        try {
          await captureOrder(checkout.paypalOrderId);
          order = await getOrder(checkout.paypalOrderId);
        } catch (captureErr) {
          console.error("[renewal-status] PayPal capture fallback failed:", captureErr);
        }
      }
      if (order?.status === "COMPLETED") {
        const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
        await prisma.renewalCheckout.update({
          where: { id: checkout.id },
          data: {
            status: "paid",
            paidAt: new Date(),
            paypalCaptureId: capture?.id ?? checkout.paypalCaptureId,
            paymentMethod: "paypal",
          },
        });
        return NextResponse.json({ status: "paid" });
      }
    } catch (e) {
      console.error("[renewal-status] PayPal verification failed:", e);
    }
  }

  // ─── Fallback Stripe (legacy) ───────────────────────────────────────
  if (checkout.status !== "paid" && checkout.stripeSessionId && stripe) {
    try {
      const session = await stripe.checkout.sessions.retrieve(checkout.stripeSessionId);
      if (session.payment_status === "paid") {
        return NextResponse.json({ status: "paid" });
      }
    } catch {
      // ignorar — devolvemos el estado de BD
    }
  }

  return NextResponse.json({ status: checkout.status });
}
