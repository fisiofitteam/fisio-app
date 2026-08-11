// Cálculo de la compensación mensual de un profesional según sus condiciones.
// Solo servidor (usa prisma).
import { prisma } from "@/lib/prisma";
import { activePatientCondition, currentlyPausedCondition } from "@/lib/patient-active";

// Umbral de días de vacaciones para activar descuento de salario.
// Debe coincidir con MIN_DAYS_TO_COMPENSATE en app/api/professional-leaves/route.ts.
const MIN_LEAVE_DAYS_FOR_DISCOUNT = 5;

export type CompensationConfig = {
  baseSalary: number;
  perActivePatient: number;
  renewalOwnPct: number; // % sobre renovaciones de SUS pacientes
  renewalOthersPct: number; // % sobre renovaciones del resto del equipo
  newSaleCommissionPct: number;
  newSaleScope: "own" | "all";
  notes: string | null;
};

export const DEFAULT_COMPENSATION: CompensationConfig = {
  baseSalary: 0,
  perActivePatient: 0,
  renewalOwnPct: 0,
  renewalOthersPct: 0,
  newSaleCommissionPct: 0,
  newSaleScope: "own",
  notes: null,
};

export async function getCompensation(professionalId: string): Promise<CompensationConfig> {
  const row = await prisma.compensation.findUnique({ where: { professionalId } });
  if (!row) return { ...DEFAULT_COMPENSATION };
  return {
    baseSalary: row.baseSalary,
    perActivePatient: row.perActivePatient,
    renewalOwnPct: row.renewalOwnPct,
    renewalOthersPct: row.renewalOthersPct,
    newSaleCommissionPct: row.newSaleCommissionPct,
    newSaleScope: row.newSaleScope === "all" ? "all" : "own",
    notes: row.notes,
  };
}

// Rango UTC [inicio, finExclusivo) del mes (year, month 0-11)
export function monthRangeUTC(year: number, month: number) {
  return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) };
}

export type SalaryResult = {
  config: CompensationConfig;
  activePatients: number;
  renewalOwnCount: number;
  renewalOwnRevenue: number;
  renewalOthersRevenue: number;
  newSaleCount: number;
  newSaleRevenue: number;
  /** Días naturales del mes (28, 30 ó 31) usados para la regla de 3 del descuento. */
  daysInMonth: number;
  /** Días de vacaciones del profesional cuyo rango [startDate, endDate] cae dentro del mes,
   *  contando solo las ausencias con totalDays >= 5 (umbral de compensación). */
  vacationDaysInMonth: number;
  breakdown: {
    fixed: number;
    patients: number;
    renewals: number;
    newSales: number;
    /** Descuento por vacaciones (siempre ≤ 0). Se aplica sobre el bruto del mes
     *  con regla de 3: (bruto / díasMes) × díasVacacionesEnMes. */
    vacation: number;
  };
  /** Bruto antes de descuento, útil para mostrar el desglose en métricas. */
  grossTotal: number;
  total: number;
};

