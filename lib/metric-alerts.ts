/**
 * Config de alertas por metricas. Soporta dos fuentes distintas segun el
 * programa del paciente:
 *
 *   - ADVANCE / PREVENTION → PatientDailyLog (fatigue / rpe / sleep — pack
 *     fijo del daily-log del atleta).
 *   - RECUPERA / CONSOLIDA → MetricEntry sobre las MetricDefinition con
 *     auto=true de la biblioteca (dolor, rigidez, etc). Se rellenan cuando
 *     el paciente completa una tarea EVOLUTION.
 *
 * La config es un mapa `{ [key]: MetricRule }` con keys arbitrarias — por
 * eso soporta tanto "fatigue" como "pain" o cualquier otra key clinica que
 * el CEO defina en la biblioteca. En la UI el editor pinta solo las
 * metricas relevantes segun el scope (global vs paciente concreto).
 */
import { prisma } from "@/lib/prisma";
import { createPatientAlert, type AlertSeverity } from "@/lib/patient-alerts";

export type Direction = "increase" | "decrease";

export type MetricRule = {
  enabled: boolean;
  direction: Direction;
  thresholdPct: number;
  windowDays: number;
};

export type MetricAlertConfig = Record<string, MetricRule>;

// ────────────────────────── Fuentes de metricas ──────────────────────────

// Metricas fijas del daily-log de ADVANCE/PREVENTION.
export const DAILY_LOG_METRICS: Array<{ key: string; label: string; emoji: string; hint: string; defaultDir: Direction }> = [
  { key: "fatigue", label: "Fatiga",  emoji: "🪫", hint: "0 = fresco · 10 = agotado",     defaultDir: "increase" },
  { key: "rpe",     label: "RPE",     emoji: "🔥", hint: "0 = suave · 10 = maximo",        defaultDir: "increase" },
  { key: "sleep",   label: "Sueño",   emoji: "😴", hint: "0 = mal descanso · 10 = perfecto", defaultDir: "decrease" },
];

// Metricas de biblioteca (MetricDefinition auto=true) usadas por RECUPERA/CONSOLIDA.
// Se cargan dinamicamente. Por defecto asumimos direccion "increase" (mas = peor)
// porque las 3 tipicas (dolor, rigidez, dolor al inicio del dia) van en esa
// direccion. Si el CEO añade una donde bajar sea malo, tendra que ajustar la
// direccion a mano al activarla.
export async function loadRehabMetricDefs(): Promise<Array<{ key: string; label: string; emoji: string; hint: string; defaultDir: Direction }>> {
  const defs = await prisma.metricDefinition.findMany({
    where: { active: true, auto: true },
    orderBy: { order: "asc" },
    select: { key: true, name: true, unit: true },
  });
  return defs.map((d) => ({
    key: d.key,
    label: d.name,
    emoji: "🩹",
    hint: d.unit ?? "",
    defaultDir: "increase",
  }));
}

export type MetricMeta = { key: string; label: string; emoji: string; hint: string; defaultDir: Direction };

/** Devuelve las metricas relevantes segun el scope del editor. */
export async function loadMetricsForScope(scope: {
  kind: "global";
} | {
  kind: "patient"; programType: string | null;
}): Promise<MetricMeta[]> {
  if (scope.kind === "global") {
    // Global = union de ambas fuentes (el CEO edita defaults para las que
    // aplican a cada programa; los pacientes usan solo su subconjunto).
    const rehab = await loadRehabMetricDefs();
    return [...DAILY_LOG_METRICS, ...rehab];
  }
  const pt = (scope.programType ?? "").toUpperCase();
  if (pt === "ADVANCE" || pt === "PREVENTION") {
    return DAILY_LOG_METRICS;
  }
  // RECUPERA / CONSOLIDA / desconocido → biblioteca clinica.
  return await loadRehabMetricDefs();
}

// ────────────────────────── Plantilla + config ──────────────────────────

/** Crea un default (todo OFF) para las metas dadas. */
export function makeDefaultConfig(metas: MetricMeta[]): MetricAlertConfig {
  const out: MetricAlertConfig = {};
  for (const m of metas) {
    out[m.key] = { enabled: false, direction: m.defaultDir, thresholdPct: 20, windowDays: 7 };
  }
  return out;
}

