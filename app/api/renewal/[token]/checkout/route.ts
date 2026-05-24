/**
 * POST /api/renewal/[token]/checkout
 *
 * Crea una sesión de Stripe Checkout para una renovación. El precio se define
 * "al vuelo" (price_data) con el importe fijado al generar el enlace, así que no
 * hace falta tener productos/precios pre-creados en Stripe.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROGRAM_LABELS: Record<string, string> = {
  RECUPERA: "RECUPERA",
  CONSOLIDA: "CONSOLIDA",
  ADVANCE: "ADVANCE",
};

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!stripe) {
    return NextResponse.json(
      { error: "El sistema de pagos no está configurado todavía. Contacta con el equipo." },
      { status: 503 }
    );
  }

  const checkout = await prisma.renewalCheckout.findUnique({
    where: { paymentToken: params.token },
    include: { patient: { select: { email: true } } },
  });

  if (!checkout) return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  if (checkout.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Este link ha expirado" }, { status: 410 });
  }
  if (checkout.status === "paid") {
    return NextResponse.json({ error: "Esta renovación ya está pagada" }, { status: 409 });
  }

  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const successUrl = `${origin}/renovar/gracias?token=${checkout.paymentToken}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/renovar/${checkout.paymentToken}?cancelled=1`;

  const label = PROGRAM_LABELS[checkout.programType] || checkout.programType;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "klarna"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: checkout.currency,
            unit_amount: checkout.amountCents,
            product_data: {
              name: `Renovación ${label} · ${checkout.durationMonths} ${checkout.durationMonths === 1 ? "mes" : "meses"}`,
            },
          },
        },
      ],
      customer_email: checkout.patient.email || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        kind: "renewal",
        renewalCheckoutId: checkout.id,
        paymentToken: checkout.paymentToken,
      },
      locale: "es",
    });

    await prisma.renewalCheckout.update({
      where: { id: checkout.id },
      data: { stripeSessionId: session.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[renewal-checkout] Error creating Stripe session:", err);
    return NextResponse.json({ error: err.message || "Error al iniciar el pago" }, { status: 500 });
  }
}
