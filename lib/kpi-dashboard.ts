import { prisma } from "@/lib/prisma";
import { computeBusinessMetrics, type BusinessMetrics } from "@/lib/business-metrics";
import { activePatientCondition } from "@/lib/patient-active";
import { getFinanceLedger } from "@/lib/finance-ledger";
import { paymentDescription } from "@/lib/payment-description";
import {
  countLeadOutcomes, groupLeadOutcomes, reconstructIntervalHealth,
  type LeadCounts, type SourceBreakdown,
} from "@/lib/kpi-dashboard-calculations";

export type { SourceBreakdown } from "@/lib/kpi-dashboard-calculations";

export type KpiPaymentRow = {
  id: string;
  source: "transaction" | "legacy-renewal";
  type: string;
  amount: number;
  date: string;
  description: string | null;
  patientId: string | null;
  patientName: string | null;
};

export type KpiDashboardData = {
  metrics: BusinessMetrics;
  period: { start: string; end: string; effectiveEnd: string; isPartial: boolean };
  acquisition: LeadCounts & {
    expenseCategories: { category: string; amount: number }[];
    acquisitionExpenses: number;
    conversations: null;
    newFollowers: number | null;
    totalFollowers: number | null;
    followAds: number | null;
    conversionAds: number | null;
    costPerFollower: number | null;
    monthsWithInputs: number;
    monthsInPeriod: number;
    notes: string[];
  };
  leads: {
    id: string; fullName: string; status: string; callScheduledAt: string;
    decidedAt: string | null; source: string | null; sourceId: string | null;
    origin: string; notes: string | null;
  }[];
  health: {
    activeNow: number;
    activeLegacy: number;
    activeAtStart: number | null;
    activeAtEnd: number | null;
    additions: number | null;
    departures: number | null;
    churnRate: number | null;
    arpu: number | null;
    averageLifetimeMonths: null;
    notes: string[];
  };
  payments: {
    income: number; expense: number; profit: number;
    transactionsIncome: number; legacyRenewalIncome: number; legacyUnverifiedAmount: number;
    rows: KpiPaymentRow[]; rowCount: number; truncated: boolean;
    notes: string[];
  };
  diagnosis: {
    billed: number; collected: number; difference: number; unverifiedLegacy: number;
    findings: { key: string; severity: "info" | "warning"; title: string; detail: string }[];
  };
  sources: {
    catalog: { id: string; label: string; color: string | null; active: boolean; sortOrder: number }[];
    breakdown: SourceBreakdown[];
    origins: SourceBreakdown[];
    notes: string[];
  };
};

const PAYMENT_ROW_LIMIT = 200;
const INCOME_TYPES = ["income_new", "income_renewal", "income_other"];
const roundMoney = (value: number) => Math.round(value * 100) / 100;

/**
 * Read-only adapter for the Dashora-shaped views. Existing summary, CAC and
 * historical LTV remain authoritative; alternative sources are shown separately.
 * Financial records have no reliable provider/transaction relation, so we never
 * infer payment methods, deduplicate payments or invent outstanding balances.
 */
