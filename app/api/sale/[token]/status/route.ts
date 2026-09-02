/**
 * GET /api/sale/[token]/status
 *
 * Endpoint público que devuelve el estado actual del Sale. Usado por la
 * página de gracias para hacer polling hasta que el webhook confirme el pago.
 *
 * Los pagos nuevos van por PayPal (webhook /api/webhooks/paypal actualiza el
 * Sale directamente). Este endpoint conserva un fallback contra Stripe API
 * SOLO para Sales históricos previos a la migración PayPal que aún tengan
 * stripeSessionId — no se dispara para los pagos nuevos.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { captureOrder, getOrder } from "@/lib/paypal/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const sale = await prisma.sale.findUnique({
    where: { paymentToken: params.token },
    include: {
      lead: { select: { fullName: true, email: true } },
    },
  });

  if (!sale) {
    return NextResponse.json({ error: "Link no válido" }, { status: 404 });
  }

  // ─── Fallback PayPal ────────────────────────────────────────────────
  // Si el Sale sigue pending y tiene paypalOrderId, consultamos el estado
  // real. Si PayPal dice APPROVED, disparamos capture. Si COMPLETED,
  // marcamos Sale paid — así el paciente entra aunque el webhook no haya
  // llegado todavía (era el bug que dejaba al paciente 60s con el
  // spinner y luego "escríbenos por WhatsApp").
  if (sale.status !== "paid" && sale.paypalOrderId) {
    try {
      let order = await getOrder(sale.paypalOrderId);

      // Si está APPROVED pero no capturado, capturamos ahora (idempotente).
      if (order?.status === "APPROVED") {
        try {
          await captureOrder(sale.paypalOrderId);
          order = await getOrder(sale.paypalOrderId);
        } catch (captureErr) {
          console.error("[sale-status] PayPal capture fallback failed:", captureErr);
        }
      }

      if (order?.status === "COMPLETED") {
        const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
        const updated = await prisma.sale.update({
          where: { id: sale.id },
          data: {
            status: "paid",
            paidAt: new Date(),
            paypalCaptureId: capture?.id ?? sale.paypalCaptureId,
            paymentMethod: sale.paymentMethod ?? "paypal",
          },
        });
        return new NextResponse(
          JSON.stringify({
            status: updated.status,
            leadName: sale.lead.fullName,
            leadEmail: sale.lead.email,
            hasPatient: !!updated.patientId,
          }),
          { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
        );
      }
    } catch (e) {
      console.error("[sale-status] PayPal verification failed:", e);
      // Continuar — el polling reintenta.
    }
  }

  // ─── Fallback Stripe (legacy) ───────────────────────────────────────
  if (sale.status !== "paid" && stripe && sale.stripeSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sale.stripeSessionId);
      if (session.payment_status === "paid") {
        // Marcar Sale como pagado
        const updated = await prisma.sale.update({
          where: { id: sale.id },
          data: {
            status: "paid",
            paidAt: new Date(),
            stripePaymentIntentId: (session.payment_intent as string) || null,
            paymentMethod:
              (session.payment_method_types && session.payment_method_types[0]) || null,
          },
        });
        return new NextResponse(
          JSON.stringify({
            status: updated.status,
            leadName: sale.lead.fullName,
            leadEmail: sale.lead.email,
            hasPatient: !!updated.patientId,
          }),
          { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
        );
      }
    } catch (e) {
      console.error("[sale-status] Stripe verification failed:", e);
      // Continuar con el status actual
    }
  }

  return new NextResponse(
    JSON.stringify({
      status: sale.status,
      leadName: sale.lead.fullName,
      leadEmail: sale.lead.email,
      hasPatient: !!sale.patientId,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}

