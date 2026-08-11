// Lógica compartida para crear un periodo de suscripción (renovación).
// La usa el webhook de Stripe al confirmarse el pago de una renovación, con la
// misma semántica que el alta manual de /api/renewals (anticipada → scheduled,
// vencida/sin activo → active cerrando el anterior).
import { prisma } from "@/lib/prisma";

export type RenewalActivityRow = {
  patientId: string;
  assignedProfessionalId: string | null;
  outcome: "renewed" | "lost";
  /** Para renovadas, startDate del nuevo periodo. Para perdidas, endDate del que vence. */
  when: Date;
  amountPaid: number | null; // solo aplica a renovadas
};

/**
 * Actividad de renovaciones que cae dentro de un rango. Ambas ramas
 * (renewed y lost) se atribuyen al MES EN QUE VENCÍA EL PROGRAMA DEL
 * PACIENTE = `endDate` del periodo previo. Regla decidida con Alberto:
 * las métricas y la factura fisio→CEO reflejan la decisión del cliente
 * en el mes en que le acababa el programa, no cuando el fisio registra
 * la transacción ni cuando arranca el nuevo periodo.
 *
 *   - "renewed" ← periodo con `endDate` en el rango que tiene follow-up
 *     (otro SubscriptionRenewal real —no reserva— del mismo paciente
 *     con `startDate >= endDate - 1 día`).
 *
 *   - "lost" ← periodo con `endDate` en el rango sin follow-up.
 *
 * Pacientes fantasma (isTest) y reservas de plaza quedan fuera. Las
 * renovaciones tempranas donde el `endDate` del previo aún es futuro
 * respecto al `to` NO cuentan en este rango (cuentan en el mes real
 * en que vencía el previo).
 */
export async function getRenewalActivityInPeriod(from: Date, to: Date): Promise<RenewalActivityRow[]> {
  const now = new Date();
  if (from.getTime() > now.getTime()) return [];

  // Distinción clave:
  //  - RENEWED se cuenta si el paciente YA hizo la renovación anticipada,
  //    aunque el periodo previo aún no haya vencido físicamente. Ejemplo:
  //    Joselín renovó en agosto; su previo vencía el 25 de agosto y estamos
  //    a día 11. La decisión ya está tomada → cuenta en agosto.
  //  - LOST solo se cuenta si el periodo ya venció (endDate <= hoy) sin
  //    follow-up. No queremos marcar como "perdido" algo que aún tiene
  //    margen para renovar.
  //
  // Solo el filtro de LOST se capa al momento actual.
  const effectiveToForLost = to.getTime() > now.getTime() ? now : to;

  // Periodos cuya fecha de vencimiento cae en el rango completo (sin capar).
  const endedInPeriod = await prisma.subscriptionRenewal.findMany({
    where: {
      endDate: { gte: from, lte: to },
      isReservation: false,
      patient: { isTest: false },
    },
    select: {
      id: true,
      patientId: true,
      endDate: true,
      patient: { select: { assignedProfessionalId: true } },
    },
  });
  if (endedInPeriod.length === 0) return [];

  // Traemos el resto del historial (real) de esos pacientes para localizar
  // follow-ups sin N+1. Solo periodos "reales" cuentan como follow-up: una
  // reserva de plaza no cierra el ciclo, solo lo aplaza.
  const patientIds = Array.from(new Set(endedInPeriod.map((e) => e.patientId)));
  const followUps = await prisma.subscriptionRenewal.findMany({
    where: {
      patientId: { in: patientIds },
      isReservation: false,
    },
    select: { id: true, patientId: true, startDate: true, amountPaid: true },
  });

  const result: RenewalActivityRow[] = [];
  for (const e of endedInPeriod) {
    if (!e.endDate) continue;
    // Margen de 1 día: renovación creada el mismo día o al siguiente cuenta.
    const cutoff = new Date(e.endDate.getTime() - 86400000);
    const followUp = followUps.find(
      (h) => h.patientId === e.patientId && h.id !== e.id && h.startDate && h.startDate.getTime() >= cutoff.getTime(),
    );
    if (followUp) {
      // La decisión ya está tomada — cuenta en el mes de vencimiento del
      // previo aunque ese vencimiento sea futuro.
      result.push({
        patientId: e.patientId,
        assignedProfessionalId: e.patient?.assignedProfessionalId ?? null,
        outcome: "renewed",
        when: e.endDate,
        amountPaid: followUp.amountPaid,
      });
    } else if (e.endDate.getTime() <= effectiveToForLost.getTime()) {
      // Perdido solo si ya venció físicamente sin follow-up.
      result.push({
        patientId: e.patientId,
        assignedProfessionalId: e.patient?.assignedProfessionalId ?? null,
        outcome: "lost",
        when: e.endDate,
        amountPaid: null,
      });
    }
    // Sin follow-up y aún no venció → todavía tiene margen; no cuenta.
  }
  return result;
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
 * Devuelve las RENOVACIONES REALES atribuidas a un rango por
 * `endDate` DEL PERIODO PREVIO (mes en que le vencía el programa al
 * paciente), no por `decidedAt` ni por `startDate` del nuevo.
 *
 * "Renovación real" = follow-up de un periodo previo — el paciente ya
 * tenía otro SubscriptionRenewal cuyo endDate cae en el rango. Excluye
 * altas iniciales, reservas de plaza y pacientes fantasma.
 *
 * `decidedAt` en la fila devuelta se rellena con el `endDate` del previo
 * (la fecha de atribución), no con el decidedAt real del registro, para
 * que las gráficas por mes agrupen bien y coincidan con las métricas de
 * renovación (regla acordada con Alberto, 2026-08-06).
 */
export async function listRealRenewalsInPeriod(from: Date, to: Date): Promise<RealRenewalRow[]> {
  // Sin cap a hoy: una renovación anticipada donde el previo aún no ha
  // vencido (endDate futuro) cuenta igual — la decisión está tomada.
  const ended = await prisma.subscriptionRenewal.findMany({
    where: {
      endDate: { gte: from, lte: to },
      isReservation: false,
      patient: { isTest: false },
    },
    select: {
      id: true,
      patientId: true,
      endDate: true,
      patient: { select: { assignedProfessionalId: true, isTest: true } },
    },
  });
  if (ended.length === 0) return [];

  const patientIds = Array.from(new Set(ended.map((e) => e.patientId)));
  const followUps = await prisma.subscriptionRenewal.findMany({
    where: {
      patientId: { in: patientIds },
      isReservation: false,
    },
    select: { id: true, patientId: true, startDate: true, amountPaid: true, status: true },
  });

  const result: RealRenewalRow[] = [];
  for (const e of ended) {
    if (!e.endDate) continue;
    const cutoff = new Date(e.endDate.getTime() - 86400000);
    const followUp = followUps.find(
      (h) => h.patientId === e.patientId && h.id !== e.id && h.startDate && h.startDate.getTime() >= cutoff.getTime(),
    );
    if (!followUp) continue;
    result.push({
      id: followUp.id,
      patientId: e.patientId,
      amountPaid: followUp.amountPaid,
      assignedProfessionalId: e.patient?.assignedProfessionalId ?? null,
      decidedAt: e.endDate, // atribución: mes en que vencía el previo
      status: followUp.status,
    });
  }
  return result;
}

export async function applyRenewal(opts: {
  patientId: string;
  programType: string;
  periodMonths: number;
  amountPaid?: number | null;
  professionalId?: string | null;
  notes?: string | null;
  /** Reserva de plaza: marca el SubscriptionRenewal como reserva (badge). */
  isReservation?: boolean;
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
      isReservation: opts.isReservation === true,
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
