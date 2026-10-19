// Métricas globales del negocio (Cuadro de mandos). Reutiliza el cálculo de
// finanzas y añade adquisición (CAC), cliente (LTV, activos, renovación).
import { prisma } from "@/lib/prisma";
import { calculateFinanceSummary } from "@/lib/finance";
import { getFinanceLedger } from "@/lib/finance-ledger";
import { getRenewalActivityInPeriod } from "@/lib/renewals";

// Comisión del closer sobre ventas nuevas (igual que el panel del closer).
const CLOSER_COMMISSION_RATE = 0.1;

export type BusinessMetrics = {
  billed: number;
  billedNew: number;
  billedRenewal: number;
  billedOther: number;
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
  billed: number;
  billedNew: number;
  billedRenewal: number;
  billedOther: number;
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
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1) - 1);
  const [ledger, renewals, inputs, leads] = await Promise.all([
    getFinanceLedger(yearStart, yearEnd),
    getRenewalActivityInPeriod(yearStart, yearEnd),
    prisma.businessMonthlyInput.findMany({ where: { year } }),
    prisma.lead.findMany({
      where: { callScheduledAt: { gte: yearStart, lte: yearEnd } },
      select: { callScheduledAt: true, status: true },
    }),
  ]);
  const empty = (): Omit<MonthlyRow, "month"> => ({
    altasCount: 0, altasByProgram: {}, altasRevenueByProgram: {}, renewedCount: 0, lostCount: 0, refunds: null,
    billed: 0, billedNew: 0, billedRenewal: 0, billedOther: 0,
    income: 0, incomeNew: 0, incomeRenewal: 0, expense: 0, profit: 0, profitPct: null, renewalRate: null,
    newFollowers: null, adsSpend: null, adsConversion: null, totalFollowers: null, costPerFollower: null,
    callsScheduled: 0, callsDone: 0, callsNoShow: 0, showRate: null,
  });
  const months: MonthlyRow[] = Array.from({ length: 12 }, (_, month) => ({ month, ...empty() }));
  const programSet = new Set<string>();
  for (const entry of ledger.billedEntries) {
    const row = months[entry.occurredAt.getUTCMonth()];
    row.billed += entry.amount;
    if (entry.type === "income_new") {
      row.billedNew += entry.amount;
      row.altasCount++;
      const program = entry.programType || "Sin programa";
      programSet.add(program);
      row.altasByProgram[program] = (row.altasByProgram[program] ?? 0) + 1;
      row.altasRevenueByProgram[program] = (row.altasRevenueByProgram[program] ?? 0) + entry.amount;
    } else if (entry.type === "income_renewal") row.billedRenewal += entry.amount;
    else row.billedOther += entry.amount;
  }
  for (const entry of ledger.receiptEntries) {
    const row = months[entry.occurredAt.getUTCMonth()];
    row.income += entry.amount;
    if (entry.type === "income_new") row.incomeNew += entry.amount;
    else if (entry.type === "income_renewal") row.incomeRenewal += entry.amount;
  }
  for (const entry of ledger.expenseEntries) months[entry.occurredAt.getUTCMonth()].expense += entry.amount;
  // Renewal activity is a client-retention metric, never proof of a cash receipt.
  for (const renewal of renewals) {
    const row = months[new Date(renewal.when).getUTCMonth()];
    if (!row) continue;
    if (renewal.outcome === "renewed") row.renewedCount++;
    else row.lostCount++;
  }
  for (const lead of leads) {
    const row = months[new Date(lead.callScheduledAt).getUTCMonth()];
    row.callsScheduled++;
    if (lead.status === "won" || lead.status === "lost") row.callsDone++;
    else if (lead.status === "no_show") row.callsNoShow++;
  }
  for (const input of inputs) {
    const row = months[input.month];
    if (!row) continue;
    row.newFollowers = input.newFollowers;
    row.adsSpend = input.adsSpend;
    row.adsConversion = input.adsConversion;
    row.totalFollowers = input.totalFollowers;
    row.refunds = input.refunds;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const finish = (row: Omit<MonthlyRow, "month">) => {
    for (const key of ["billed", "billedNew", "billedRenewal", "billedOther", "income", "incomeNew", "incomeRenewal", "expense"] as const) row[key] = round(row[key]);
    row.profit = round(row.income - row.expense);
    row.profitPct = row.income > 0 ? Math.round(row.profit / row.income * 100) : null;
    const decisions = row.renewedCount + row.lostCount;
    row.renewalRate = decisions > 0 ? Math.round(row.renewedCount / decisions * 100) : null;
    const showBase = row.callsDone + row.callsNoShow;
    row.showRate = showBase > 0 ? Math.round(row.callsDone / showBase * 100) : null;
    row.costPerFollower = row.adsSpend != null && row.newFollowers ? round(row.adsSpend / row.newFollowers) : null;
  };
  months.forEach(finish);
  const annual = empty();
  for (const row of months) {
    for (const key of ["billed", "billedNew", "billedRenewal", "billedOther", "income", "incomeNew", "incomeRenewal", "expense", "altasCount", "renewedCount", "lostCount", "callsScheduled", "callsDone", "callsNoShow"] as const) annual[key] += row[key];
    for (const key of ["newFollowers", "adsSpend", "adsConversion", "refunds"] as const) {
      if (row[key] != null) annual[key] = (annual[key] ?? 0) + row[key]!;
    }
    if (row.totalFollowers != null) annual.totalFollowers = row.totalFollowers;
    for (const [program, count] of Object.entries(row.altasByProgram)) annual.altasByProgram[program] = (annual.altasByProgram[program] ?? 0) + count;
    for (const [program, amount] of Object.entries(row.altasRevenueByProgram)) annual.altasRevenueByProgram[program] = round((annual.altasRevenueByProgram[program] ?? 0) + amount);
  }
  finish(annual);
  return { year, programTypes: [...programSet].sort(), months, annual };
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
  const closerCommission = Math.round(summary.billedNew * CLOSER_COMMISSION_RATE);
  const cac = summary.countNew > 0 ? Math.round((marketingSpend + closerCommission + closerSalary) / summary.countNew) : null;
  const ticketAvg = summary.countNew > 0 ? Math.round(summary.billedNew / summary.countNew) : null;

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
  const byPatient = new Map<string, number>();
  for (const r of incomeByPatient) {
    if (r.patientId) byPatient.set(r.patientId, (byPatient.get(r.patientId) ?? 0) + (r._sum.amount ?? 0));
  }
  const ltvPatients = byPatient.size;
  const totalLtv = [...byPatient.values()].reduce((a, b) => a + b, 0);
  const ltv = ltvPatients > 0 ? Math.round(totalLtv / ltvPatients) : null;

  const ltvCacRatio = ltv != null && cac != null && cac > 0 ? Math.round((ltv / cac) * 10) / 10 : null;

  return {
    billed: summary.billed,
    billedNew: summary.billedNew,
    billedRenewal: summary.billedRenewal,
    billedOther: summary.billedOther,
    income: summary.income,
    expense: summary.expense,
    profit: summary.profit,
    profitPct: summary.profitPct,
    newAltas: summary.countNew,
    newSaleRevenue: summary.billedNew,
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
