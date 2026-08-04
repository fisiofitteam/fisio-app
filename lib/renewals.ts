// Lógica compartida para crear un periodo de suscripción (renovación).
// La usa el webhook de Stripe al confirmarse el pago de una renovación, con la
// misma semántica que el alta manual de /api/renewals (anticipada → scheduled,
// vencida/sin activo → active cerrando el anterior).
import { prisma } from "@/lib/prisma";

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
