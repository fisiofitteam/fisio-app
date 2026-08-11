// Lógica compartida para crear un periodo de suscripción (renovación).
// La usa el webhook de Stripe al confirmarse el pago de una renovación, con la
// misma semántica que el alta manual de /api/renewals (anticipada → scheduled,
// vencida/sin activo → active cerrando el anterior).
import { prisma } from "@/lib/prisma";

export type RenewalActivityRow = {
  patientId: string;
  assignedProfessionalId: string | null;
  outcome: "renewed" | "lost";
  /** Fecha de atribución: MIN(endDate del previo, decidedAt del follow-up) para
   *  renewed; endDate del previo para lost. */
  when: Date;
  amountPaid: number | null; // solo aplica a renovadas
};

/**
 * Atribución de una renovación al mes correspondiente. Regla simple
 * (2026-08-11, decisión final):
 *
 *   attributionDate = followUp.decidedAt
 *
 * Es decir, la renovación cuenta siempre en el mes en que se
 * decidió/pagó/registró — coherente con "el fisio cobra en el mes en
 * que trabajó por conseguir la renovación".
 *
 * Historial de esta decisión:
 *  - 06-ago: probamos endDate del previo (regla de Alberto). Contra-
 *    intuitivo para renovaciones anticipadas.
 *  - 11-ago-mañana: probamos MIN(endDate, decidedAt). Contra-intuitivo
 *    para renovaciones tardías (Manolo/Joselín pagaron en agosto pero
 *    aparecían en julio).
 *  - 11-ago-tarde: dejamos la regla simple decidedAt del follow-up.
 *
 * Las pérdidas se siguen atribuyendo al mes de vencimiento del previo,
 * capado a hoy (no marcar como perdido algo que aún tiene margen).
 */
type HistoryRow = {
  id: string;
  patientId: string;
  startDate: Date | null;
  endDate: Date | null;
  decidedAt: Date;
  amountPaid: number | null;
  status: string;
  isReservation: boolean;
};

/**
 * Para cada follow-up (no alta inicial, no reserva) del histórico devuelve
 * su fecha de atribución. Un follow-up es una renovación cuyo previo
 * (registro con startDate anterior más cercano) tiene endDate finito.
 */
function attributionsFor(historyByPatient: Map<string, HistoryRow[]>): Array<{
  followUp: HistoryRow;
  previous: HistoryRow;
  attribution: Date;
}> {
  const attrs: Array<{ followUp: HistoryRow; previous: HistoryRow; attribution: Date }> = [];
  for (const [, list] of historyByPatient) {
    // Solo consideramos los "reales" para follow-ups y previos (reservas
    // fuera). Ordenados por startDate asc.
    const real = list
      .filter((h) => !h.isReservation && h.startDate)
      .sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));
    for (let i = 1; i < real.length; i++) {
      const follow = real[i];
      const previous = real[i - 1];
      // Margen de 1 día: si el follow-up arranca a partir de endDate del
      // previo (o el día antes), lo consideramos su renovación.
      if (!previous.endDate || !follow.startDate) continue;
      const cutoff = previous.endDate.getTime() - 86400000;
      if (follow.startDate.getTime() < cutoff) continue; // gap grande, no es follow-up directo
      attrs.push({ followUp: follow, previous, attribution: follow.decidedAt });
    }
  }
  return attrs;
}

/** Carga el histórico completo de renovaciones (con reservas) para un set de
 *  pacientes agrupado por patientId. */
async function loadHistoryFor(patientIds: string[]): Promise<Map<string, HistoryRow[]>> {
  const rows = await prisma.subscriptionRenewal.findMany({
    where: { patientId: { in: patientIds } },
    select: {
      id: true,
      patientId: true,
      startDate: true,
      endDate: true,
      decidedAt: true,
      amountPaid: true,
      status: true,
      isReservation: true,
    },
  });
  const map = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    if (!map.has(r.patientId)) map.set(r.patientId, []);
    map.get(r.patientId)!.push(r);
  }
  return map;
}