/** Devuelve la config global. Si no existe la fila, devuelve default vacio. */
export async function getGlobalTemplate(): Promise<MetricAlertConfig> {
  const row = await (prisma as any).metricAlertTemplate.findUnique({ where: { id: "global" } });
  if (!row) return {};
  return normalizeConfig(safeParse(row.config));
}

export async function setGlobalTemplate(config: MetricAlertConfig, updatedById: string | null) {
  const normalized = normalizeConfig(config);
  await (prisma as any).metricAlertTemplate.upsert({
    where: { id: "global" },
    create: { id: "global", config: JSON.stringify(normalized), updatedById },
    update: { config: JSON.stringify(normalized), updatedById },
  });
  return normalized;
}

/** Config efectiva de un paciente: override propio si lo tiene, plantilla si no. */
export async function getEffectiveConfig(patientId: string): Promise<MetricAlertConfig> {
  const patient = await (prisma.patient as any).findUnique({
    where: { id: patientId },
    select: { metricAlertConfig: true },
  });
  const raw: string | null | undefined = patient?.metricAlertConfig;
  if (raw) return normalizeConfig(safeParse(raw));
  return await getGlobalTemplate();
}

export async function hasOverride(patientId: string): Promise<boolean> {
  const p = await (prisma.patient as any).findUnique({
    where: { id: patientId },
    select: { metricAlertConfig: true },
  });
  return !!p?.metricAlertConfig;
}

export async function setPatientOverride(patientId: string, config: MetricAlertConfig | null) {
  await (prisma.patient as any).update({
    where: { id: patientId },
    data: {
      metricAlertConfig: config === null ? null : JSON.stringify(normalizeConfig(config)),
    },
  });
}

// ────────────────────────── Detector daily-log (ADVANCE/PREVENTION) ──────────────────────────

type DailyLogInput = {
  id: string;
  patientId: string;
  fatigue: number;
  rpe: number;
  sleep: number;
  recordedDate: Date;
};

/**
 * Se llama despues de upsert de un PatientDailyLog. Evalua las reglas
 * fatigue/rpe/sleep de la config efectiva. Silencioso ante fallos.
 */
export async function runMetricAlertDetector(log: DailyLogInput): Promise<void> {
  try {
    const config = await getEffectiveConfig(log.patientId);
    const keys = DAILY_LOG_METRICS.map((m) => m.key).filter((k) => config[k]?.enabled);
    if (keys.length === 0) return;

    const maxWindow = Math.max(...keys.map((k) => config[k].windowDays || 7));
    const from = new Date(log.recordedDate);
    from.setUTCDate(from.getUTCDate() - maxWindow);
    const history = await prisma.patientDailyLog.findMany({
      where: {
        patientId: log.patientId,
        recordedDate: { gte: from, lt: log.recordedDate },
      },
      orderBy: { recordedDate: "desc" },
      take: maxWindow,
    });

    for (const key of keys) {
      const rule = config[key];
      const values = history
        .slice(0, rule.windowDays)
        .map((h) => (h as any)[key] as number)
        .filter((v) => typeof v === "number");
      if (values.length < 3) continue;
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      if (avg <= 0) continue;
      const current = (log as any)[key] as number;
      await maybeCreateAlert({
        patientId: log.patientId,
        key,
        current,
        avg,
        rule,
        sourceType: "daily_log",
        sourceId: log.id,
        keyLabel: labelForKey(key),
        emoji: emojiForKey(key),
      });
    }
  } catch { /* nunca bloquear al paciente */ }
}

// ────────────────────────── Detector MetricEntry (RECUPERA/CONSOLIDA) ──────────────────────────

/**
 * Se llama despues de crear MetricEntry al completar una sesion EVOLUTION.
 * Evalua reglas para cada metricKey que se acabe de registrar. Silencioso.
 */
