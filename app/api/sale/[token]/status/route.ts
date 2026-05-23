/**
 * GET /api/sale/[token]/status
 *
 * Endpoint público que devuelve el estado actual del Sale.
 * Usado por la página de gracias para hacer polling hasta que el webhook
 * confirme el pago.
 *
 * Como fallback (si el webhook todavía no está configurado o tarda), también
 * verifica directamente contra Stripe API si el Sale tiene stripeSessionId.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";

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

  // Si el Sale todavía no está paid, intentar confirmar contra Stripe
  // directamente. Esto es un fallback útil cuando el webhook aún no ha
  // procesado el evento (suele ser cuestión de segundos).
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

