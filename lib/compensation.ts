// Cálculo de la compensación mensual de un profesional según sus condiciones.
// Solo servidor (usa prisma).
import { prisma } from "@/lib/prisma";
import { activePatientCondition, currentlyPausedCondition } from "@/lib/patient-active";
import { listRealRenewalsInPeriod } from "@/lib/renewals";
import { getCloserSalesInPeriod, sumContracted } from "@/lib/closer-sales";

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
  adjustments: Array<{ id: string; description: string; amount: number }>;
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
    adjustments: number;
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

  // Only a continuation of an actual program pays a renewal commission. Use the
  // same source (and month of decision) as the retention metrics and salary detail.
  const realRenewals = await listRealRenewalsInPeriod(start, new Date(end.getTime() - 1));
  const own = realRenewals.filter(r => r.assignedProfessionalId === professionalId);
  const renewalOwnCount = own.length;
  const renewalOwnRevenue = own.reduce((sum, r) => sum + (r.amountPaid || 0), 0);
  const renewalOthersRevenue = realRenewals.reduce((sum, r) =>
    sum + (r.assignedProfessionalId !== professionalId ? r.amountPaid || 0 : 0), 0);

  // Ventas nuevas atribuidas al mes. Usamos el helper unificado que
  // devuelve el importe CONTRATADO (no lo cobrado) — asi los fraccionados
  // cuentan por el total pactado y las Prevention por landing (que no
  // crean Sale) se detectan via PatientSubscription.
  const closerSales = await getCloserSalesInPeriod(
    config.newSaleScope === "own" ? professionalId : undefined,
    start,
    end,
  );
  const newSaleCount = closerSales.length;
  const newSaleRevenue = sumContracted(closerSales);

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

  // Regularizaciones de meses anteriores: se añaden después del descuento
  // de vacaciones del mes actual para conservar el importe autorizado.
  const adjustmentRows = await prisma.payrollAdjustment.findMany({
    where: { professionalId, year, month },
    orderBy: { createdAt: "asc" },
  });
  const adjustments = adjustmentRows.map(row => ({
    id: row.id, description: row.description, amount: row.amountCents / 100,
  }));
  const adjustmentTotal = adjustmentRows.reduce((sum, row) => sum + row.amountCents, 0) / 100;
  const total = grossTotal + vacation + adjustmentTotal;
  const breakdown = { fixed, patients, renewals, newSales, vacation, adjustments: adjustmentTotal };


  return {
    adjustments,
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
