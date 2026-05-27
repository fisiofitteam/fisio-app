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
  altasByProgram: Record<string, number>;
  altasRevenueByProgram: Record<string, number>;
  renewedCount: number;
  lostCount: number;
  refunds: number | null;
  income: number;
  incomeNew: number;
  incomeRenewal: number;
  expense: number;
  profit: number;
  profitPct: number | null;
  renewalRate: number | null;
  // Datos manuales (publicidad)
  newFollowers: number | null;
  adsSpend: number | null;
  totalFollowers: number | null;
  costPerFollower: number | null;
};

export type MonthlyMetrics = {
  year: number;
  programTypes: string[];   // tipos de programa presentes (para las filas de altas)
  months: MonthlyRow[];     // 12
  annual: Omit<MonthlyRow, "month">;
};

export async function computeMonthlyBusinessMetrics(year: number): Promise<MonthlyMetrics> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const [txs, renewals, newAltaTxs, inputs] = await Promise.all([
    prisma.transaction.findMany({
      where: { occurredAt: { gte: yearStart, lte: yearEnd } },
      select: { type: true, amount: true, occurredAt: true },
    }),
    prisma.subscriptionRenewal.findMany({
      where: { decidedAt: { gte: yearStart, lte: yearEnd } },
      select: { outcome: true, amountPaid: true, decidedAt: true },
    }),
    prisma.transaction.findMany({
      where: { type: "income_new", occurredAt: { gte: yearStart, lte: yearEnd } },
      select: { occurredAt: true, amount: true, patient: { select: { programType: true } } },
    }),
    prisma.businessMonthlyInput.findMany({ where: { year } }),
  ]);

  const months: MonthlyRow[] = Array.from({ length: 12 }, (_, m) => ({
    month: m, altasCount: 0, altasByProgram: {}, altasRevenueByProgram: {}, renewedCount: 0, lostCount: 0, refunds: null,
    income: 0, incomeNew: 0, incomeRenewal: 0, expense: 0, profit: 0, profitPct: null, renewalRate: null,
    newFollowers: null, adsSpend: null, totalFollowers: null, costPerFollower: null,
  }));

  for (const t of txs) {
    const m = months[new Date(t.occurredAt).getUTCMonth()];
    if (t.type === "income_new") { m.incomeNew += t.amount; m.altasCount++; }
    else if (t.type === "income_renewal") { m.incomeRenewal += t.amount; }
    else if (t.type === "expense") { m.expense += t.amount; }
    if (t.type.startsWith("income")) m.income += t.amount;
  }

  // Altas por programa
  const programSet = new Set<string>();
  for (const t of newAltaTxs) {
    const prog = t.patient?.programType || "Sin programa";
    programSet.add(prog);
    const m = months[new Date(t.occurredAt).getUTCMonth()];
    m.altasByProgram[prog] = (m.altasByProgram[prog] ?? 0) + 1;
    m.altasRevenueByProgram[prog] = (m.altasRevenueByProgram[prog] ?? 0) + t.amount;
  }
  const programTypes = [...programSet].sort();

  for (const r of renewals) {
    const m = months[new Date(r.decidedAt!).getUTCMonth()];
    if (r.outcome === "renewed") {
      m.renewedCount++;
      if (r.amountPaid) { m.incomeRenewal += r.amountPaid; m.income += r.amountPaid; }
    } else if (r.outcome === "lost") {
      m.lostCount++;
    }
  }

  // Datos manuales
  for (const i of inputs) {
    const m = months[i.month];
    if (!m) continue;
    m.newFollowers = i.newFollowers;
    m.adsSpend = i.adsSpend;
    m.totalFollowers = i.totalFollowers;
    m.refunds = i.refunds;
    m.costPerFollower = i.adsSpend != null && i.newFollowers ? Math.round((i.adsSpend / i.newFollowers) * 100) / 100 : null;
  }

  for (const m of months) {
    m.profit = m.income - m.expense;
    m.profitPct = m.income > 0 ? Math.round((m.profit / m.income) * 100) : null;
    const decided = m.renewedCount + m.lostCount;
    m.renewalRate = decided > 0 ? Math.round((m.renewedCount / decided) * 100) : null;
  }

  // Anual
  const annual: Omit<MonthlyRow, "month"> = {
    altasCount: 0, altasByProgram: {}, altasRevenueByProgram: {}, renewedCount: 0, lostCount: 0, refunds: 0,
    income: 0, incomeNew: 0, incomeRenewal: 0, expense: 0, profit: 0, profitPct: null, renewalRate: null,
    newFollowers: 0, adsSpend: 0, totalFollowers: null, costPerFollower: null,
  };
  let lastTotalFollowers: number | null = null;
  for (const m of months) {
    annual.altasCount += m.altasCount;
    annual.renewedCount += m.renewedCount;
    annual.lostCount += m.lostCount;
    annual.income += m.income;
    annual.incomeNew += m.incomeNew;
    annual.incomeRenewal += m.incomeRenewal;
    annual.expense += m.expense;
    annual.profit += m.profit;
    if (m.newFollowers != null) annual.newFollowers = (annual.newFollowers ?? 0) + m.newFollowers;
    if (m.adsSpend != null) annual.adsSpend = (annual.adsSpend ?? 0) + m.adsSpend;
    if (m.totalFollowers != null) lastTotalFollowers = m.totalFollowers;
    if (m.refunds != null) annual.refunds = (annual.refunds ?? 0) + m.refunds;
    for (const [prog, rev] of Object.entries(m.altasRevenueByProgram)) {
      annual.altasRevenueByProgram[prog] = (annual.altasRevenueByProgram[prog] ?? 0) + rev;
    }
    for (const [prog, n] of Object.entries(m.altasByProgram)) {
      annual.altasByProgram[prog] = (annual.altasByProgram[prog] ?? 0) + n;
    }
  }
  annual.totalFollowers = lastTotalFollowers; // último valor del año, no la suma
  annual.profitPct = annual.income > 0 ? Math.round((annual.profit / annual.income) * 100) : null;
  const decidedY = annual.renewedCount + annual.lostCount;
  annual.renewalRate = decidedY > 0 ? Math.round((annual.renewedCount / decidedY) * 100) : null;
  annual.costPerFollower = annual.adsSpend && annual.newFollowers ? Math.round((annual.adsSpend / annual.newFollowers) * 100) / 100 : null;

  return { year, programTypes, months, annual };
}

export async function computeBusinessMetrics(start: Date, end: Date): Promise<BusinessMetrics> {
  const summary = await calculateFinanceSummary(start, end);

  // Inversión en ADS del período (dato manual mensual del cuadro de mandos).
  const adsInputs = await prisma.businessMonthlyInput.findMany({ select: { year: true, month: true, adsSpend: true } });
  let marketingSpend = 0;
  for (const i of adsInputs) {
    const d = new Date(Date.UTC(i.year, i.month, 1));
    if (i.adsSpend && d >= start && d <= end) marketingSpend += i.adsSpend;
  }

  // CAC = (inversión ADS + comisión closer sobre ventas nuevas) / altas nuevas
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
