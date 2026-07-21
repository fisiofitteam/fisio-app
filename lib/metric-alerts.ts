/**
 * Config de alertas por metricas del daily-log.
 *
 * Hay dos capas:
 *   - Plantilla global (MetricAlertTemplate, id="global") — el CEO/head_success
 *     la edita en /fisio/ajustes. Sirve de default para pacientes sin override.
 *   - Override por paciente (Patient.metricAlertConfig). Si no es null,
 *     tiene prioridad; si es null, se usa la plantilla.
 *
 * El detector se llama despues de guardar un PatientDailyLog: para cada
 * metrica ENABLED, compara el valor de hoy con la media de los ultimos
 * `windowDays` (excluyendo hoy). Si supera `thresholdPct` en la direccion
 * configurada → crea una PatientAlert kind="metric_deviation".
 */
import { prisma } from "@/lib/prisma";
import { createPatientAlert, type AlertSeverity } from "@/lib/patient-alerts";

// Metricas soportadas en A.2. Solo las 3 del daily-log. Cuando se
// añadan mas metricas custom, se extiende aqui.
export type MetricKey = "fatigue" | "rpe" | "sleep";

export type Direction = "increase" | "decrease";

export type MetricRule = {
  enabled: boolean;
  // "increase" → alerta si la metrica sube por encima de la media.
  // "decrease" → alerta si baja por debajo.
  direction: Direction;
  // Porcentaje de desviacion respecto a la media que dispara alerta.
  thresholdPct: number;
  // Cuantos dias hacia atras se usan para calcular la media base.
  windowDays: number;
};

export type MetricAlertConfig = Record<MetricKey, MetricRule>;

export const METRIC_KEYS: MetricKey[] = ["fatigue", "rpe", "sleep"];

export const METRIC_META: Record<MetricKey, { label: string; emoji: string; defaultDir: Direction }> = {
  fatigue: { label: "Fatiga",  emoji: "🪫", defaultDir: "increase" },
  rpe:     { label: "RPE",     emoji: "🔥", defaultDir: "increase" },
  sleep:   { label: "Sueño",   emoji: "😴", defaultDir: "decrease" },
};

// Plantilla por defecto que se crea si aun no existe la fila "global".
// Todo desactivado — el CEO decide que vigilar. Coherente con "cuidado
// con las metricas, no queremos falsos positivos".
export const DEFAULT_TEMPLATE: MetricAlertConfig = {
  fatigue: { enabled: false, direction: "increase", thresholdPct: 20, windowDays: 7 },
  rpe:     { enabled: false, direction: "increase", thresholdPct: 20, windowDays: 7 },
  sleep:   { enabled: false, direction: "decrease", thresholdPct: 20, windowDays: 7 },
};

/** Devuelve la config global. Si no existe la fila, la crea con los defaults. */
export async function getGlobalTemplate(): Promise<MetricAlertConfig> {
  const row = await (prisma as any).metricAlertTemplate.findUnique({ where: { id: "global" } });
  if (!row) return DEFAULT_TEMPLATE;
  const parsed = safeParse(row.config);
  return normalizeConfig(parsed);
}

/** Actualiza (o crea) la plantilla global. */
export async function setGlobalTemplate(config: MetricAlertConfig, updatedById: string | null) {
  const normalized = normalizeConfig(config);
  await (prisma as any).metricAlertTemplate.upsert({
    where: { id: "global" },
    create: { id: "global", config: JSON.stringify(normalized), updatedById },
    update: { config: JSON.stringify(normalized), updatedById },
  });
  return normalized;
}

/**
 * Devuelve la config efectiva para un paciente: su override si lo tiene,
 * si no la plantilla global. Se usa tanto en el detector como en la UI
 * de override (para mostrar "esto es lo que hay ahora").
 */
export async function getEffectiveConfig(patientId: string): Promise<MetricAlertConfig> {
  // Casteamos a any porque en dev el generate de Prisma falla por otros
  // campos Json? y el tipo no incluye metricAlertConfig hasta que se
  // regenera en prod. En prod el tipo es correcto y funciona igual.
  const patient = await (prisma.patient as any).findUnique({
    where: { id: patientId },
    select: { metricAlertConfig: true },
  });
  const raw: string | null | undefined = patient?.metricAlertConfig;
  if (raw) return normalizeConfig(safeParse(raw));
  return await getGlobalTemplate();
}

