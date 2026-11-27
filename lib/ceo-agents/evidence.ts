import { normalizeOpsConfig } from "@/lib/ops-config";
/** Only this adapter can read business sources. Agent/model code receives this numeric contract, never Prisma or source rows. */
import { prisma } from "@/lib/prisma";
import { activePatientCondition, currentlyPausedCondition } from "@/lib/patient-active";
import { getFinanceLedger } from "@/lib/finance-ledger";
import { summarizeFinanceLedger } from "@/lib/finance";
import { bankAggregate } from "@/lib/bank-finance";
import { completeWindow } from "@/lib/grok-ceo-contract";
import { directionSettings, parseObject, record } from "@/lib/ceo-direction-contract";
import { allFacts, registry, type AgentId, type Evidence, type Fact, type ToolId } from "./contract";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const cents = (v: unknown) => num(v) === null ? null : Math.round(Number(v) * 100);
async function operationsAggregate(now: Date) {
  const [stored, coaches, activeClients] = await Promise.all([
    prisma.opsConfig.findUnique({ where: { id: "singleton" } }),
    prisma.professional.findMany({ where: { active: true, deletedAt: null, OR: [{ role: { in: ["fisio", "head_success"] } }, { extraRoles: { hasSome: ["fisio", "head_success"] } }] }, select: { id: true, maxPatients: true } }),
    prisma.patient.count({ where: { isTest: false, ...activePatientCondition() } }),
  ]);
  const config = normalizeOpsConfig(stored ? { ...stored, occupancyBasis: stored.occupancyBasis === "assigned" ? "assigned" : "active" } : {});
  const threshold = new Date(now.getTime() + config.expectedRenewDays * 86400000), ids = coaches.map(c => c.id);
  const [occupancy, due] = await Promise.all([
    prisma.patient.groupBy({ by: ["assignedProfessionalId"], where: { isTest: false, assignedProfessionalId: { in: ids }, ...(config.occupancyBasis === "assigned" ? {} : activePatientCondition()) }, _count: true }),
    prisma.patient.count({ where: { isTest: false, assignedProfessionalId: { in: ids }, AND: [{ renewals: { some: { status: "active", endDate: { gt: now, lte: threshold } } } }, { renewals: { none: { status: "active", endDate: { gt: threshold } } } }] } }),
  ]);
  return { capacity: coaches.reduce((n, c) => n + (c.maxPatients ?? config.defaultMaxPatients), 0), free: coaches.reduce((n, c) => n + Math.max(0, (c.maxPatients ?? config.defaultMaxPatients) - (occupancy.find(o => o.assignedProfessionalId === c.id)?._count || 0)), 0), activeClients, due, days: config.expectedRenewDays, basis: config.occupancyBasis };
}
async function teamEstimate(now: Date) {
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).format(now);
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find(p => p.type === "year")!.value), m = Number(parts.find(p => p.type === "month")!.value) - 1;
  const start = new Date(Date.UTC(year, m, 1)), end = new Date(Date.UTC(year, m + 1, 1));
  const [configs, ledger, adjustments, leaves] = await Promise.all([
    prisma.compensation.findMany({ where: { professional: { active: true, deletedAt: null } }, select: { professionalId: true, baseSalary: true, perActivePatient: true, renewalOwnPct: true, renewalOthersPct: true, newSaleCommissionPct: true, newSaleScope: true } }),
    getFinanceLedger(start, now),
    prisma.payrollAdjustment.aggregate({ where: { year, month: m, professional: { active: true, deletedAt: null } }, _sum: { amountCents: true } }),
    prisma.professionalLeave.findMany({ where: { status: { not: "cancelled" }, startDate: { lt: end }, endDate: { gte: start } }, select: { professionalId: true, startDate: true, endDate: true } }),
  ]);
  if (!configs.length) return null;
  const counts = await Promise.all(configs.map(c => prisma.patient.count({ where: { assignedProfessionalId: c.professionalId, isTest: false, ...activePatientCondition(), NOT: currentlyPausedCondition() } })));
  let total = 0, variable = 0;
  const durationDays = (end.getTime() - start.getTime()) / 86400000;
  for (const [i, c] of configs.entries()) {
    const sum = (type: string, own?: boolean) => ledger.billedEntries.filter(e => e.type === type && (own === undefined || (e.professionalId === c.professionalId) === own)).reduce((n, e) => n + Math.round(e.amount * 100), 0) / 100;
    const v = c.perActivePatient * counts[i] + c.renewalOwnPct / 100 * sum("income_renewal", true) + c.renewalOthersPct / 100 * sum("income_renewal", false) + c.newSaleCommissionPct / 100 * sum("income_new", c.newSaleScope === "all" ? undefined : true);
    const days = leaves.filter(l => l.professionalId === c.professionalId && Math.round((l.endDate.getTime() - l.startDate.getTime()) / 86400000) + 1 >= 5).reduce((n, l) => n + Math.max(0, (Math.min(end.getTime(), l.endDate.getTime() + 86400000) - Math.max(start.getTime(), l.startDate.getTime())) / 86400000), 0);
    total += (c.baseSalary + v) * Math.max(0, 1 - days / durationDays); variable += v;
  }
  return { totalCents: Math.round(total * 100) + (adjustments._sum.amountCents || 0), variableCents: Math.round(variable * 100), period: `${month}: base mensual y variable registrada hasta hoy (criterio UTC de nóminas)` };
}
export async function collectEvidence(founderId: string, agent: AgentId, now = new Date()): Promise<Evidence> {
  const result: Evidence = { version: 1, tools: {} };
  const allowed = registry[agent].tools;
  const window = completeWindow(30, 0, now), period = `${window.start.toISOString()} / ${window.end.toISOString()}`;
  const asOf = now.toISOString();
  const fact = (key: string, label: string, value: number | null, unit: Fact["unit"], quality: Fact["quality"] = "confirmed", definition = "", at: string | null = asOf, span = period): Fact => ({ key, label, value, unit, quality: value === null ? "unavailable" : quality, definition, asOf: at, period: span });
  async function tool(id: ToolId, fn: () => Promise<NonNullable<Evidence["tools"][ToolId]>>) {
    if (!allowed.includes(id)) return;
    try { result.tools[id] = await fn(); } catch { result.tools[id] = { facts: [], limitations: [`Fuente ${id} temporalmente no disponible; no equivale a cero.`] }; }
  }
  // The daily report is already an aggregate server snapshot. Read metrics only, never its free-form narrative.
  const report = await prisma.ceoReport.findFirst({ where: { periodType: "grok_daily" }, orderBy: { generatedAt: "desc" }, select: { metrics: true, generatedAt: true } });
  const snapshot = parseObject(report?.metrics), month = record(snapshot.last30), previous = record(snapshot.previous30);
  const fresh = !!report && now.getTime() - report.generatedAt.getTime() < 48 * 3600000 && now >= report.generatedAt;
  const operations = allowed.some(k => k === "operations" || k === "retention") ? operationsAggregate(now).catch(() => null) : Promise.resolve(null);
  const reportQuality = fresh ? "confirmed" : "stale", reportAt = report?.generatedAt.toISOString() || null;
  const reportPeriod = typeof month.start === "string" && typeof month.end === "string" ? `${month.start} / ${month.end}` : "Periodo del informe no disponible";
  const rf = (key: string, label: string, value: unknown, unit: Fact["unit"] = "count", definition = "") => fact(key, label, num(value), unit, reportQuality, definition, reportAt, reportPeriod);
  await Promise.all([
    tool("finance", async () => {
      const [ledger, approved, payroll, base, activeTeam, team] = await Promise.all([
        getFinanceLedger(window.start, window.end),
        prisma.businessExpenseCandidate.aggregate({ where: { source: "bank", sourceRef: { startsWith: "ponto:" }, status: "approved", transactionId: { not: null }, occurredAt: { gte: window.start, lte: window.end } }, _sum: { amountCents: true }, _count: true }),
        prisma.transaction.aggregate({ where: { type: "expense", category: "sueldos", occurredAt: { gte: window.start, lte: window.end } }, _sum: { amount: true } }),
        prisma.compensation.aggregate({ where: { professional: { active: true, deletedAt: null } }, _sum: { baseSalary: true }, _count: true }),
        prisma.professional.count({ where: { active: true, deletedAt: null } }),
        teamEstimate(now).catch(() => null),
      ]);
      const totals = summarizeFinanceLedger(ledger);
      return { facts: [fact("income30", "Cobrado registrado", cents(totals.income), "EUR_cents", "confirmed", "Movimientos de ingreso; no sumar los abonos bancarios de Stripe otra vez."),
        fact("billed30", "Contratado / facturado según libro", cents(totals.billed), "EUR_cents", ledger.legacyUnverified.length ? "estimated" : "confirmed", "No es ingreso devengado; incluye el valor contractual registrado."),
        fact("expense30", "Gastos registrados", cents(totals.expense), "EUR_cents", "confirmed", "Incluye gastos manuales y candidatos aprobados; cobertura contable no acreditada completa."),
        fact("validatedBankExpense30", "Gastos Ponto validados", approved._sum.amountCents || 0, "EUR_cents", "confirmed", "Subconjunto del gasto registrado, no volver a sumarlo."),
        fact("cashResult30", "Cobros menos gastos registrados", cents(totals.profit), "EUR_cents", "estimated", "Resultado parcial de caja; no beneficio contable ni variación del saldo."),
        fact("teamPaid30", "Coste de equipo registrado", cents(payroll._sum.amount || 0), "EUR_cents", "confirmed", "Categoría sueldos; ya incluida en gastos registrados."),
        fact("teamBaseMonthly", "Base fija mensual configurada", base._count ? cents(base._sum.baseSalary || 0) : null, "EUR_cents", "estimated", `Configuración de ${base._count} miembros de ${activeTeam} activos. Excluye variables, vacaciones e impuestos. No sumar a los gastos pagados.`, asOf, "Mes de configuración actual"),
        fact("teamMonthEstimate", "Coste de equipo estimado del mes", team?.totalCents ?? null, "EUR_cents", "estimated", "Base + clientes activos + comisiones estimadas desde contratos atribuidos + ajustes − ausencias. No nómina validada; no sumar al gasto pagado.", asOf, team?.period || "Mes actual"),
        fact("teamVariableEstimate", "Componente variable estimado", team?.variableCents ?? null, "EUR_cents", "estimated", "Incluido en el coste estimado del equipo; no añadir de nuevo.", asOf, team?.period || "Mes actual"),
        fact("unverifiedContracts", "Registros financieros por verificar", ledger.legacyUnverified.length, "count", "pending"),
        fact("receivablesOutstanding", "Saldo exigible pendiente de cobro", null, "EUR_cents", "unavailable", "NO se obtiene restando billed30 menos income30: contratos y cobros pertenecen a cohortes distintas."),
        fact("contributionMargin", "Margen de contribución", null, "percent", "unavailable", "Faltan ingreso devengado neto y costes variables atribuidos."),
      ], limitations: ["Gastos completos, impuestos devengados, márgenes y runway todavía sin conciliación integral acreditada.", "Coste de equipo estimado con la configuración y atribución del libro; puede diferir de la nómina final. Requiere validación humana.", ...(ledger.warnings.length ? ["El libro contiene advertencias de calidad o vínculos históricos pendientes."] : [])] };
    }),
    tool("banking", async () => {
      const b = record(await bankAggregate()), at = b.asOf instanceof Date ? b.asOf.toISOString() : typeof b.asOf === "string" ? b.asOf : null;
      const q = b.status === "available" ? "confirmed" : "stale";
      const projection = Array.isArray(b.forecast) ? b.forecast.find(x => record(x).days === 30) : null;
      return { facts: [fact("cash", "Saldo bancario", num(b.currentBalanceCents), "EUR_cents", q, "Saldo de cuentas autorizadas. No beneficio.", at, "Saldo actual"),
        fact("pendingExpenses", "Gastos pendientes de validar", num(b.pendingExpenseCount), "count", "pending", "No contabilizados", at),
        fact("pendingExpensesAmount", "Importe pendiente de validar", num(b.pendingExpenseCents), "EUR_cents", "pending", "No contabilizado", at),
        fact("stripeUnmatched", "Abonos Stripe por conciliar", num(b.stripeUnmatchedCount), "count", q, "Conciliación bancaria, no ventas nuevas", at),
        fact("stripeMatched", "Abonos Stripe conciliados", num(b.stripeMatchedCount), "count", q, "No añadir a ingresos", at),
        fact("subscriptions", "Posibles suscripciones", num(b.subscriptionCount), "count", "estimated", "Patrones detectados; no contratos confirmados", at),
        fact("forecast30", "Previsión de caja a 30 días", b.forecastStatus === "provisional" ? num(record(projection).balanceCents) : null, "EUR_cents", q === "confirmed" ? "estimated" : "stale", "Extrapolación de flujos observados y reserva personal. No compromisos futuros.", at, "Próximos 30 días")],
        limitations: ["Hipoteca personal excluida del gasto del negocio; su salida de caja se contempla en la reserva de previsión.", "Salidas bancarias observadas pueden incluir pendientes y no sustituyen gasto validado."] };
    }),
    tool("commercial", async () => {
      const s = record(month.sales), p = record(previous.sales);
      const followups = await prisma.lead.count({ where: { inFollowUp: true, status: { not: "won" } } });
      return { facts: [fact("followups", "Registros en seguimiento comercial", followups, "count", "confirmed", "Recuento actual; no se leen notas ni datos personales", asOf, "Estado actual"), rf("won30", "Ventas ganadas", s.won), rf("lost30", "Ventas perdidas", s.lost), rf("closeRate30", "Cierre comercial", s.closeRate, "percent", "Ganadas / (ganadas + perdidas) por fecha de decisión"), rf("previousCloseRate30", "Cierre del periodo anterior", p.closeRate, "percent", "30 días inmediatamente anteriores"), rf("scheduled30", "Citas agendadas", s.scheduled, "count", "Por fecha de cita; distinta cohorte de las decisiones"), rf("noShow30", "No presentados", s.no_show)], limitations: ["No se leen grabaciones, transcripciones ni fichas individuales. Objeciones aún no disponibles como categorías agregadas.", "Comparaciones con muestras pequeñas son exploratorias."] };
    }),
    tool("marketing", async () => {
      const content = await prisma.contentPiece.aggregate({ where: { status: "published", metricsFilledAt: { gte: window.start, lte: now } }, _sum: { metricsReach: true, metricsSaves: true, metricsShares: true, metricsDmKeyword: true }, _count: true, _min: { metricsFilledAt: true } });
      const at = content._min.metricsFilledAt?.toISOString() || null, q = at && now.getTime() - Date.parse(at) <= 48 * 3600000 ? "confirmed" : "stale";
      const contentPeriod = "Acumulados de publicaciones con métricas actualizadas en los últimos 30 días; no alcance único del periodo";
      return { facts: [rf("leads30", "Registros CRM creados", month.leadsCreated, "count", "No contactos únicos ni leads cualificados"), rf("previousLeads30", "Registros CRM del periodo anterior", previous.leadsCreated),
        fact("measuredContent", "Publicaciones con métricas recientes", content._count, "count", "confirmed", "Cobertura de la muestra del calendario", asOf, contentPeriod),
        fact("contentReach", "Suma de alcance por publicación", content._sum.metricsReach, "count", q, "No personas únicas: puede repetir audiencia entre publicaciones", at, contentPeriod),
        fact("contentSaves", "Guardados de la muestra", content._sum.metricsSaves, "count", q, "Acumulado de las publicaciones seleccionadas", at, contentPeriod),
        fact("contentShares", "Compartidos de la muestra", content._sum.metricsShares, "count", q, "Acumulado de las publicaciones seleccionadas", at, contentPeriod),
        fact("attributedROAS", "ROAS atribuible", null, "percent")], limitations: ["Gasto/atribución publicitaria todavía no conectados a este motor. No inferir CAC/ROAS.", "Métricas del calendario pueden ser manuales o sincronizadas; contenido sin medición no equivale a cero."] };
    }),
    tool("operations", async () => { const o = await operations; return { facts: [fact("capacity", "Plazas configuradas", o?.capacity ?? null, "count", "confirmed", "Capacidad del equipo según configuración", asOf, "Estado actual"), fact("freeCapacity", "Plazas libres teóricas", o?.free ?? null, "count", "confirmed", "Ocupación según criterio configurado: " + (o?.basis || "no disponible"), asOf, "Estado actual"), fact("activeClients", "Clientes activos", o?.activeClients ?? null, "count", "confirmed", "Incluye activos no asignados", asOf, "Estado actual")], limitations: ["Plazas configuradas no prueban horas disponibles ni calidad del servicio. Solo consultas agregadas de suscripciones, sin fichas ni información clínica."] }; }),
    tool("retention", async () => { const r = record(month.renewals), o = await operations, rate = num(r.renewalRate); return { facts: [rf("renewed30", "Renovaciones ganadas", r.renewed), rf("lostRenewals30", "Renovaciones perdidas", r.lost), rf("renewalRate30", "Tasa de renovación", r.renewalRate, "percent"),
      fact("renewalsDue", "Renovaciones próximas", o?.due ?? null, "count", "confirmed", "Último vencimiento activo de clientes asignados; no contratos nuevos", asOf, `Próximos ${o?.days ?? "?"} días`),
      fact("renewalsExpected", "Escenario de renovaciones esperadas", o && fresh && rate !== null ? Math.round(o.due * rate / 100) : null, "count", "estimated", "Vencimientos próximos × tasa global observada a 30 días. No compromisos ni cobros; hipótesis de persistencia de la tasa.", asOf, `Próximos ${o?.days ?? "?"} días`), fact("renewalsCash", "Cobros futuros por renovación", null, "EUR_cents")], limitations: ["Satisfacción y adherencia agregadas aún no disponibles. Renovaciones esperadas no son compromisos de cobro."] }; }),
    tool("technology", async () => {
      const [tickets, failed] = await Promise.all([prisma.supportTicket.count({ where: { status: { notIn: ["resolved", "declined"] } } }), prisma.ceoAgentRun.count({ where: { founderId, status: { in: ["failed", "rejected"] }, startedAt: { gte: window.start, lte: now } } })]);
      return { facts: [fact("openTickets", "Tickets sin resolver", tickets, "count", "confirmed", "Recuento; no se leen textos ni adjuntos"), fact("failedRuns", "Ejecuciones fallidas o retiradas", failed, "count", "confirmed", "Incluye errores técnicos y respuestas retiradas por calidad", asOf, "Últimos 30 días hasta ahora")], limitations: ["No equivale a disponibilidad del servicio. No se inspeccionan logs con datos de usuarios."] };
    }),
    tool("objectives", async () => {
      const settings = await prisma.ceoDirectionSettings.findUnique({ where: { founderId }, select: { targetsJson: true } });
      const parsed = directionSettings.safeParse({ version: 0, targets: JSON.parse(settings?.targetsJson || "[]") });
      return { facts: parsed.success ? parsed.data.targets.map(t => fact("target_" + t.key, "Objetivo " + t.key, ["cash", "forecast30", "income30"].includes(t.key) ? Math.round(t.minimum * 100) : t.minimum, ["cash", "forecast30", "income30"].includes(t.key) ? "EUR_cents" : t.key.endsWith("Rate30") ? "percent" : "count", "confirmed", "Mínimo establecido por el fundador", asOf, "Objetivo vigente")) : [], limitations: [] };
    }),
  ]);
  // Deterministic deviations use compatible units, never infer missing values as zero.
  for (const target of [...(result.tools.objectives?.facts || [])]) {
    const observed = allFacts(result).find(f => f.key === target.key.slice(7));
    if (observed && observed.value !== null && target.value !== null && observed.unit === target.unit)
      result.tools.objectives!.facts.push({ ...observed, key: "deviation_" + observed.key, label: "Desviación · " + observed.label, value: observed.value - target.value, definition: "Observado menos mínimo del fundador; conserva la calidad del dato observado." });
  }
  return result;
}
