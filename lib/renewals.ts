// Lógica compartida para crear un periodo de suscripción (renovación).
// La usa el webhook de Stripe al confirmarse el pago de una renovación, con la
// misma semántica que el alta manual de /api/renewals (anticipada → scheduled,
// vencida/sin activo → active cerrando el anterior).
import { prisma } from "@/lib/prisma";

export type RenewalActivityRow = {
  patientId: string;
  assignedProfessionalId: string | null;
  outcome: "renewed" | "lost";
  /** Para renovadas, decidedAt. Para perdidas, endDate. */
  when: Date;
  amountPaid: number | null; // solo aplica a renovadas
};

/**
 * Actividad de renovaciones que cae dentro de un rango, contada tal
 * como se ve desde el punto de vista del negocio:
 *
 *   - "renewed" ← SubscriptionRenewal cuyo `decidedAt` está en el rango
 *     Y el paciente ya tenía un periodo anterior (excluye alta inicial).
 *     Se atribuye al MES DE DECISIÓN, así una renovación cerrada en
 *     agosto cuenta en agosto, aunque el periodo previo terminase en
 *     julio.
 *
 *   - "lost" ← SubscriptionRenewal cuyo `endDate` está en el rango Y
 *     NO existe follow-up (ningún periodo del mismo paciente con
 *     startDate >= endDate). Se atribuye al MES DE VENCIMIENTO.
 *
 * De este modo las métricas del mes reflejan la actividad real:
 * cierres de renovación + bajas por no-renovación. El rate es una
 * proxy útil (renewed / (renewed + lost)) sabiendo que no es
 * matemáticamente el "% de una cohorte concreta" — es la mezcla de
 * cierres y bajas del periodo, que es lo que el CEO quiere ver.
 *
 * Pacientes fantasma (isTest) quedan fuera.
 */
export async function getRenewalActivityInPeriod(from: Date, to: Date): Promise<RenewalActivityRow[]> {
  // ── Renovadas: SubscriptionRenewal cuya decidedAt cae en el rango ──
  const decidedInPeriod = await prisma.subscriptionRenewal.findMany({
    where: {
      decidedAt: { gte: from, lte: to },
      patient: { isTest: false },
    },
    select: {
      id: true,
      patientId: true,
      decidedAt: true,
      amountPaid: true,
      patient: { select: { assignedProfessionalId: true } },
    },
  });

  let renewed: RenewalActivityRow[] = [];
  if (decidedInPeriod.length > 0) {
    const decIds = Array.from(new Set(decidedInPeriod.map((r) => r.patientId)));
    const decHistory = await prisma.subscriptionRenewal.findMany({
      where: { patientId: { in: decIds } },
      select: { id: true, patientId: true, decidedAt: true },
    });
    renewed = decidedInPeriod
      .filter((r) =>
        decHistory.some((h) => h.patientId === r.patientId && h.id !== r.id && h.decidedAt < r.decidedAt),
      )
      .map((r) => ({
        patientId: r.patientId,
        assignedProfessionalId: r.patient?.assignedProfessionalId ?? null,
        outcome: "renewed" as const,
        when: r.decidedAt,
        amountPaid: r.amountPaid,
      }));
  }

  // ── Perdidas: periodos que VENCEN en el rango sin follow-up ──
  const endedInPeriod = await prisma.subscriptionRenewal.findMany({
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

  let lost: RenewalActivityRow[] = [];
  if (endedInPeriod.length > 0) {
    const endIds = Array.from(new Set(endedInPeriod.map((e) => e.patientId)));
    const followUps = await prisma.subscriptionRenewal.findMany({
      where: { patientId: { in: endIds } },
      select: { id: true, patientId: true, startDate: true },
    });
    lost = endedInPeriod
      .filter((e) => {
        if (!e.endDate) return false;
        // Margen de 1 día: renovación creada el mismo día o al siguiente cuenta.
        const cutoff = new Date(e.endDate.getTime() - 86400000);
        const hasFollowUp = followUps.some(
          (h) => h.patientId === e.patientId && h.id !== e.id && h.startDate && h.startDate.getTime() >= cutoff.getTime(),
        );
        return !hasFollowUp;
      })
      .map((e) => ({
        patientId: e.patientId,
        assignedProfessionalId: e.patient?.assignedProfessionalId ?? null,
        outcome: "lost" as const,
        when: e.endDate!,
        amountPaid: null,
      }));
  }

  return [...renewed, ...lost];
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