/** True si el paciente tiene override propio (para pintar en UI "personalizado"). */
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

// ────────────────────────── Detector ──────────────────────────

type DailyLogInput = {
  id: string;
  patientId: string;
  fatigue: number;
  rpe: number;
  sleep: number;
  recordedDate: Date;
};

/**
 * Se llama despues de upsert de un PatientDailyLog. Evalua cada metrica
 * ENABLED en la config efectiva del paciente y crea alertas si procede.
 * Nunca lanza — si algo peta, silenciamos (no queremos bloquear el
 * daily-log del paciente).
 */
export async function runMetricAlertDetector(log: DailyLogInput): Promise<void> {
  try {
    const config = await getEffectiveConfig(log.patientId);
    const enabledKeys = METRIC_KEYS.filter((k) => config[k]?.enabled);
    if (enabledKeys.length === 0) return;

    // Cargamos ventana maxima que pida cualquier metrica activada (para
    // no hacer N queries). Excluimos el log de hoy (mismo recordedDate).
    const maxWindow = Math.max(...enabledKeys.map((k) => config[k].windowDays || 7));
    const from = new Date(log.recordedDate);
    from.setUTCDate(from.getUTCDate() - maxWindow);

    const history = await prisma.patientDailyLog.findMany({
      where: {
        patientId: log.patientId,
        recordedDate: { gte: from, lt: log.recordedDate },
      },
      orderBy: { recordedDate: "desc" },
      take: maxWindow, // cota superior por si hubiera duplicados
    });

    for (const key of enabledKeys) {
      const rule = config[key];
      const values = history
        .slice(0, rule.windowDays)
        .map((h) => (h as any)[key] as number)
        .filter((v) => typeof v === "number");
      // Necesitamos al menos 3 muestras previas para que la media tenga
      // sentido; con menos, no sabemos si el paciente ha empeorado o
      // simplemente empieza. Silencioso.
      if (values.length < 3) continue;

      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      if (avg <= 0) continue;

      const current = (log as any)[key] as number;
      const deltaPct = ((current - avg) / avg) * 100;

      const triggered =
        rule.direction === "increase"
          ? deltaPct >= rule.thresholdPct
          : deltaPct <= -rule.thresholdPct;
      if (!triggered) continue;

      const magnitude = Math.abs(deltaPct);
      const severity: AlertSeverity = magnitude >= rule.thresholdPct * 1.75 ? "high" : "warn";

      const meta = METRIC_META[key];
      const sign = deltaPct >= 0 ? "+" : "-";
      const summary = `${meta.emoji} ${meta.label} ${sign}${Math.round(magnitude)}% vs media ${rule.windowDays}d (hoy ${current}, media ${avg.toFixed(1)})`;

      await createPatientAlert({
        patientId: log.patientId,
        kind: "metric_deviation",
        severity,
        summary,
        triggerData: {
          metric: key,
          current,
          average: Number(avg.toFixed(2)),
          deltaPct: Number(deltaPct.toFixed(2)),
          windowDays: rule.windowDays,
          direction: rule.direction,
          thresholdPct: rule.thresholdPct,
          samples: values.length,
        },
        sourceType: "daily_log",
        sourceId: log.id,
      });
    }
  } catch {
    // El detector nunca rompe el flujo del paciente.
  }
}

// ────────────────────────── Utilidades ──────────────────────────

function safeParse(raw: string | null | undefined): any {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

/**
 * Normaliza cualquier objeto ampplios (o parcial) al shape completo con las
 * 3 metricas. Si falta alguna clave, se rellena con el default de la
 * plantilla base — asi la UI y el detector siempre asumen el shape completo.
 */
export function normalizeConfig(raw: any): MetricAlertConfig {
  const out: MetricAlertConfig = { ...DEFAULT_TEMPLATE };
  if (!raw || typeof raw !== "object") return out;
  for (const key of METRIC_KEYS) {
    const r = raw[key];
    if (!r || typeof r !== "object") continue;
    out[key] = {
      enabled: !!r.enabled,
      direction: r.direction === "decrease" ? "decrease" : (r.direction === "increase" ? "increase" : METRIC_META[key].defaultDir),
      thresholdPct: clampInt(r.thresholdPct, 1, 200, 20),
      windowDays: clampInt(r.windowDays, 1, 60, 7),
    };
  }
  return out;
}

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
