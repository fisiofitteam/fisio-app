/**
 * Modelo del timer: un TimerConfig es una SECUENCIA de bloques.
 * Un timer sencillo tiene 1 bloque. Uno complejo puede ser p.ej.
 *   [ EMOM 4' cada 60s, REST 1', EMOM 3' cada 45s, REST 1', EMOM 2' cada 30s ]
 * o
 *   [ AMRAP 5', REST 2', AMRAP 5', REST 2', AMRAP 5' ]
 *
 * El motor del WorkoutTimer recorre los bloques uno a uno. Cada bloque
 * gestiona su cuenta atrás; al terminar, pasa al siguiente. Cuando no
 * hay siguiente → DONE.
 */

export type TimerBlockKind = "amrap" | "emom" | "tabata" | "intervals" | "fortime" | "rest";

export type TimerBlock =
  | { kind: "amrap"; totalSeconds: number; label?: string }
  | { kind: "emom"; totalSeconds: number; intervalSeconds: number; label?: string }
  | { kind: "tabata"; workSeconds: number; restSeconds: number; rounds: number; label?: string }
  | { kind: "intervals"; workSeconds: number; restSeconds: number; rounds: number; label?: string }
  | { kind: "fortime"; capSeconds: number | null; label?: string }
  | { kind: "rest"; totalSeconds: number; label?: string };

export type TimerConfig = {
  blocks: TimerBlock[];
};

// ────────────────────────── helpers ──────────────────────────

export function blockLabel(b: TimerBlock): string {
  switch (b.kind) {
    case "amrap":     return b.label ?? "AMRAP";
    case "emom":      return b.label ?? "EMOM";
    case "tabata":    return b.label ?? "Tabata";
    case "intervals": return b.label ?? "Intervalos";
    case "fortime":   return b.label ?? "For time";
    case "rest":      return b.label ?? "Descanso";
  }
}

export function blockDurationSeconds(b: TimerBlock): number {
  switch (b.kind) {
    case "amrap":     return b.totalSeconds;
    case "emom":      return b.totalSeconds;
    case "tabata":    return (b.workSeconds + b.restSeconds) * b.rounds;
    case "intervals": return (b.workSeconds + b.restSeconds) * b.rounds;
    case "fortime":   return b.capSeconds ?? 0;
    case "rest":      return b.totalSeconds;
  }
}

export function configDurationSeconds(cfg: TimerConfig): number {
  return cfg.blocks.reduce((sum, b) => sum + blockDurationSeconds(b), 0);
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, "0")}`;
}

// ────────────────────────── parser local (regex) ──────────────────────────

// Parser básico que cubre los patrones más comunes en título/body cortos.
// Para casos con multi-bloque el pipeline llama al endpoint IA como refuerzo.

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

/**
 * Detecta un TimerConfig sencillo (1 bloque) desde texto libre.
 * Si detecta multi-bloque devuelve null y el frontend cae a IA.
 */
export function detectTimerConfig(input: { title?: string | null; body?: string | null }): TimerConfig | null {
  const raw = `${input.title ?? ""}\n${input.body ?? ""}`;
  const txt = normalize(raw);

  // Si tiene ≥2 palabras clave, probablemente es multi-bloque → dejamos que la IA lo maneje
  const keywords = ["amrap", "emom", "tabata", "for time", "por tiempo"];
  const hits = keywords.reduce((n, k) => n + (txt.includes(k) ? 1 : 0), 0);
  if (hits >= 2) return null;

  // Tabata
  if (/\btabata\b/.test(txt)) {
    const custom = txt.match(/tabata[^0-9]*(\d+)\s*[\/x]\s*(\d+)(?:\s*(?:x|×|por)\s*(\d+))?/i);
    if (custom) {
      const work = Number(custom[1]);
      const rest = Number(custom[2]);
      const rounds = custom[3] ? Number(custom[3]) : 8;
      if (work > 0 && rest > 0 && rounds > 0) {
        return { blocks: [{ kind: "tabata", workSeconds: work, restSeconds: rest, rounds }] };
      }
    }
    return { blocks: [{ kind: "tabata", workSeconds: 20, restSeconds: 10, rounds: 8 }] };
  }

  // EMOM
  const emom = txt.match(/emom[^0-9]*(\d+)\s*(?:'|min|minutos?|m\b)?/i);
  if (emom) {
    const totalMin = Number(emom[1]);
    if (isFinite(totalMin) && totalMin > 0) {
      const intervalMatch = txt.match(/cada\s*(\d+)\s*s/i);
      const intervalSeconds = intervalMatch ? Math.max(10, Number(intervalMatch[1])) : 60;
      return { blocks: [{ kind: "emom", totalSeconds: totalMin * 60, intervalSeconds }] };
    }
  }

  // AMRAP
  const amrap = txt.match(/amrap[^0-9]*(\d+)\s*(?:'|min|minutos?|m\b)?/i);
  if (amrap) {
    const totalMin = Number(amrap[1]);
    if (isFinite(totalMin) && totalMin > 0) {
      return { blocks: [{ kind: "amrap", totalSeconds: totalMin * 60 }] };
    }
  }

  // For time
  if (/\bfor\s*time\b|\bpor\s*tiempo\b/.test(txt)) {
    const cap = txt.match(/cap[^0-9]*(\d+)\s*(?:'|min|minutos?)/i);
    const capSeconds = cap ? Number(cap[1]) * 60 : null;
    return { blocks: [{ kind: "fortime", capSeconds }] };
  }

  // Intervals: "5x3'/3'"
  const intervals = txt.match(/(\d+)\s*[x×]\s*(\d+)\s*['"]?\s*[\/:]\s*(\d+)\s*(['"]|s|min|m|seg)?/i);
  if (intervals) {
    const rounds = Number(intervals[1]);
    const workNum = Number(intervals[2]);
    const restNum = Number(intervals[3]);
    const restUnit = normalize(intervals[4]);
    const workSeconds = workNum <= 20 ? workNum * 60 : workNum;
    const restSeconds = /min|m|['"]/.test(restUnit) || (restUnit === "" && restNum <= 10)
      ? restNum * 60
      : restNum;
    if (rounds > 0 && workSeconds > 0 && restSeconds >= 0) {
      return { blocks: [{ kind: "intervals", workSeconds, restSeconds, rounds }] };
    }
  }

  return null;
}

// Compat con imports antiguos
export type TimerMode = TimerBlockKind;
export const modeLabel = (m: TimerMode): string => {
  switch (m) {
    case "amrap":     return "AMRAP";
    case "emom":      return "EMOM";
    case "tabata":    return "Tabata";
    case "intervals": return "Intervalos";
    case "fortime":   return "For time";
    case "rest":      return "Descanso";
  }
};
export const estimateTimerTotalSeconds = configDurationSeconds;
