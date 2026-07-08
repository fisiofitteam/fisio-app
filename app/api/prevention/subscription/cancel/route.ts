/**
 * POST /api/prevention/subscription/cancel
 *
 * El paciente Prevention desactiva la renovación automática. Mantenemos
 * el acceso hasta currentPeriodEnd; ahí Stripe manda subscription.deleted
 * y el webhook marca "finished".
 *
 * Idempotente: si ya está marcada, devuelve OK sin re-llamar a Stripe.
 *
 * Body opcional: { reactivate: true } → quita el "cancel at period end"
 * (útil si el paciente se arrepiente antes de que expire).
 *
 * Auth: solo el propio paciente (getActivePatient — sesión web).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getActivePatient } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const patient = await getActivePatient();
  if (!patient) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const reactivate = body?.reactivate === true;

  const sub = await prisma.patientSubscription.findFirst({
    where: {
      patientId: patient.id,
      productType: "prevention",
      status: { in: ["scheduled", "trialing", "active", "past_due"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!sub) {
    return NextResponse.json({ error: "No hay suscripción activa" }, { status: 404 });
  }

  const nextCancelFlag = !reactivate;
  if (sub.cancelAtPeriodEnd === nextCancelFlag) {
    return NextResponse.json({
      ok: true,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      unchanged: true,
    });
  }

  // Reflejar el cambio en Stripe. Si no hay stripeSubscriptionId (alta
  // manual sin Stripe), simplemente actualizamos la BD local.
  if (stripe && sub.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: nextCancelFlag,
      });
    } catch (e: any) {
      console.error("[prevention/subscription/cancel] Stripe error:", e);
      return NextResponse.json(
        { error: e?.message ?? "Error al comunicar con Stripe" },
        { status: 502 },
      );
    }
  }

  const updated = await prisma.patientSubscription.update({
    where: { id: sub.id },
    data: {
      cancelAtPeriodEnd: nextCancelFlag,
      canceledAt: nextCancelFlag ? new Date() : null,
    },
  });

  return NextResponse.json({
    ok: true,
    cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
    currentPeriodEnd: updated.currentPeriodEnd,
  });
}
