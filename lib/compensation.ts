// Cálculo de la compensación mensual de un profesional según sus condiciones.
// Solo servidor (usa prisma).
import { prisma } from "@/lib/prisma";

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
  breakdown: { fixed: number; patients: number; renewals: number; newSales: number };
  total: number;
};

export async function computeMonthlySalary(
  professionalId: string,
  year: number,
  month: number
): Promise<SalaryResult> {
  const config = await getCompensation(professionalId);
  const { start, end } = monthRangeUTC(year, month);

  // Pacientes activos asignados (snapshot actual)
  const activePatients = await prisma.patient.count({
    where: { assignedProfessionalId: professionalId, onboardingStatus: "active" },
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

  const breakdown = {
    fixed: config.baseSalary,
    patients: config.perActivePatient * activePatients,
    renewals: (config.renewalOwnPct / 100) * renewalOwnRevenue + (config.renewalOthersPct / 100) * renewalOthersRevenue,
    newSales: (config.newSaleCommissionPct / 100) * newSaleRevenue,
  };
  const total = breakdown.fixed + breakdown.patients + breakdown.renewals + breakdown.newSales;

  return {
    config,
    activePatients,
    renewalOwnCount,
    renewalOwnRevenue,
    renewalOthersRevenue,
    newSaleCount,
    newSaleRevenue,
    breakdown,
    total,
  };
}
