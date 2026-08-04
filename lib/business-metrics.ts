// Métricas globales del negocio (Cuadro de mandos). Reutiliza el cálculo de
// finanzas y añade adquisición (CAC), cliente (LTV, activos, renovación).
import { prisma } from "@/lib/prisma";
import { calculateFinanceSummary } from "@/lib/finance";
import { getRenewalActivityInPeriod } from "@/lib/renewals";

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
  closerSalary: number;
  cac: number | null;

  activePatients: number;

  ltv: number | null;
  ltvPatients: number;
  ltvCacRatio: number | null;

  // Llamadas comerciales del periodo. Cuentan por callScheduledAt (la fecha
  // para la que se agendó la llamada), no por cuándo se decidió el outcome.
  callsScheduled: number;          // todas las leads con callScheduledAt en el periodo
  callsDone: number;               // status ∈ {won, lost}
  callsNoShow: number;             // status = no_show
  // Show rate = done / (done + no_show). Excluye cancelaciones legítimas y
  // leads aún sin decidir. null si no hay base.
  showRate: number | null;
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
  adsSpend: number | null;        // Follow me ADs (cuenta para coste/seguidor)
  adsConversion: number | null;   // Conversión ADs (sin fórmula por ahora)
  totalFollowers: number | null;
  costPerFollower: number | null;
  // Llamadas comerciales del mes (por callScheduledAt).
  callsScheduled: number;
  callsDone: number;
  callsNoShow: number;
  showRate: number | null;
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

  const [txs, renewals, newAltaTxs, inputs, leads] = await Promise.all([
    prisma.transaction.findMany({
      where: { occurredAt: { gte: yearStart, lte: yearEnd } },
      select: { type: true, amount: true, occurredAt: true },
    }),
    // Actividad de renovaciones del año: renovadas por mes de decisión
    // (para que "renovadas en agosto" refleje lo cerrado en agosto) +
    // perdidas por mes de vencimiento (baja efectiva).
    getRenewalActivityInPeriod(yearStart, yearEnd),
    prisma.transaction.findMany({
      where: { type: "income_new", occurredAt: { gte: yearStart, lte: yearEnd } },
      select: { occurredAt: true, amount: true, patient: { select: { programType: true } } },
    }),
    prisma.businessMonthlyInput.findMany({ where: { year } }),
    prisma.lead.findMany({
      where: { callScheduledAt: { gte: yearStart, lte: yearEnd } },
      select: { callScheduledAt: true, status: true },
    }),
  ]);

  const months: MonthlyRow[] = Array.from({ length: 12 }, (_, m) => ({
    month: m, altasCount: 0, altasByProgram: {}, altasRevenueByProgram: {}, renewedCount: 0, lostCount: 0, refunds: null,
    income: 0, incomeNew: 0, incomeRenewal: 0, expense: 0, profit: 0, profitPct: null, renewalRate: null,
    newFollowers: null, adsSpend: null, adsConversion: null, totalFollowers: null, costPerFollower: null,
    callsScheduled: 0, callsDone: 0, callsNoShow: 0, showRate: null,
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

  // Renovadas por mes de decisión, perdidas por mes de vencimiento.
  // renewals es RenewalActivityRow[]: `when` es decidedAt (renewed) o
  // endDate (lost) según el outcome.
  for (const o of renewals) {
    const m = months[new Date(o.when).getUTCMonth()];
    if (!m) continue;
    if (o.outcome === "renewed") {
      m.renewedCount++;
      if (o.amountPaid) { m.incomeRenewal += o.amountPaid; m.income += o.amountPaid; }
    } else {
      m.lostCount++;
    }
  }

  // Llamadas comerciales (por callScheduledAt)
  for (const l of leads) {
    const m = months[new Date(l.callScheduledAt).getUTCMonth()];
    if (!m) continue;
    m.callsScheduled++;
    if (l.status === "won" || l.status === "lost") m.callsDone++;
    else if (l.status === "no_show") m.callsNoShow++;
  }

  // Datos manuales
  for (const i of inputs) {
    const m = months[i.month];
    if (!m) continue;
    m.newFollowers = i.newFollowers;
    m.adsSpend = i.adsSpend;
    m.adsConversion = i.adsConversion;
    m.totalFollowers = i.totalFollowers;
    m.refunds = i.refunds;
    m.costPerFollower = i.adsSpend != null && i.newFollowers ? Math.round((i.adsSpend / i.newFollowers) * 100) / 100 : null;
  }

  for (const m of months) {
    m.profit = m.income - m.expense;
    m.profitPct = m.income > 0 ? Math.round((m.profit / m.income) * 100) : null;
    const decided = m.renewedCount + m.lostCount;
    m.renewalRate = decided > 0 ? Math.round((m.renewedCount / decided) * 100) : null;
    const showBase = m.callsDone + m.callsNoShow;
    m.showRate = showBase > 0 ? Math.round((m.callsDone / showBase) * 100) : null;
  }

  // Anual
  const annual: Omit<MonthlyRow, "month"> = {
    altasCount: 0, altasByProgram: {}, altasRevenueByProgram: {}, renewedCount: 0, lostCount: 0, refunds: 0,
    income: 0, incomeNew: 0, incomeRenewal: 0, expense: 0, profit: 0, profitPct: null, renewalRate: null,
    newFollowers: 0, adsSpend: 0, adsConversion: 0, totalFollowers: null, costPerFollower: null,
    callsScheduled: 0, callsDone: 0, callsNoShow: 0, showRate: null,
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
    if (m.adsConversion != null) annual.adsConversion = (annual.adsConversion ?? 0) + m.adsConversion;
    if (m.totalFollowers != null) lastTotalFollowers = m.totalFollowers;
    if (m.refunds != null) annual.refunds = (annual.refunds ?? 0) + m.refunds;
    annual.callsScheduled += m.callsScheduled;
    annual.callsDone += m.callsDone;
    annual.callsNoShow += m.callsNoShow;
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
  const showBaseY = annual.callsDone + annual.callsNoShow;
  annual.showRate = showBaseY > 0 ? Math.round((annual.callsDone / showBaseY) * 100) : null;

  return { year, programTypes, months, annual };
}

export async function computeBusinessMetrics(start: Date, end: Date): Promise<BusinessMetrics> {
  const summary = await calculateFinanceSummary(start, end);

  // Inversión total en ADS del período (Follow me + Conversión), dato manual.
  const adsInputs = await prisma.businessMonthlyInput.findMany({ select: { year: true, month: true, adsSpend: true, adsConversion: true } });
  let marketingSpend = 0;
  for (const i of adsInputs) {
    const d = new Date(Date.UTC(i.year, i.month, 1));
    if (d >= start && d <= end) marketingSpend += (i.adsSpend ?? 0) + (i.adsConversion ?? 0);
  }

  // Sueldo fijo de los closers durante el período (nº de meses del período).
  const monthsInPeriod =
    (end.getUTCFullYear() * 12 + end.getUTCMonth()) - (start.getUTCFullYear() * 12 + start.getUTCMonth()) + 1;
  const closers = await prisma.professional.findMany({
    where: { active: true, role: "closer" },
    select: { compensation: { select: { baseSalary: true } } },
  });
  const closerMonthlyBase = closers.reduce((a, c) => a + (c.compensation?.baseSalary ?? 0), 0);
  const closerSalary = Math.round(closerMonthlyBase * Math.max(1, monthsInPeriod));

  // CAC = (inversión ADS + comisión closer + sueldo closer) / altas nuevas
  const closerCommission = Math.round(summary.incomeNew * CLOSER_COMMISSION_RATE);
  const cac = summary.countNew > 0 ? Math.round((marketingSpend + closerCommission + closerSalary) / summary.countNew) : null;
  const ticketAvg = summary.countNew > 0 ? Math.round(summary.incomeNew / summary.countNew) : null;

  // Llamadas comerciales del periodo (por fecha agendada).
  const leadsInPeriod = await prisma.lead.findMany({
    where: { callScheduledAt: { gte: start, lte: end } },
    select: { status: true },
  });
  const callsScheduled = leadsInPeriod.length;
  const callsDone = leadsInPeriod.filter((l) => l.status === "won" || l.status === "lost").length;
  const callsNoShow = leadsInPeriod.filter((l) => l.status === "no_show").length;
  const callsShowBase = callsDone + callsNoShow;
  const showRate = callsShowBase > 0 ? Math.round((callsDone / callsShowBase) * 100) : null;

  // Renovadas por mes de decisión + perdidas por mes de vencimiento.
  const activity = await getRenewalActivityInPeriod(start, end);
  const renewedCount = activity.filter((o) => o.outcome === "renewed").length;
  const lostCount = activity.filter((o) => o.outcome === "lost").length;
  const decided = renewedCount + lostCount;
  const renewalRate = decided > 0 ? Math.round((renewedCount / decided) * 100) : null;

  // Pacientes activos = suscripción vigente (fin = inicio + meses contratados > hoy)
  // Excluimos pacientes fantasma (isTest) del conteo de negocio.
  const patients = await prisma.patient.findMany({
    where: { isTest: false },
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
    closerSalary,
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
    callsScheduled,
    callsDone,
    callsNoShow,
    showRate,
  };
}