export async function computeMonthlySalary(
  professionalId: string,
  year: number,
  month: number
): Promise<SalaryResult> {
  const config = await getCompensation(professionalId);
  const { start, end } = monthRangeUTC(year, month);

  // Pacientes por los que el fisio COBRA este mes (snapshot actual):
  //   - Asignados a él
  //   - Con SubscriptionRenewal activo y endDate en el futuro (no terminados)
  //   - No en pausa activa hoy (durante la pausa NO se factura porque el
  //     paciente no está recibiendo servicio)
  //   - No pacientes fantasma
  //
  // Antes usábamos `onboardingStatus: "active"`, que solo marca "acabó el
  // onboarding" (anamnesis + contrato). Eso incluía terminados y pausados,
  // por eso Sofía veía 21 en factura cuando solo tenía 15 activos. Ahora
  // usamos el mismo criterio real de "activo" que la app entera.
  const activePatients = await prisma.patient.count({
    where: {
      assignedProfessionalId: professionalId,
      isTest: false,
      ...activePatientCondition(),
      NOT: currentlyPausedCondition(),
    },
  });

  // Renovaciones del mes: propias vs resto del equipo.
  //
  // Ojo: el modelo SubscriptionRenewal representa "periodo de suscripcion"
  // — incluye el ALTA INICIAL, no solo renovaciones. Para compensacion
  // solo cuentan las verdaderas renovaciones: aquellas donde ya existia
  // otro periodo previo para el mismo paciente antes de este.
  //
  // Estrategia: traemos los periodos del mes con la fecha (decidedAt) y,
  // por paciente, comprobamos si el atleta tiene periodos anteriores a
  // ese decidedAt. Si no, es el alta inicial y no computa como renovacion.
  // Renovaciones atribuidas al mes con la regla híbrida (2026-08-11):
  //   attributionDate = MIN(previo.endDate, followUp.decidedAt)
  //
  //  - Renovación tardía (previo venció ANTES de que se decidiera): cuenta
  //    en el mes de vencimiento del previo (petición original de Alberto).
  //  - Renovación anticipada (se decidió ANTES de que venciera el previo):
  //    cuenta en el mes de decisión (para que el fisio la vea en su
  //    factura del mes que trabajó por conseguirla).
  //
  // Las reservas de plaza no cuentan en count, pero sí suman al revenue
  // por ser ingreso efectivo. Se contabilizan como cualquier follow-up.
  const monthStart = start;
  const monthEnd = end; // exclusivo

  // Candidatos: renovaciones cuya decidedAt cae en el mes (anticipadas) o
  // cuyo previo tiene endDate en el mes (tardías + puntuales).
  const [decisionsInMonth, endedInMonth] = await Promise.all([
    prisma.subscriptionRenewal.findMany({
      where: {
        decidedAt: { gte: monthStart, lt: monthEnd },
        isReservation: false,
        patient: { isTest: false },
      },
      select: { patientId: true },
    }),
    prisma.subscriptionRenewal.findMany({
      where: {
        endDate: { gte: monthStart, lt: monthEnd },
        isReservation: false,
        patient: { isTest: false },
      },
      select: { patientId: true },
    }),
  ]);

  const patientIds = Array.from(new Set([
    ...decisionsInMonth.map((r) => r.patientId),
    ...endedInMonth.map((r) => r.patientId),
  ]));

  let renewalOwnCount = 0;
  let renewalOwnRevenue = 0;
  let renewalOthersRevenue = 0;

  if (patientIds.length > 0) {
    const [history, patientsInfo] = await Promise.all([
      prisma.subscriptionRenewal.findMany({
        where: { patientId: { in: patientIds } },
        select: {
          id: true,
          patientId: true,
          startDate: true,
          endDate: true,
          decidedAt: true,
          amountPaid: true,
          isReservation: true,
        },
      }),
      prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: { id: true, assignedProfessionalId: true },
      }),
    ]);

    const profByPatient = new Map(patientsInfo.map((p) => [p.id, p.assignedProfessionalId]));

    // Agrupar histórico por paciente y ordenar por startDate asc
    const historyByPatient = new Map<string, typeof history>();
    for (const h of history) {
      if (!historyByPatient.has(h.patientId)) historyByPatient.set(h.patientId, []);
      historyByPatient.get(h.patientId)!.push(h);
    }

    for (const [patientId, list] of historyByPatient) {
      const real = list
        .filter((h) => !h.isReservation && h.startDate)
        .sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));
      for (let i = 1; i < real.length; i++) {
        const follow = real[i];
        const previous = real[i - 1];
        if (!previous.endDate || !follow.startDate) continue;
        const cutoff = previous.endDate.getTime() - 86400000;
        if (follow.startDate.getTime() < cutoff) continue;
        const attributionMs = Math.min(previous.endDate.getTime(), follow.decidedAt.getTime());
        if (attributionMs < monthStart.getTime() || attributionMs >= monthEnd.getTime()) continue;

        const isOwn = profByPatient.get(patientId) === professionalId;
        const amt = follow.amountPaid || 0;
        if (isOwn) {
          if (!follow.isReservation) renewalOwnCount++;
          renewalOwnRevenue += amt;
        } else {
          renewalOthersRevenue += amt;
        }
      }
    }
  }

  // Ventas nuevas pagadas del mes
  const sales = await prisma.sale.findMany({
    where: {
      status: "paid",
      paidAt: { gte: start, lt: end },
      ...(config.newSaleScope === "own" ? { closerId: professionalId } : {}),
    },
    select: { amountCents: true },
  });
  const newSaleCount = sales.length;
  const newSaleRevenue = sales.reduce((s, x) => s + (x.amountCents || 0), 0) / 100;

  // Días naturales del mes (UTC) — base para la regla de 3 del descuento.
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86400000);

  // Vacaciones del profesional que se solapan con este mes.
  // Solo cuentan las que duran >= MIN_LEAVE_DAYS_FOR_DISCOUNT (igual al umbral
  // de compensación a pacientes). Para cada una, contamos los días naturales
  // del rango que caen DENTRO de [start, end).
  //
  // Los estados válidos en ProfessionalLeave son "scheduled", "applied" y
  // "cancelled" — descartamos únicamente las canceladas. (Antes filtrábamos
  // por ["pending", "applied"], pero "pending" NO existe como estado, así
  // que las vacaciones aún no procesadas por el cron `process-pauses`
  // — o cualquier caso en el que el status siguiera siendo "scheduled" —
  // no salían nunca en la factura del mes.)
  const leaves = await prisma.professionalLeave.findMany({
    where: {
      professionalId,
      status: { not: "cancelled" },
      // Solapamiento con el mes: startDate < end AND endDate >= start.
      startDate: { lt: end },
      endDate: { gte: start },
    },
    select: { startDate: true, endDate: true },
  });

  let vacationDaysInMonth = 0;
  for (const l of leaves) {
    const ls = new Date(l.startDate);
    const le = new Date(l.endDate);
    // totalDays del rango completo (no del recorte mensual): controla el umbral.
    const totalDays = Math.round((le.getTime() - ls.getTime()) / 86400000) + 1;
    if (totalDays < MIN_LEAVE_DAYS_FOR_DISCOUNT) continue;

    // Recorte del rango al mes en curso.
    const clipStart = ls < start ? start : ls;
    // endDate es inclusivo en el modelo → para contar días sumamos +1 al diff.
    const leaveEndExclusive = new Date(le.getTime() + 86400000);
    const clipEndExclusive = leaveEndExclusive > end ? end : leaveEndExclusive;
    const days = Math.max(0, Math.round((clipEndExclusive.getTime() - clipStart.getTime()) / 86400000));
    vacationDaysInMonth += days;
  }

  const fixed = config.baseSalary;
  const patients = config.perActivePatient * activePatients;
  const renewals =
    (config.renewalOwnPct / 100) * renewalOwnRevenue +
    (config.renewalOthersPct / 100) * renewalOthersRevenue;
  const newSales = (config.newSaleCommissionPct / 100) * newSaleRevenue;
  const grossTotal = fixed + patients + renewals + newSales;

  // Regla de 3 sobre el bruto del mes — se descuenta lo correspondiente a los
  // días de vacaciones que caen dentro del mes.
  const vacation =
    vacationDaysInMonth > 0 && daysInMonth > 0
      ? -((grossTotal / daysInMonth) * vacationDaysInMonth)
      : 0;

  const breakdown = { fixed, patients, renewals, newSales, vacation };
  const total = grossTotal + vacation;

  return {
    config,
    activePatients,
    renewalOwnCount,
    renewalOwnRevenue,
    renewalOthersRevenue,
    newSaleCount,
    newSaleRevenue,
    daysInMonth,
    vacationDaysInMonth,
    breakdown,
    grossTotal,
    total,
  };
}
