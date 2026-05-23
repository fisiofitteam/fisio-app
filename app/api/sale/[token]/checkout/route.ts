/**
 * POST /api/sale/[token]/checkout
 *
 * Crea una sesión de Stripe Checkout para el Sale identificado por token.
 * Devuelve la URL a la que redirigir al usuario.
 *
 * El Sale debe existir, no estar expirado, ni pagado.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe, PRODUCT_CONFIG, getPriceIdForProduct } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!stripe) {
    return NextResponse.json(
      { error: "El sistema de pagos no está configurado todavía. Contacta con el equipo." },
      { status: 503 }
    );
  }

  const sale = await prisma.sale.findUnique({
    where: { paymentToken: params.token },
    include: { lead: true },
  });

  if (!sale) {
    return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  }
  if (sale.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Este link ha expirado" }, { status: 410 });
  }
  if (sale.status === "paid") {
    return NextResponse.json({ error: "Este pago ya está completado" }, { status: 409 });
  }

  const config = PRODUCT_CONFIG[sale.productCode as keyof typeof PRODUCT_CONFIG];
  if (!config) {
    return NextResponse.json({ error: "Producto no válido" }, { status: 400 });
  }

  const priceId = getPriceIdForProduct(sale.productCode as keyof typeof PRODUCT_CONFIG);
  if (!priceId) {
    return NextResponse.json(
      { error: `Precio no configurado para ${sale.productCode}` },
      { status: 503 }
    );
  }

  // Construir URLs de retorno
  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const successUrl = `${origin}/pagar/gracias?token=${sale.paymentToken}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/contratar/${sale.paymentToken}?cancelled=1`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "klarna"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: sale.lead.email || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        saleId: sale.id,
        leadId: sale.leadId,
        productCode: sale.productCode,
        paymentToken: sale.paymentToken,
      },
      // Permitir códigos promocionales en el futuro
      allow_promotion_codes: false,
      // Locale español
      locale: "es",
    });

    // Guardar el sessionId en el Sale para auditoría
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        stripeSessionId: session.id,
        stripePriceId: priceId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[checkout] Error creating Stripe session:", err);
    return NextResponse.json(
      { error: err.message || "Error al iniciar el pago" },
      { status: 500 }
    );
  }
}
