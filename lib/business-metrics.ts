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

// ─── Vista por meses (un año) ────────────────────────────────────────────────
export type MonthlyRow = {
  month: number;            // 0-11
  altasCount: number;
  renewedCount: number;
  lostCount: number;
  income: number;
  incomeNew: number;
  incomeRenewal: number;
  expense: number;
  profit: number;
  profitPct: number | null;
  renewalRate: number | null;
};

export type MonthlyMetrics = {
  year: number;
  months: MonthlyRow[];     // 12
  annual: Omit<MonthlyRow, "month">;
};

export async function computeMonthlyBusinessMetrics(year: number): Promise<MonthlyMetrics> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const [txs, renewals] = await Promise.all([
    prisma.transaction.findMany({
      where: { occurredAt: { gte: yearStart, lte: yearEnd } },
      select: { type: true, amount: true, occurredAt: true },
    }),
    prisma.subscriptionRenewal.findMany({
      where: { decidedAt: { gte: yearStart, lte: yearEnd } },
      select: { outcome: true, amountPaid: true, decidedAt: true },
    }),
  ]);

  const months: MonthlyRow[] = Array.from({ length: 12 }, (_, m) => ({
    month: m, altasCount: 0, renewedCount: 0, lostCount: 0,
    income: 0, incomeNew: 0, incomeRenewal: 0, expense: 0, profit: 0, profitPct: null, renewalRate: null,
  }));

  for (const t of txs) {
    const m = months[new Date(t.occurredAt).getUTCMonth()];
    if (t.type === "income_new") { m.incomeNew += t.amount; m.altasCount++; }
    else if (t.type === "income_renewal") { m.incomeRenewal += t.amount; }
    else if (t.type === "income_other") { /* va a income total */ m.income += 0; }
    else if (t.type === "expense") { m.expense += t.amount; }
    if (t.type.startsWith("income")) m.income += t.amount;
  }
  for (const r of renewals) {
    const m = months[new Date(r.decidedAt!).getUTCMonth()];
    if (r.outcome === "renewed") {
      m.renewedCount++;
      if (r.amountPaid) { m.incomeRenewal += r.amountPaid; m.income += r.amountPaid; }
    } else if (r.outcome === "lost") {
      m.lostCount++;
    }
  }
  for (const m of months) {
    m.profit = m.income - m.expense;
    m.profitPct = m.income > 0 ? Math.round((m.profit / m.income) * 100) : null;
    const decided = m.renewedCount + m.lostCount;
    m.renewalRate = decided > 0 ? Math.round((m.renewedCount / decided) * 100) : null;
  }

  const annual = months.reduce(
    (a, m) => ({
      altasCount: a.altasCount + m.altasCount,
      renewedCount: a.renewedCount + m.renewedCount,
      lostCount: a.lostCount + m.lostCount,
      income: a.income + m.income,
      incomeNew: a.incomeNew + m.incomeNew,
      incomeRenewal: a.incomeRenewal + m.incomeRenewal,
      expense: a.expense + m.expense,
      profit: a.profit + m.profit,
      profitPct: null as number | null,
      renewalRate: null as number | null,
    }),
    { altasCount: 0, renewedCount: 0, lostCount: 0, income: 0, incomeNew: 0, incomeRenewal: 0, expense: 0, profit: 0, profitPct: null as number | null, renewalRate: null as number | null }
  );
  annual.profitPct = annual.income > 0 ? Math.round((annual.profit / annual.income) * 100) : null;
  const decidedY = annual.renewedCount + annual.lostCount;
  annual.renewalRate = decidedY > 0 ? Math.round((annual.renewedCount / decidedY) * 100) : null;

  return { year, months, annual };
}

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
