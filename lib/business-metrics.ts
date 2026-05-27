// Métricas globales del negocio (Cuadro de mandos). Reutiliza el cálculo de
// finanzas y añade adquisición (CAC), cliente (LTV, activos, renovación).
import { prisma } from "@/lib/prisma";
import { calculateFinanceSummary } from "@/lib/finance";

// Comisión del closer sobre ventas nuevas (igual que el panel del closer).
const CLOSER_COMMISSION_RATE = 0.1;

export type BusinessMetrics = {
  income: number;
  expense: number;
  profit: number;
  profitPct: number | null;

  newAltas: number;
  newSaleRevenue: number;
  ticketAvg: number | null;

  renewedCount: number;
  lostCount: number;
  renewalRate: number | null;

  marketingSpend: number;
  closerCommission: number;
  cac: number | null;

  activePatients: number;

  ltv: number | null;
  ltvPatients: number;
  ltvCacRatio: number | null;
};

export async function computeBusinessMetrics(start: Date, end: Date): Promise<BusinessMetrics> {
  const summary = await calculateFinanceSummary(start, end);

  // Gasto en marketing del período
  const marketingAgg = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: { type: "expense", category: "marketing", occurredAt: { gte: start, lte: end } },
  });
  const marketingSpend = marketingAgg._sum.amount ?? 0;

  // CAC = (marketing + comisión closer sobre ventas nuevas) / altas nuevas
  const closerCommission = Math.round(summary.incomeNew * CLOSER_COMMISSION_RATE);
  const cac = summary.countNew > 0 ? Math.round((marketingSpend + closerCommission) / summary.countNew) : null;
  const ticketAvg = summary.countNew > 0 ? Math.round(summary.incomeNew / summary.countNew) : null;

  // Renovaciones decididas en el período
  const renewals = await prisma.subscriptionRenewal.findMany({
    where: { decidedAt: { gte: start, lte: end } },
    select: { outcome: true },
  });
  const renewedCount = renewals.filter((r) => r.outcome === "renewed").length;
  const lostCount = renewals.filter((r) => r.outcome === "lost").length;
  const decided = renewedCount + lostCount;
  const renewalRate = decided > 0 ? Math.round((renewedCount / decided) * 100) : null;

  // Pacientes activos = suscripción vigente (fin = inicio + meses contratados > hoy)
  const patients = await prisma.patient.findMany({
    select: { subscriptionStartDate: true, subscriptionTotalMonths: true },
  });
  const now = new Date();
  let activePatients = 0;
  for (const p of patients) {
    if (!p.subscriptionStartDate) continue;
    const subEnd = new Date(p.subscriptionStartDate);
    subEnd.setMonth(subEnd.getMonth() + (p.subscriptionTotalMonths || 0));
    if (subEnd > now) activePatients++;
  }

  // LTV (histórico, todo el tiempo): ingreso medio total por paciente que HA PAGADO.
  // Solo cuentan pacientes con transacciones de ingreso registradas en la app, así
  // que los clientes importados sin historial no afectan a la métrica.
  const incomeByPatient = await prisma.transaction.groupBy({
    by: ["patientId"],
    where: { type: { in: ["income_new", "income_renewal", "income_other"] }, patientId: { not: null } },
    _sum: { amount: true },
  });
  const autoRByPatient = await prisma.subscriptionRenewal.groupBy({
    by: ["patientId"],
    where: { outcome: "renewed", amountPaid: { not: null } },
    _sum: { amountPaid: true },
  });
  const byPatient = new Map<string, number>();
  for (const r of incomeByPatient) {
    if (r.patientId) byPatient.set(r.patientId, (byPatient.get(r.patientId) ?? 0) + (r._sum.amount ?? 0));
  }
  for (const r of autoRByPatient) {
    if (r.patientId) byPatient.set(r.patientId, (byPatient.get(r.patientId) ?? 0) + (r._sum.amountPaid ?? 0));
  }
  const ltvPatients = byPatient.size;
  const totalLtv = [...byPatient.values()].reduce((a, b) => a + b, 0);
  const ltv = ltvPatients > 0 ? Math.round(totalLtv / ltvPatients) : null;

  const ltvCacRatio = ltv != null && cac != null && cac > 0 ? Math.round((ltv / cac) * 10) / 10 : null;

  return {
    income: summary.income,
    expense: summary.expense,
    profit: summary.profit,
    profitPct: summary.profitPct,
    newAltas: summary.countNew,
    newSaleRevenue: summary.incomeNew,
    ticketAvg,
    renewedCount,
    lostCount,
    renewalRate,
    marketingSpend,
    closerCommission,
    cac,
    activePatients,
    ltv,
    ltvPatients,
    ltvCacRatio,
  };
}