export async function getKpiDashboardData(
  start: Date, end: Date, existingMetrics?: BusinessMetrics,
): Promise<KpiDashboardData> {
  const now = new Date();
  const effectiveEnd = new Date(Math.min(end.getTime(), now.getTime()));
  const inPeriod = { gte: start, lte: end };
  const incomeWhere = { occurredAt: inPeriod, type: { in: INCOME_TYPES } };
  const [metrics, ledger, leads, catalog, expenseGroups, officialActive, intervals,
    paymentTransactions, inputRows] = await Promise.all([
    existingMetrics ? Promise.resolve(existingMetrics) : computeBusinessMetrics(start, end),
    getFinanceLedger(start, end),
    prisma.lead.findMany({
      where: { callScheduledAt: inPeriod },
      orderBy: [{ callScheduledAt: "desc" }, { id: "asc" }],
      select: {
        id: true, fullName: true, status: true, callScheduledAt: true,
        decidedAt: true, source: true, followUpNote: true,
        sourceTagId: true, sourceTag: { select: { label: true } },
      },
    }),
    prisma.leadSourceTag.findMany({
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { id: true, label: true, color: true, active: true, sortOrder: true },
    }),
    prisma.transaction.groupBy({
      by: ["category"], where: { occurredAt: inPeriod, type: "expense" },
      _sum: { amount: true },
    }),
    prisma.patient.count({ where: { isTest: false, ...activePatientCondition() } }),
    prisma.subscriptionRenewal.findMany({
      where: { patient: { isTest: false }, isReservation: false, status: { not: "cancelled" } },
      select: { patientId: true, startDate: true, endDate: true },
    }),
    prisma.transaction.findMany({
      where: incomeWhere,
      orderBy: [{ occurredAt: "desc" }, { id: "asc" }], take: PAYMENT_ROW_LIMIT,
      select: {
        id: true, type: true, amount: true, occurredAt: true, description: true,
        patientId: true, patient: { select: { fullName: true } },
      },
    }),
    prisma.businessMonthlyInput.findMany({
      where: { year: { gte: start.getFullYear(), lte: end.getFullYear() } },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: {
        year: true, month: true, newFollowers: true, totalFollowers: true,
        adsSpend: true, adsConversion: true,
      },
    }),
  ]);

  const periodMonthKeys = new Set<string>();
  const monthCursor = new Date(Date.UTC(start.getFullYear(), start.getMonth(), 1));
  const finalMonth = Date.UTC(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), 1);
  while (monthCursor.getTime() <= finalMonth) {
    periodMonthKeys.add(monthCursor.getUTCFullYear() + "-" + monthCursor.getUTCMonth());
    monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1);
  }
  const inputs = inputRows.filter((input) => periodMonthKeys.has(input.year + "-" + input.month));
  function sumInput(field: "newFollowers" | "adsSpend" | "adsConversion"): number | null {
    const present = inputs.filter((input) => input[field] != null);
    return present.length ? roundMoney(present.reduce((total, input) => total + (input[field] ?? 0), 0)) : null;
  }
  const newFollowers = sumInput("newFollowers");
  const followAds = sumInput("adsSpend");
  const conversionAds = sumInput("adsConversion");
  const totalFollowers = [...inputs].reverse().find((input) => input.totalFollowers != null)?.totalFollowers ?? null;
  const expenseCategories = expenseGroups.map((group) => ({
    category: group.category ?? "Sin categoría", amount: roundMoney(group._sum.amount ?? 0),
  })).sort((a, b) => b.amount - a.amount);
  const acquisitionExpenses = expenseCategories
    .filter((group) => group.category.toLowerCase() === "marketing")
    .reduce((sum, group) => sum + group.amount, 0);

  const health = reconstructIntervalHealth(intervals, start, end, now);
  const legacyUnverifiedAmount = roundMoney(ledger.legacyUnverified.filter((row) => row.issue === "missing-receipt").reduce((sum, row) => sum + row.amount, 0));
  const rows: KpiPaymentRow[] = paymentTransactions.map((row) => ({
    id: row.id, source: "transaction" as const, type: row.type,
    amount: row.amount, date: row.occurredAt.toISOString(), description: paymentDescription(row.description),
    patientId: row.patientId, patientName: row.patient?.fullName ?? null,
  }));
  const rowCount = ledger.receiptEntries.length;
  const counts = countLeadOutcomes(leads.map((lead) => lead.status));
  const breakdown = groupLeadOutcomes(leads.map((lead) => ({
    status: lead.status, groupId: lead.sourceTagId ?? "unassigned",
    groupLabel: lead.sourceTag?.label ?? "Sin vía asignada",
  })));
  const origins = groupLeadOutcomes(leads.map((lead) => ({
    status: lead.status, groupId: lead.source != null ? "origin:" + lead.source : "unassigned",
    groupLabel: lead.source ?? "Sin origen registrado",
  })));
  const findings: KpiDashboardData["diagnosis"]["findings"] = [
    { key: "billing-cash", severity: "info", title: "Facturación y recaudado tienen fechas distintas",
      detail: "La facturación recoge el importe completo del contrato una sola vez. El recaudado suma cada cobro confirmado en su fecha, incluso si el programa se vendió en otro mes. La diferencia de un mes no es el saldo pendiente total." },
    { key: "sales-count", severity: "info", title: "Las cuotas no son nuevas ventas",
      detail: "Un pago fraccionado cuenta como un contrato y varias entradas de dinero. El ticket utiliza el importe completo de los contratos nuevos; las cuotas posteriores no vuelven a contar como altas." },
    { key: "history", severity: "info", title: "Registros históricos conservados",
      detail: "Los cobros, periodos, entradas manuales y objetivos se mantienen. Los importes históricos sin justificante de cobro se revisan por separado y no se suman automáticamente al recaudado." },
  ];
  for (const [index, warning] of ledger.warnings.entries()) findings.push({
    key: "ledger-" + index, severity: "warning", title: "Revisión del histórico", detail: warning,
  });
  if (legacyUnverifiedAmount > 0) findings.push({
    key: "legacy-unverified", severity: "warning", title: "Importes históricos por comprobar",
    detail: "Hay importes asociados a periodos antiguos sin un cobro confirmado enlazado. Se conservan para su revisión y no se incluyen dos veces como cuotas o efectivo.",
  });
  if (health.incompleteIntervals > 0) findings.push({
    key: "history-dates", severity: "warning", title: "Histórico con fechas incompletas",
    detail: health.incompleteIntervals + " periodos carecen de un intervalo válido. Quedan fuera de la reconstrucción de clientes al inicio y al final.",
  });
  if (inputs.length < periodMonthKeys.size) findings.push({
    key: "marketing-inputs", severity: "info", title: "Publicidad con meses pendientes",
    detail: inputs.length + " de " + periodMonthKeys.size + " meses tienen datos manuales. Los campos vacíos no equivalen a cero; puedes completarlos en Anual.",
  });
  const unassigned = breakdown.find((source) => source.id === "unassigned")?.scheduled ?? 0;
  if (unassigned > 0) findings.push({
    key: "unassigned-sources", severity: "info", title: "Leads sin vía asignada",
    detail: unassigned + " citas del periodo no tienen etiqueta de vía. Su origen técnico se conserva por separado.",
  });

  return {
    metrics,
    period: { start: start.toISOString(), end: end.toISOString(),
      effectiveEnd: effectiveEnd.toISOString(), isPartial: effectiveEnd < end },
    acquisition: {
      ...counts, expenseCategories, acquisitionExpenses: roundMoney(acquisitionExpenses),
      conversations: null, newFollowers, totalFollowers, followAds, conversionAds,
      costPerFollower: followAds != null && newFollowers != null && newFollowers > 0
        ? roundMoney(followAds / newFollowers) : null,
      monthsWithInputs: inputs.length, monthsInPeriod: periodMonthKeys.size,
      notes: [
        "Las llamadas se atribuyen a su fecha de cita, igual que el cuadro actual. Realizadas = ganadas + perdidas; show rate excluye canceladas y pendientes.",
        "El CAC usa ADS manuales + comisión estimada del 10% sobre contratos nuevos + sueldo de closers, dividido entre altas contractuales. Las cuotas posteriores no aumentan las altas.",
        "No existe un registro completo de conversaciones iniciadas: esa etapa del embudo queda sin dato.",
        "Seguidores y publicidad proceden de los meses guardados en Anual; un campo vacío permanece sin dato.",
      ],
    },
    leads: leads.map((lead) => ({
      id: lead.id, fullName: lead.fullName, status: lead.status,
      callScheduledAt: lead.callScheduledAt.toISOString(), decidedAt: lead.decidedAt?.toISOString() ?? null,
      source: lead.sourceTag?.label ?? null, sourceId: lead.sourceTagId,
      origin: lead.source ?? "Sin origen registrado", notes: lead.followUpNote,
    })),
    health: {
      activeNow: officialActive, activeLegacy: metrics.activePatients,
      activeAtStart: health.activeAtStart, activeAtEnd: health.activeAtEnd,
      additions: health.additions, departures: health.departures, churnRate: health.churnRate,
      arpu: health.averageActive != null && health.averageActive > 0
        ? roundMoney(metrics.income / health.averageActive) : null,
      averageLifetimeMonths: null,
      notes: [
        "Activos hoy: pacientes reales con un periodo activo y fecha de fin futura; incluye pausados, como la app.",
        "Inicio y cierre se estiman con las fechas actuales del historial de suscripciones, sin duplicar pacientes y excluyendo reservas y periodos cancelados. El cierre se limita a hoy cuando el periodo aún no ha terminado.",
        "Entradas y salidas son movimientos netos entre esas dos cohortes. No incluyen todas las altas y reactivaciones intermedias. Churn = pacientes de la cohorte inicial ausentes al cierre / cohorte inicial.",
        "ARPU del periodo = ingresos del resumen / media de clientes al inicio y cierre; no está mensualizado. La reconstrucción puede cambiar si se editan fechas históricas.",
        "El LTV utiliza los cobros registrados por paciente, sin añadir de nuevo el importe completo del contrato. La duración media de vida queda sin dato: no hay un historial de bajas suficientemente fiable para estimarla.",
      ],
    },
    payments: {
      income: metrics.income, expense: metrics.expense, profit: metrics.profit,
      transactionsIncome: metrics.income,
      legacyRenewalIncome: 0, legacyUnverifiedAmount,
      rows, rowCount, truncated: rowCount > rows.length,
      notes: [
        "El recaudado incluye únicamente cobros registrados. Un contrato fraccionado genera varios cobros durante sus meses de pago.",
        "La lista muestra hasta " + PAYMENT_ROW_LIMIT + " movimientos más recientes; los totales abarcan el periodo completo.",
        "Las cuotas futuras no se dan por cobradas. Los avisos de pago y la conciliación verifican cada cobro sin repetirlo.",
      ],
    },
    diagnosis: { billed: metrics.billed, collected: metrics.income,
      difference: roundMoney(metrics.billed - metrics.income), unverifiedLegacy: legacyUnverifiedAmount, findings },
    sources: {
      catalog, breakdown, origins,
      notes: [
        "Las vías usan el catálogo actual de vías, incluidas las inactivas para conservar su historial.",
        "El origen técnico es el origen registrado al crear la cita. Se muestra separado de la vía comercial y no se transforma en una atribución publicitaria.",
        "Los recuentos usan las citas del periodo seleccionado. No se reasignan leads ni se crean etiquetas al consultar este panel.",
      ],
    },
  };
}
