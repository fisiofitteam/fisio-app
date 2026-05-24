/**
 * GET /api/renewal/[token]/status
 *
 * Estado de la renovación, para que la página de gracias haga polling tras el
 * pago. Incluye un fallback contra Stripe por si el webhook aún no llegó.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const checkout = await prisma.renewalCheckout.findUnique({
    where: { paymentToken: params.token },
    select: { status: true, stripeSessionId: true },
  });

  if (!checkout) return NextResponse.json({ error: "Link no válido" }, { status: 404 });

  // Fallback: si aún no está "paid" pero Stripe ya confirmó el pago, lo reflejamos
  // (el webhook es quien crea el SubscriptionRenewal; esto solo informa a la UI).
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
