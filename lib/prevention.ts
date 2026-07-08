/**
 * Helpers de dominio para FisioFit Prevention (suscripción recurrente low-ticket).
 *
 * Responsabilidades:
 *  1. Crear una PatientSubscription tras el pago inicial (post-checkout).
 *  2. Consultar la suscripción activa de un paciente.
 *  3. Programar el arranque diferido cuando el paciente todavía tiene un
 *     programa activo (RECUPERA/CONSOLIDA/ADVANCE) — Prevention arranca al
 *     terminar el actual, y un cron diario la activa cuando toca.
 *  4. Cancelar / marcar como no-renovable.
 *
 * NO habla directamente con Stripe — eso vive en app/api/webhooks/stripe.
 * Este módulo solo maneja la lógica de dominio + BD.
 */
import { prisma } from "@/lib/prisma";
import {
  PREVENTION_PLAN_CONFIG,
  PREVENTION_TRIAL_DAYS,
  type PreventionPlan,
} from "@/lib/stripe";

export type PreventionStatus =
  | "scheduled"      // pagado pero aún no arranca (programa anterior activo)
  | "trialing"       // dentro de los 4 días de prueba
  | "active"         // suscripción viva, cobrando
  | "past_due"       // fallo en el último cobro, retrying
  | "unpaid"         // fallos agotados, sin acceso
  | "canceled"       // usuario canceló
  | "finished";      // no renovó y llegó al final del periodo

/**
 * Devuelve la suscripción "activa" del paciente si existe. Prioriza los
 * estados que dan acceso (trialing, active, past_due, scheduled). Devuelve
 * null si no hay ninguna en ese estado.
 */
export async function getActivePreventionSubscription(patientId: string) {
  return prisma.patientSubscription.findFirst({
    where: {
      patientId,
      productType: "prevention",
      status: { in: ["scheduled", "trialing", "active", "past_due"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Calcula la fecha en la que arrancaría la suscripción de este paciente si
 * ya tiene un programa activo. Si no tiene ninguno, devuelve null (arranca
 * al instante). Si tiene, devuelve la fecha de fin del programa actual.
 *
 * Considera:
 *  - subscriptionEnd derivado de subscriptionStartDate + subscriptionPeriodMonths.
 *  - Un SubscriptionRenewal "active" con endDate futuro (más preciso).
 * Toma el máximo de los dos por si acaso hay incoherencia.
 */
export async function computeScheduledStartFor(patientId: string): Promise<Date | null> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { subscriptionStartDate: true, subscriptionPeriodMonths: true },
  });
  const derivedEnd = patient?.subscriptionStartDate
    ? new Date(new Date(patient.subscriptionStartDate).setMonth(
        new Date(patient.subscriptionStartDate).getMonth() +
          (patient.subscriptionPeriodMonths ?? 0)
      ))
    : null;

  const activeRenewal = await prisma.subscriptionRenewal.findFirst({
    where: { patientId, status: "active", endDate: { not: null } },
    orderBy: { endDate: "desc" },
    select: { endDate: true },
  });

  const now = new Date();
  const candidates = [derivedEnd, activeRenewal?.endDate ?? null]
    .filter((d): d is Date => !!d && d > now);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.getTime() - a.getTime())[0];
}

/**
 * Crea la PatientSubscription tras un checkout Stripe exitoso.
 *
 *  - Si el paciente ya tiene un programa activo, la suscripción queda
 *    "scheduled" con scheduledStartAt = fin del programa anterior.
 *  - Si no, arranca en "trialing" (los 4 días de prueba antes del cobro).
 *
 * Idempotente en el stripeSubscriptionId — llamarla dos veces con el mismo
 * id no crea duplicados.
 */
export async function createPreventionSubscription(input: {
  patientId: string;
  plan: PreventionPlan;
  stripeSubscriptionId: string;
  stripeCustomerId?: string | null;
  stripePriceId?: string | null;
  originSource?: string | null;
}) {
  const existing = await prisma.patientSubscription.findUnique({
    where: { stripeSubscriptionId: input.stripeSubscriptionId },
  });
  if (existing) return existing;

  const cfg = PREVENTION_PLAN_CONFIG[input.plan];
  const scheduledStartAt = await computeScheduledStartFor(input.patientId);

  const now = new Date();
  const trialEndsAt = scheduledStartAt
    ? null // si arranca diferido, no hay trial: cuando toca, ya cobra
    : new Date(now.getTime() + PREVENTION_TRIAL_DAYS * 86400_000);

  const currentPeriodStart = scheduledStartAt ?? now;
  const currentPeriodEnd = new Date(currentPeriodStart);
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + cfg.intervalMonths);

  return prisma.patientSubscription.create({
    data: {
      patientId: input.patientId,
      productType: "prevention",
      plan: input.plan,
      amountCents: cfg.amountCents,
      currency: "eur",
      status: scheduledStartAt ? "scheduled" : "trialing",
      trialEndsAt,
      currentPeriodStart,
      currentPeriodEnd,
      scheduledStartAt,
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripePriceId: input.stripePriceId ?? null,
      originSource: input.originSource ?? null,
    },
  });
}

/**
 * Activa una suscripción "scheduled" cuando le llega el momento. Idempotente.
 * Llamada desde el cron diario que barre scheduledStartAt <= now.
 */
export async function activateScheduledSubscription(subId: string) {
  const sub = await prisma.patientSubscription.findUnique({ where: { id: subId } });
  if (!sub || sub.status !== "scheduled") return sub;
  return prisma.patientSubscription.update({
    where: { id: subId },
    data: {
      status: "active",
      // Al activarse tarde, arrancamos el ciclo en el momento real de activación
      currentPeriodStart: new Date(),
    },
  });
}

/**
 * Marca la suscripción para no renovar al terminar el periodo actual.
 * Stripe la conserva hasta currentPeriodEnd y allí la finaliza; nosotros
 * reflejamos con cancelAtPeriodEnd=true de inmediato.
 */
export async function markCancelAtPeriodEnd(subId: string) {
  return prisma.patientSubscription.update({
    where: { id: subId },
    data: { cancelAtPeriodEnd: true },
  });
}