export async function getRenewalActivityInPeriod(from: Date, to: Date): Promise<RenewalActivityRow[]> {
  const now = new Date();
  if (from.getTime() > now.getTime()) return [];
  const effectiveToForLost = to.getTime() > now.getTime() ? now : to;

  // Candidatos que pueden aportar attribution en [from, to]:
  //   (A) follow-ups con decidedAt en el rango (anticipadas)
  //   (B) periodos con endDate en el rango (previos de renovadas tardías + lost)
  const [followUpsByDecision, endedInRange] = await Promise.all([
    prisma.subscriptionRenewal.findMany({
      where: {
        decidedAt: { gte: from, lte: to },
        isReservation: false,
        patient: { isTest: false },
      },
      select: { id: true, patientId: true },
    }),
    prisma.subscriptionRenewal.findMany({
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
    }),
  ]);

  const patientIds = Array.from(new Set([
    ...followUpsByDecision.map((f) => f.patientId),
    ...endedInRange.map((e) => e.patientId),
  ]));
  if (patientIds.length === 0) return [];

  const [history, patientProfs] = await Promise.all([
    loadHistoryFor(patientIds),
    prisma.patient.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, assignedProfessionalId: true },
    }),
  ]);
  const profByPatient = new Map(patientProfs.map((p) => [p.id, p.assignedProfessionalId]));

  const result: RenewalActivityRow[] = [];
  const countedAsRenewedPreviousIds = new Set<string>();

  // RENEWED: attribution = MIN(previo.endDate, followUp.decidedAt) en [from, to]
  for (const a of attributionsFor(history)) {
    if (a.attribution.getTime() < from.getTime()) continue;
    if (a.attribution.getTime() > to.getTime()) continue;
    result.push({
      patientId: a.followUp.patientId,
      assignedProfessionalId: profByPatient.get(a.followUp.patientId) ?? null,
      outcome: "renewed",
      when: a.attribution,
      amountPaid: a.followUp.amountPaid,
    });
    countedAsRenewedPreviousIds.add(a.previous.id);
  }

  // LOST: periodos con endDate en [from, effectiveToForLost] sin follow-up
  for (const e of endedInRange) {
    if (!e.endDate) continue;
    if (e.endDate.getTime() > effectiveToForLost.getTime()) continue;
    if (countedAsRenewedPreviousIds.has(e.id)) continue;
    result.push({
      patientId: e.patientId,
      assignedProfessionalId: e.patient?.assignedProfessionalId ?? null,
      outcome: "lost",
      when: e.endDate,
      amountPaid: null,
    });
  }
  return result;
}

export type RealRenewalRow = {
  id: string;
  patientId: string;
  amountPaid: number | null;
  assignedProfessionalId: string | null;
  decidedAt: Date; // fecha de atribución (MIN previo.endDate, followUp.decidedAt)
  status: string;
};

/**
 * Devuelve las RENOVACIONES REALES atribuidas al rango por la regla
 * híbrida MIN(previo.endDate, followUp.decidedAt).
 *
 * `decidedAt` en la fila devuelta = fecha de atribución (no el decidedAt
 * real del registro), para que las gráficas por mes coincidan con las
 * demás métricas.
 */
export async function listRealRenewalsInPeriod(from: Date, to: Date): Promise<RealRenewalRow[]> {
  const [followUpsByDecision, endedInRange] = await Promise.all([
    prisma.subscriptionRenewal.findMany({
      where: {
        decidedAt: { gte: from, lte: to },
        isReservation: false,
        patient: { isTest: false },
      },
      select: { id: true, patientId: true },
    }),
    prisma.subscriptionRenewal.findMany({
      where: {
        endDate: { gte: from, lte: to },
        isReservation: false,
        patient: { isTest: false },
      },
      select: { id: true, patientId: true },
    }),
  ]);

  const patientIds = Array.from(new Set([
    ...followUpsByDecision.map((f) => f.patientId),
    ...endedInRange.map((e) => e.patientId),
  ]));
  if (patientIds.length === 0) return [];

  const [history, patientProfs] = await Promise.all([
    loadHistoryFor(patientIds),
    prisma.patient.findMany({
      where: { id: { in: patientIds } },
      select: { id: true, assignedProfessionalId: true },
    }),
  ]);
  const profByPatient = new Map(patientProfs.map((p) => [p.id, p.assignedProfessionalId]));

  const result: RealRenewalRow[] = [];
  for (const a of attributionsFor(history)) {
    if (a.attribution.getTime() < from.getTime()) continue;
    if (a.attribution.getTime() > to.getTime()) continue;
    result.push({
      id: a.followUp.id,
      patientId: a.followUp.patientId,
      amountPaid: a.followUp.amountPaid,
      assignedProfessionalId: profByPatient.get(a.followUp.patientId) ?? null,
      decidedAt: a.attribution,
      status: a.followUp.status,
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

  // NOTA: NO creamos Transaction aquí. Antes lo hacíamos con el importe
  // total, pero eso duplicaba en pagos vía PayPal (el webhook ya registra
  // una Transaction por cuota) y en el flujo manual (POST /api/renewals
  // que también crea la Transaction directamente). El caller es responsable
  // de crear su(s) Transaction(s) según el flujo (una por cuota en
  // suscripción, una total en pago único o manual).

  return { renewalId: renewal.id, status };
}
