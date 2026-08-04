// Lógica compartida para crear un periodo de suscripción (renovación).
// La usa el webhook de Stripe al confirmarse el pago de una renovación, con la
// misma semántica que el alta manual de /api/renewals (anticipada → scheduled,
// vencida/sin activo → active cerrando el anterior).
import { prisma } from "@/lib/prisma";

export type RenewalOpportunity = {
  /** ID del SubscriptionRenewal cuyo endDate cae en el rango (el periodo que "vence"). */
  endedPeriodId: string;
  patientId: string;
  assignedProfessionalId: string | null;
  endDate: Date;
  /** "renewed" si el paciente tiene un periodo posterior; "lost" si no. */
  outcome: "renewed" | "lost";
  /** Si renovada, ID e importe del periodo posterior. */
  renewalId: string | null;
  renewalAmount: number | null;
};

/**
 * "Oportunidades de renovación" que caen dentro del rango: cualquier
 * SubscriptionRenewal cuyo `endDate` está en [from, to] cuenta como una
 * decisión que el paciente tuvo que tomar en ese periodo.
 *
 * Se clasifican:
 *   - "renewed": el paciente tiene otro SubscriptionRenewal cuyo startDate
 *     empieza en o después del endDate del que vence.
 *   - "lost": no hay periodo posterior → el paciente no renovó.
 *
 * Esta es la definición canónica de "renewal rate" (denominador =
 * chances de renovar, numerador = quienes renovaron). Distinta de
 * `listRealRenewalsInPeriod`, que cuenta DECISIONES de renovación por
 * fecha de creación (útil para comisiones).
 *
 * Pacientes fantasma (isTest) quedan fuera.
 */
export async function getRenewalOpportunitiesInPeriod(from: Date, to: Date): Promise<RenewalOpportunity[]> {
  const ended = await prisma.subscriptionRenewal.findMany({
    where: {
      endDate: { gte: from, lte: to },
      patient: { isTest: false },
    },
    select: {
      id: true,
      patientId: true,
      endDate: true,
      patient: { select: { assignedProfessionalId: true } },
    },
  });
  if (ended.length === 0) return [];

  const patientIds = Array.from(new Set(ended.map((e) => e.patientId)));
  const allPeriods = await prisma.subscriptionRenewal.findMany({
    where: { patientId: { in: patientIds } },
    select: { id: true, patientId: true, startDate: true, amountPaid: true },
  });

  return ended.map((e) => {
    // Un follow-up cuenta si empieza EXACTAMENTE cuando o después vence
    // el periodo actual (permitimos 1 día de margen para pillar los que
    // renovaron en el mismo día o al día siguiente).
    const cutoff = e.endDate ? new Date(e.endDate.getTime() - 86400000) : null;
    const followUp = cutoff
      ? allPeriods.find(
          (p) => p.patientId === e.patientId && p.id !== e.id && p.startDate && p.startDate.getTime() >= cutoff.getTime(),
        )
      : null;
    return {
      endedPeriodId: e.id,
      patientId: e.patientId,
      assignedProfessionalId: e.patient?.assignedProfessionalId ?? null,
      endDate: e.endDate!,
      outcome: followUp ? "renewed" : "lost",
      renewalId: followUp?.id ?? null,
      renewalAmount: followUp?.amountPaid ?? null,
    };
  });
}

export type RealRenewalRow = {
  id: string;
  patientId: string;
  amountPaid: number | null;
  assignedProfessionalId: string | null;
  decidedAt: Date;
  status: string;
};

/**
 * Devuelve las RENOVACIONES REALES cuyo `decidedAt` cae dentro del rango.
 *
 * "Renovación real" = el paciente ya tenía al menos otro `SubscriptionRenewal`
 * previo con `decidedAt` anterior. Excluimos el alta inicial, que sí crea
 * también un SubscriptionRenewal pero no cuenta como renovación.
 *
 * Necesario porque el campo `outcome` del modelo es LEGACY — el código
 * antiguo filtraba por `outcome === "renewed"` pero los nuevos periodos no
 * lo setean, así que las métricas de renovación se iban a 0. Con este
 * helper unificamos el criterio (mismo que compensation.ts).
 */
