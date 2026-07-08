/**
 * POST /api/prevention/consultation/checkout
 *
 * Crea un Stripe Checkout Session en modo "payment" (one-shot) para la
 * consulta puntual de 45 min con la CEO (17 €). Reserva un slot informal —
 * al terminar, la página de gracias muestra las instrucciones para
 * agendar la videollamada.
 *
 * Body: { patientId } — obligatorio (solo pacientes pueden reservar).
 * Response: { url } → el navegador redirige a Stripe.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";
import {
  stripe,
  getPreventionConsultationPriceId,
  PREVENTION_CONSULTATION_AMOUNT_CENTS,
  PREVENTION_CONSULTATION_DURATION_MIN,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe no configurado" }, { status: 503 });
  }

  const patient = await getActivePatient();
  if (!patient) {
    return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* body opcional */ }

  const priceId = getPreventionConsultationPriceId();

  const url = new URL(req.url);
  const origin = `${url.protocol}//${url.host}`;
  const successUrl = `${origin}/paciente/${patient.id}/consulta/gracias?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/paciente/${patient.id}/consulta?cancelled=1`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: "eur",
                unit_amount: PREVENTION_CONSULTATION_AMOUNT_CENTS,
                product_data: {
                  name: `Consulta con fisio · ${PREVENTION_CONSULTATION_DURATION_MIN} min`,
                },
              },
              quantity: 1,
            },
          ],
      customer_email: patient.email ?? undefined,
      metadata: {
        productType: "prevention-consultation",
        patientId: patient.id,
        // Nota libre desde la landing (motivo de consulta). Opcional.
        note: typeof body?.note === "string" ? body.note.slice(0, 500) : "",
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) throw new Error("Stripe no devolvió URL de checkout");
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("[prevention/consultation/checkout] error:", e);
    return NextResponse.json(
      { error: e?.message ?? "No se pudo iniciar el pago" },
      { status: 502 }
    );
  }
}