export async function runMetricAlertDetectorForEntry(input: {
  patientId: string;
  metricKey: string;
  currentValue: number;
  recordedAt: Date;
  sourceType: "session";
  sourceId: string;
}): Promise<void> {
  try {
    const config = await getEffectiveConfig(input.patientId);
    const rule = config[input.metricKey];
    if (!rule?.enabled) return;

    // Buscamos el PatientMetric para poder consultar sus MetricEntry.
    const pm = await prisma.patientMetric.findUnique({
      where: { patientId_key: { patientId: input.patientId, key: input.metricKey } },
      select: { id: true, name: true },
    });
    if (!pm) return;

    const from = new Date(input.recordedAt);
    from.setUTCDate(from.getUTCDate() - rule.windowDays);
    const history = await prisma.metricEntry.findMany({
      where: {
        metricId: pm.id,
        recordedAt: { gte: from, lt: input.recordedAt },
      },
      orderBy: { recordedAt: "desc" },
      take: 60,
    });
    // Cogemos como maximo N valores dentro de la ventana; ademas exigimos
    // >=3 muestras para tener media minimamente fiable.
    const values = history.map((h) => h.value).filter((v) => typeof v === "number");
    if (values.length < 3) return;
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    if (avg <= 0) return;

    await maybeCreateAlert({
      patientId: input.patientId,
      key: input.metricKey,
      current: input.currentValue,
      avg,
      rule,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      keyLabel: pm.name,
      emoji: "🩹",
    });
  } catch { /* nunca bloquear */ }
}

// ────────────────────────── Emision de alerta ──────────────────────────

async function maybeCreateAlert(a: {
  patientId: string;
  key: string;
  current: number;
  avg: number;
  rule: MetricRule;
  sourceType: "daily_log" | "session";
  sourceId: string;
  keyLabel: string;
  emoji: string;
}): Promise<void> {
  const deltaPct = ((a.current - a.avg) / a.avg) * 100;
  const triggered =
    a.rule.direction === "increase"
      ? deltaPct >= a.rule.thresholdPct
      : deltaPct <= -a.rule.thresholdPct;
  if (!triggered) return;

  const magnitude = Math.abs(deltaPct);
  const severity: AlertSeverity = magnitude >= a.rule.thresholdPct * 1.75 ? "high" : "warn";
  const sign = deltaPct >= 0 ? "+" : "-";
  const summary = `${a.emoji} ${a.keyLabel} ${sign}${Math.round(magnitude)}% vs media ${a.rule.windowDays}d (hoy ${a.current}, media ${a.avg.toFixed(1)})`;

  await createPatientAlert({
    patientId: a.patientId,
    kind: "metric_deviation",
    severity,
    summary,
    triggerData: {
      metric: a.key,
      current: a.current,
      average: Number(a.avg.toFixed(2)),
      deltaPct: Number(deltaPct.toFixed(2)),
      windowDays: a.rule.windowDays,
      direction: a.rule.direction,
      thresholdPct: a.rule.thresholdPct,
    },
    sourceType: a.sourceType,
    sourceId: a.sourceId,
  });
}

// ────────────────────────── Utilidades ──────────────────────────

function safeParse(raw: string | null | undefined): any {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function labelForKey(key: string): string {
  const m = DAILY_LOG_METRICS.find((x) => x.key === key);
  return m?.label ?? key;
}

function emojiForKey(key: string): string {
  const m = DAILY_LOG_METRICS.find((x) => x.key === key);
  return m?.emoji ?? "📊";
}

/**
 * Normaliza un objeto de config (puede venir parcial o con keys nuevas).
 * Solo conserva las entradas que tienen shape valido; ignora basura. No
 * rellena con defaults (a diferencia de la version anterior) porque las
 * keys ya no son fijas.
 */
export function normalizeConfig(raw: any): MetricAlertConfig {
  const out: MetricAlertConfig = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, val] of Object.entries(raw as Record<string, any>)) {
    if (!val || typeof val !== "object") continue;
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) continue;
    out[key] = {
      enabled: !!(val as any).enabled,
      direction: (val as any).direction === "decrease" ? "decrease" : "increase",
      thresholdPct: clampInt((val as any).thresholdPct, 1, 200, 20),
      windowDays: clampInt((val as any).windowDays, 1, 60, 7),
    };
  }
  return out;
}

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