export async function listRealRenewalsInPeriod(from: Date, to: Date): Promise<RealRenewalRow[]> {
  const periodRenewals = await prisma.subscriptionRenewal.findMany({
    where: { decidedAt: { gte: from, lte: to } },
    select: {
      id: true,
      patientId: true,
      decidedAt: true,
      amountPaid: true,
      status: true,
      patient: { select: { assignedProfessionalId: true, isTest: true } },
    },
  });
  if (periodRenewals.length === 0) return [];

  // Cargamos el historial completo de los pacientes implicados en una
  // sola query para poder distinguir alta vs renovación sin N+1.
  const patientIds = Array.from(new Set(periodRenewals.map((r) => r.patientId)));
  const history = await prisma.subscriptionRenewal.findMany({
    where: { patientId: { in: patientIds } },
    select: { id: true, patientId: true, decidedAt: true },
  });

  const priorCounts = new Map<string, number>();
  for (const r of periodRenewals) {
    priorCounts.set(
      r.id,
      history.filter((h) => h.patientId === r.patientId && h.id !== r.id && h.decidedAt < r.decidedAt).length,
    );
  }

  return periodRenewals
    // Alta inicial: sin periodo previo → no cuenta como renovación.
    .filter((r) => (priorCounts.get(r.id) ?? 0) > 0)
    // Fantasma fuera de KPIs.
    .filter((r) => !r.patient?.isTest)
    .map((r) => ({
      id: r.id,
      patientId: r.patientId,
      amountPaid: r.amountPaid,
      assignedProfessionalId: r.patient?.assignedProfessionalId ?? null,
      decidedAt: r.decidedAt,
      status: r.status,
    }));
}

export async function applyRenewal(opts: {
  patientId: string;
  programType: string;
  periodMonths: number;
  amountPaid?: number | null;
  professionalId?: string | null;
  notes?: string | null;
}): Promise<{ renewalId: string; status: "active" | "scheduled" }> {
  const { patientId, programType, professionalId } = opts;
  const months = Number(opts.periodMonths) || 4;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activePeriod = await prisma.subscriptionRenewal.findFirst({
    where: { patientId, status: "active" },
    orderBy: { startDate: "desc" },
  });

  let startDate: Date;
  let status: "active" | "scheduled";

  if (activePeriod && activePeriod.endDate && activePeriod.endDate > today) {
    // Renovación anticipada: el nuevo empieza cuando acaba el actual
    startDate = activePeriod.endDate;
    status = "scheduled";
  } else {
    // No hay activo o ya venció: cerramos cualquier "active" colgado y arrancamos hoy
    await prisma.subscriptionRenewal.updateMany({
      where: { patientId, status: "active" },
      data: { status: "finished", endDate: today },
    });
    startDate = today;
    status = "active";
  }

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + months);

  const renewal = await prisma.subscriptionRenewal.create({
    data: {
      patientId,
      programType,
      periodMonths: months,
      startDate,
      endDate,
      status,
      amountPaid: opts.amountPaid != null ? Number(opts.amountPaid) : null,
      notes: opts.notes?.trim() || null,
    },
  });

  // Si el nuevo es ACTIVE, pasa a ser el periodo vigente del paciente
  if (status === "active") {
    await prisma.patient.update({
      where: { id: patientId },
      data: { programType, subscriptionStartDate: startDate, subscriptionPeriodMonths: months },
    });
  }

  // Recalcular total acumulado de meses
  const all = await prisma.subscriptionRenewal.findMany({
    where: { patientId },
    select: { periodMonths: true },
  });
  const total = all.reduce((sum, r) => sum + (r.periodMonths || 0), 0);
  await prisma.patient.update({
    where: { id: patientId },
    data: { subscriptionTotalMonths: total },
  });

  // Ingreso income_renewal si hay importe
  if (opts.amountPaid && Number(opts.amountPaid) > 0) {
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    await prisma.transaction.create({
      data: {
        type: "income_renewal",
        amount: Number(opts.amountPaid),
        description: `Renovación - ${patient?.fullName ?? ""} (${programType}, ${months}m)`,
        occurredAt: new Date(),
        patientId,
        professionalId: professionalId || null,
      },
    });
  }

  return { renewalId: renewal.id, status };
}
