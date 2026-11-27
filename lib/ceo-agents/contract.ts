import { z } from "zod";
export const AGENT_IDS = ["cfo", "cmo", "cso", "coo", "cxo", "cto", "ceo"] as const;
export type AgentId = typeof AGENT_IDS[number];
export const TOOL_IDS = ["finance", "banking", "commercial", "marketing", "operations", "retention", "technology", "objectives"] as const;
export type ToolId = typeof TOOL_IDS[number];
export const registry: Record<AgentId, { name: string; mission: string; tools: readonly ToolId[]; kpis: string[]; cadence: number }> = {
  cfo: { name: "CFO · Finanzas", mission: "Analiza cobros, gastos validados, caja, conciliación, costes y desviaciones. Distingue caja, contratado y beneficio. Evalúa viabilidad y eleva riesgos al CEO.", tools: ["finance", "banking", "retention", "objectives"], kpis: ["Cobrado", "Gasto registrado", "Caja", "Conciliación", "Costes de equipo"], cadence: 24 },
  cmo: { name: "CMO · Marketing", mission: "Detecta oportunidades de captación y contenido. Contrasta registros CRM y resultados comerciales. No atribuyas causalidad ni ROAS sin inversión y atribución verificadas.", tools: ["marketing", "commercial", "objectives"], kpis: ["Registros CRM", "Origen de citas", "Conversión"], cadence: 72 },
  cso: { name: "CSO · Ventas", mission: "Analiza embudo y conversión por cohortes comparables; distingue fecha de cita de decisión. Propón investigaciones de objeciones; no inventes análisis de llamadas que no has leído.", tools: ["commercial", "marketing", "objectives"], kpis: ["Ganadas", "Perdidas", "Cierre", "No asistencia"], cadence: 24 },
  coo: { name: "COO · Operaciones", mission: "Evalúa capacidad agregada y cuellos de botella. Plazas teóricas no prueban capacidad asistencial efectiva. No reasignes pacientes ni tomes decisiones de personal.", tools: ["operations", "objectives"], kpis: ["Capacidad", "Plazas libres", "Renovaciones próximas"], cadence: 72 },
  cxo: { name: "CXO · Experiencia", mission: "Analiza renovaciones y retención agregadas. No infieras satisfacción ni adherencia desde ventas. No accedas a datos clínicos ni individuales.", tools: ["retention", "objectives"], kpis: ["Renovación", "Vencimientos próximos", "Retención"], cadence: 72 },
  cto: { name: "CTO · Tecnología", mission: "Analiza incidencias y automatizaciones agregadas, disponibilidad de fuentes y mejoras. Propón trabajo técnico sin ejecutar despliegues, cambiar permisos ni acceder a secretos.", tools: ["technology", "objectives"], kpis: ["Incidencias abiertas", "Ejecuciones fallidas", "Fuentes disponibles"], cadence: 168 },
  ceo: { name: "CEO · Grok", mission: "Dirige FisioFitCross. Contrasta departamentos, consulta memoria y objetivos, revisa resultados anteriores y prioriza alternativas. Solicita encargos internos de análisis cuando falte evidencia. Decisiones sensibles reservadas al fundador.", tools: TOOL_IDS, kpis: ["Objetivos", "Decisiones", "Resultados", "Desviaciones"], cadence: 24 },
};
export const agentId = z.enum(AGENT_IDS);
export const quality = z.enum(["confirmed", "estimated", "pending", "stale", "unavailable"]);
export const factSchema = z.object({ key: z.string(), label: z.string(), value: z.number().finite().nullable(), unit: z.enum(["EUR_cents", "count", "percent"]), quality, period: z.string(), asOf: z.string().nullable(), definition: z.string() }).strict();
export type Fact = z.infer<typeof factSchema>;
export type Evidence = { version: 1; tools: Partial<Record<ToolId, { facts: Fact[]; limitations: string[] }>> };
const bounded = (max: number) => z.string().trim().min(1).max(max);
export const reportSchema = z.object({
  summary: bounded(2400), findings: z.array(bounded(700)).max(8), limitations: z.array(bounded(400)).max(8),
  recommendations: z.array(z.object({ title: bounded(180), rationale: bounded(900), evidenceKeys: z.array(z.string().max(80)).max(12), reviewDays: z.number().int().min(1).max(90) }).strict()).max(3),
  learning: bounded(1000),
  assignments: z.array(z.object({ agentId: z.enum(["cfo", "cmo", "cso", "coo", "cxo", "cto"]), question: bounded(600) }).strict()).max(3),
}).strict();
export type AgentReport = z.infer<typeof reportSchema>;
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run"), requestId: z.uuid(), agentId, question: bounded(1800), priority: z.number().int().min(0).max(2), dependencies: z.array(z.uuid()).max(6) }).strict(),
  z.object({ action: z.literal("council"), requestId: z.uuid(), question: bounded(1800), agents: z.array(agentId.exclude(["ceo"])).min(2).max(6).refine(a => new Set(a).size === a.length) }).strict(),
  z.object({ action: z.literal("chat"), requestId: z.uuid(), text: bounded(3000) }).strict(),
  z.object({ action: z.literal("process") }).strict(),
  z.object({ action: z.literal("retry"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("configure"), agentId, version: z.number().int().min(0), enabled: z.boolean(), cadenceHours: z.number().int().min(12).max(720), instructions: z.string().max(1800) }).strict(),
  z.object({ action: z.literal("memory"), requestId: z.uuid(), scope: z.union([agentId, z.literal("shared")]), kind: z.enum(["decision", "hypothesis", "experiment", "learning", "preference"]), title: bounded(180), detail: bounded(2400), metricKey: z.string().max(80).nullable(), targetValue: z.number().finite().nullable(), reviewAt: z.iso.datetime().nullable() }).strict(),
  z.object({ action: z.literal("review"), id: z.uuid(), version: z.number().int().min(0), status: z.enum(["approved", "rejected", "running", "evaluated"]), note: bounded(1800) }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export class AgentError extends Error { constructor(message: string, public status = 409) { super(message); } }
export function scopeEvidence(evidence: Evidence, id: AgentId): Evidence {
  return { version: 1, tools: Object.fromEntries(registry[id].tools.filter(k => evidence.tools[k]).map(k => [k, evidence.tools[k]])) };
}
export function allFacts(e: Evidence) { return Object.values(e.tools).flatMap(t => t?.facts || []); }
export function safeBusinessText(text: string) {
  // Prevent common accidental credential/contact disclosures. Source adapters never supply free clinical text.
  return text.replace(/\b(?:sk-|xai-)[A-Za-z0-9_-]{16,}\b/g, "[credencial omitida]")
    .replace(/Bearer\s+\S+/gi, "[credencial omitida]").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[correo omitido]")
    .replace(/\b[A-Z]{2}\d{2}(?:[ ]?\d){16,30}\b/gi, "[cuenta omitida]")
    .replace(/https?:\/\/\S+/gi, "[enlace omitido]");
}
export function canTransition(from: string, to: string) {
  return ({ proposed: ["approved", "rejected"], approved: ["running", "evaluated", "rejected"], running: ["evaluated", "rejected"], evaluated: [], rejected: [] } as Record<string, string[]>)[from]?.includes(to) || false;
}
export const MONTHLY_BUDGET_MICROS = 10_000_000;
export const REQUEST_RESERVE_MICROS = 100_000;
export function budgetAllows(spent: number, reserved: number, halted: boolean) {
  return !halted && spent >= 0 && reserved >= 0 && spent + reserved + REQUEST_RESERVE_MICROS <= MONTHLY_BUDGET_MICROS;
}
export function deterministicReport(e: Evidence, id: AgentId): AgentReport {
  const facts = allFacts(e), missing = facts.filter(f => f.value === null || f.quality !== "confirmed");
  return { summary: `${registry[id].name}: evidencia recopilada. El análisis de Grok está pendiente de activación o presupuesto.`,
    findings: facts.filter(f => f.value !== null).slice(0, 8).map(f => `${f.label}: ${f.unit === "EUR_cents" ? (f.value! / 100).toFixed(2) + " EUR" : f.value + (f.unit === "percent" ? "%" : "")}. ${f.quality}. ${f.period}.`),
    limitations: [...new Set(Object.values(e.tools).flatMap(t => t?.limitations || []))].slice(0, 6).concat(missing.length ? [`${missing.length} indicadores estimados, pendientes, antiguos o no disponibles.`] : []).slice(0, 8),
    recommendations: [], assignments: [], learning: "Sin evaluación generativa. Esta ejecución no aprueba ni ejecuta actuaciones empresariales." };
}

/** Fail closed on invented financial arithmetic. All calculations belong in evidence adapters. */
export function reportEvidenceViolations(report: AgentReport, evidence: Evidence): string[] {
  const text = [report.summary, ...report.findings, ...report.limitations, ...report.assignments.map(a => a.question), ...report.recommendations.flatMap(r => [r.title, r.rationale]), report.learning].join("\n");
  const facts = allFacts(evidence), failures: string[] = [];
  const number = (raw: string) => { let s = raw.replace(/\s/g, ""); if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""); else if (s.includes(",")) s = /,\d{3}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", "."); else if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, ""); return Number(s); };
  for (const m of text.matchAll(/([-+]?\d[\d.,]*(?:\s\d{3})*)\s*(EUR\b|€|%|\bpp\b)/gi)) {
    const v = number(m[1]), monetary = /EUR|€/i.test(m[2]);
    const values = facts.filter(f => f.unit === (monetary ? "EUR_cents" : "percent") && f.value !== null).map(f => monetary ? f.value! / 100 : f.value!);
    if (!values.some(n => Math.abs((m[2].toLowerCase() === "pp" ? Math.abs(n) : n) - (m[2].toLowerCase() === "pp" ? Math.abs(v) : v)) <= (monetary ? 1 : 0.51))) failures.push("unsupported_numeric_claim: " + m[0]);
  }
  const hasReceivables = facts.some(f => f.key === "receivablesOutstanding" && f.value !== null && f.quality === "confirmed");
  if (!hasReceivables) {
    // Reject positive claims about outstanding debt from period billing vs cash, including claims without a currency suffix.
    const paragraphs = text.split(/[\n.!?]+/);
    for (const p of paragraphs) {
      if (/\b(?:gap|brecha|diferencia|pendiente[s]? de cobro|contractual pendiente)\b/i.test(p) && /\b(?:billed|contratad|factur|cobro|cobrad|income)/i.test(p)
        && !/\b(?:no disponible|no consta|no valid|no acredit|no hay|sin datos|no se obtiene|no calcul|no permite|no demuestra|no equivale|no mide|no se puede|no debe|no implica|no representa|no deducir|no inferir|desconocid|sin acreditar|sin poder|no cuantific)/i.test(p)) failures.push("unverified_receivables_claim: " + p.trim().slice(0, 180));
    }
  }
  return [...new Set(failures)];
}
