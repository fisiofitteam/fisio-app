import { z } from "zod";

export const metricDefinitions = {
  cash: { label: "Saldo bancario", unit: "EUR", period: "Saldo actual" },
  forecast30: { label: "Previsión de caja a 30 días", unit: "EUR", period: "Proyección provisional a 30 días" },
  income30: { label: "Cobrado", unit: "EUR", period: "Últimos 30 días completos del informe" },
  leads30: { label: "Registros CRM", unit: "count", period: "Últimos 30 días completos del informe" },
  closeRate30: { label: "Cierre comercial", unit: "percent", period: "Últimos 30 días completos del informe" },
  renewalRate30: { label: "Tasa de renovación", unit: "percent", period: "Últimos 30 días completos del informe" },
} as const;
export type MetricKey = keyof typeof metricDefinitions;
export const metricKeys = Object.keys(metricDefinitions) as MetricKey[];
export type Observation = { key: MetricKey; value: number | null; quality: "available" | "provisional" | "stale" | "unavailable"; asOf: string | null; periodStart: string | null; periodEnd: string | null; sourceId: string | null };
export const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function parseObject(v: string | null | undefined) { try { return record(JSON.parse(v || "null")); } catch { return {}; } }
const finite = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const iso = (v: unknown): string | null => typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : v instanceof Date && Number.isFinite(v.getTime()) ? v.toISOString() : null;
export type ReportMetrics = { id: string; generatedAt: Date | string; metrics: string };

export function directionObservations(bank: unknown, report: ReportMetrics | null, now = new Date()): Observation[] {
  const b = record(bank), asOf = iso(b.asOf), reportAt = iso(report?.generatedAt);
  const metrics = parseObject(report?.metrics), month = record(metrics.last30);
  const fresh = !!reportAt && now.getTime() - Date.parse(reportAt) >= -300000 && now.getTime() - Date.parse(reportAt) < 48 * 3600000;
  const bankFresh = b.status === "available" && !!asOf && now.getTime() - Date.parse(asOf) >= -300000 && now.getTime() - Date.parse(asOf) < 48 * 3600000;
  const forecast = Array.isArray(b.forecast) ? b.forecast.find(x => record(x).days === 30) : null;
  const sales = record(month.sales), renewals = record(month.renewals);
  const rate = (value: unknown, a: unknown, c: unknown) => finite(value) !== null && Number(value) >= 0 && Number(value) <= 100 && finite(a) !== null && finite(c) !== null && Number(a) + Number(c) > 0 ? Number(value) : null;
  const values: Record<MetricKey, number | null> = {
    cash: finite(b.currentBalanceCents) === null ? null : Number(b.currentBalanceCents) / 100,
    forecast30: b.forecastStatus === "provisional" && finite(record(forecast).balanceCents) !== null ? Number(record(forecast).balanceCents) / 100 : null,
    income30: finite(record(month.finance).income), leads30: finite(month.leadsCreated),
    closeRate30: rate(sales.closeRate, sales.won, sales.lost), renewalRate30: rate(renewals.renewalRate, renewals.renewed, renewals.lost),
  };
  return metricKeys.map(key => {
    const isBank = key === "cash" || key === "forecast30", value = values[key];
    const quality = value === null ? "unavailable" : !(isBank ? bankFresh : fresh) ? "stale" : key === "forecast30" ? "provisional" : "available";
    return { key, value, quality, asOf: isBank ? asOf : reportAt, periodStart: isBank ? null : iso(month.start), periodEnd: isBank ? null : iso(month.end), sourceId: isBank ? null : report?.id || null };
  });
}

const target = z.object({ key: z.enum(metricKeys as [MetricKey, ...MetricKey[]]), minimum: z.number().finite().min(0).max(100000000) }).strict().refine(t => metricDefinitions[t.key].unit !== "percent" || t.minimum <= 100, "Porcentaje máximo 100").refine(t => metricDefinitions[t.key].unit !== "count" || Number.isInteger(t.minimum), "Recuento entero");
export const directionSettings = z.object({ version: z.number().int().min(0), targets: z.array(target).max(6).refine(a => new Set(a.map(t => t.key)).size === a.length, "Indicador repetido") }).strict();
export type Target = z.infer<typeof target>;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s + "T12:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s; });
export const priorityCreate = z.object({ id: z.uuid(), reportId: z.string().regex(/^grok-ceo-\d{4}-\d{2}-\d{2}$/), actionIndex: z.number().int().min(0).max(2), dueDay: day.nullable() }).strict();
export const priorityStatuses = ["planned", "in_progress", "blocked", "done", "discarded"] as const;
export const priorityUpdate = z.object({ requestId: z.uuid(), id: z.uuid(), version: z.number().int().min(0), status: z.enum(priorityStatuses), dueDay: day.nullable(), resultNote: z.string().trim().max(1800) }).strict().refine(x => !["done", "discarded"].includes(x.status) || x.resultNote.length > 0, "Anota el resultado o el motivo al cerrar");
export function priorityTitle(narrative: string, index: number): string | null {
  const items = parseObject(narrative).accionesRecomendadas;
  const value = Array.isArray(items) ? items[index] : null;
  return Number.isInteger(index) && index >= 0 && index < 3 && typeof value === "string" && value.trim().length > 0 && value.length <= 700 ? value.trim() : null;
}
export function evaluateTargets(observations: Observation[], targets: Target[]) {
  return targets.map(t => { const o = observations.find(x => x.key === t.key); return { ...t, observation: o || null, state: !o || o.value === null || ["stale", "unavailable"].includes(o.quality) ? "unavailable" : o.value < t.minimum ? "below" : "met" }; });
}
export function viewerReportMetrics(metrics: unknown, isFounder: boolean) {
  const result = { ...record(metrics) };
  if (!isFounder) delete result.banking;
  return result;
}
export const statusLabels: Record<typeof priorityStatuses[number], string> = { planned: "Planificada", in_progress: "En marcha", blocked: "Bloqueada", done: "Completada", discarded: "Descartada" };
