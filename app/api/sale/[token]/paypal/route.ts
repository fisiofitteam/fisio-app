/**
 * POST /api/sale/[token]/paypal
 *
 * Crea una Order de PayPal (Orders API v2) para el Sale identificado por
 * token. Devuelve la URL a la que redirigir al usuario (approve URL) —
 * exactamente el mismo contrato que /checkout usa con Stripe.
 *
 * Al crearla persistimos el `paypalOrderId` en el Sale para poder atarlo
 * en la vuelta y en el webhook. El `custom_id` de la Order = paymentToken
 * del Sale, así que en el webhook resolvemos el Sale desde PayPal sin
 * necesidad de otro id.
 *
 * El Sale debe existir, no estar expirado, ni pagado.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PRODUCT_CONFIG } from "@/lib/stripe";
import { createOrder } from "@/lib/paypal/orders";
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

  const config = PRODUCT_CONFIG[sale.productCode as keyof typeof PRODUCT_CONFIG];
  if (!config) {
    return NextResponse.json({ error: "Configuración del producto no encontrada" }, { status: 500 });
  }

  const base = appBaseUrl();
  // Misma landing que Stripe. La página /pagar/gracias detecta si venimos
  // de PayPal (por `PayerID` en query) y hace el capture server-side antes
  // de arrancar el polling de Sale.status.
  const returnUrl = `${base}/pagar/gracias?token=${sale.paymentToken}`;
  const cancelUrl = `${base}/contratar/${sale.paymentToken}?cancelled=1`;

  try {
    const order = await createOrder({
      requestId: `sale-${sale.id}`, // idempotencia: mismo Sale → misma Order si se reintenta
      amountEur: sale.amountCents / 100,
      description: config.label,
      returnUrl,
      cancelUrl,
      customId: sale.paymentToken,
      referenceLabel: `FisioFit ${config.programType} ${config.durationMonths}m`,
      locale: "es-ES",
    });

    // Persistimos el order ID en el Sale para atarlo al webhook y a la
    // vuelta del usuario. Si el usuario relanza el pago (link roto, cambio
    // de navegador), createOrder es idempotente por requestId así que
    // PayPal nos devolvería la misma Order y refrescamos el mismo campo.
    await prisma.sale.update({
      where: { id: sale.id },
      data: { paypalOrderId: order.id, paymentMethod: null },
    });

    return NextResponse.json({ url: order.approveUrl, orderId: order.id });
  } catch (e: any) {
    console.error("[paypal/order] fallo al crear Order:", e);
    return NextResponse.json({ error: e?.message ?? "No se pudo crear el pago" }, { status: 500 });
  }
}
