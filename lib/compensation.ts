// Cálculo de la compensación mensual de un profesional según sus condiciones.
// Solo servidor (usa prisma).
import { prisma } from "@/lib/prisma";

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

  // Pacientes activos asignados (snapshot actual). Los pacientes fantasma
  // (isTest) no cuentan para compensación.
  const activePatients = await prisma.patient.count({
    where: { assignedProfessionalId: professionalId, onboardingStatus: "active", isTest: false },
  });

  // Renovaciones del mes: propias vs resto del equipo
  const monthRenewals = await prisma.subscriptionRenewal.findMany({
    where: { decidedAt: { gte: start, lt: end } },
    select: { amountPaid: true, patient: { select: { assignedProfessionalId: true } } },
  });
  let renewalOwnCount = 0;
  let renewalOwnRevenue = 0;
  let renewalOthersRevenue = 0;
  for (const r of monthRenewals) {
    const amt = r.amountPaid || 0;
    if (r.patient?.assignedProfessionalId === professionalId) {
      renewalOwnCount++;
      renewalOwnRevenue += amt;
    } else {
      renewalOthersRevenue += amt;
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
  const leaves = await prisma.professionalLeave.findMany({
    where: {
      professionalId,
      // status != "cancelled": "pending" y "applied" descuentan; "cancelled" no.
      status: { in: ["pending", "applied"] },
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
