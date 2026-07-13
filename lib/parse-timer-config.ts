/**
 * Detecta la configuración de un timer de entrenamiento a partir del título
 * y/o cuerpo de una tarea del rolling. Se ejecuta en cliente cuando el
 * paciente abre una tarea WORKOUT y quiere lanzar el cronómetro.
 *
 * Cubre los 5 modos clásicos:
 *   - EMOM (Every Minute On the Minute)
 *   - Tabata (20s/10s × 8 por defecto, configurable)
 *   - Intervals (work + rest custom × rondas)
 *   - AMRAP (cuenta atrás)
 *   - For time (cuenta arriba, opcional cap)
 *
 * Regex diseñadas para no falsear: si no hay match claro, devuelve null y
 * el UI muestra selector manual.
 */

export type TimerMode = "emom" | "tabata" | "intervals" | "amrap" | "fortime";

export type TimerConfig =
  | { mode: "emom"; totalSeconds: number; intervalSeconds: number }
  | { mode: "tabata"; workSeconds: number; restSeconds: number; rounds: number }
  | { mode: "intervals"; workSeconds: number; restSeconds: number; rounds: number }
  | { mode: "amrap"; totalSeconds: number }
  | { mode: "fortime"; capSeconds: number | null };

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

/** Parsea "12'", "12 min", "12min", "12m", "12 minutos" → 720 (segundos). */
function parseMinutesToken(txt: string): number | null {
  const m = txt.match(/(\d+)\s*(?:'|min\b|minutos?\b|m\b)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return isFinite(n) && n > 0 ? n * 60 : null;
}

/** Parsea "20s", "30 seg", "45 segundos" → segundos. */
function parseSecondsToken(txt: string): number | null {
  const m = txt.match(/(\d+)\s*(?:s\b|seg\b|segundos?\b|"|\)?s)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return isFinite(n) && n > 0 ? n : null;
}

/**
 * Detecta config desde texto. Prioridad:
 *   1. Tabata explícito.
 *   2. EMOM N'.
 *   3. AMRAP N'.
 *   4. For time (con o sin cap).
 *   5. Intervals NxT'/R' (ej. "5x3'/3'" o "4x800m / 90s").
 * Si nada matchea → null.
 */
export function detectTimerConfig(input: { title?: string | null; body?: string | null }): TimerConfig | null {
  const raw = `${input.title ?? ""}\n${input.body ?? ""}`;
  const txt = normalize(raw);

  // Tabata: por defecto 20/10 × 8 salvo que el body diga otra cosa
  if (/\btabata\b/.test(txt)) {
    // Intentamos "tabata 30/15 x 6" o similar
    const custom = txt.match(/tabata[^0-9]*(\d+)\s*[\/x]\s*(\d+)(?:\s*(?:x|×|por)\s*(\d+))?/i);
    if (custom) {
      const work = Number(custom[1]);
      const rest = Number(custom[2]);
      const rounds = custom[3] ? Number(custom[3]) : 8;
      if (work > 0 && rest > 0 && rounds > 0) {
        return { mode: "tabata", workSeconds: work, restSeconds: rest, rounds };
      }
    }
    return { mode: "tabata", workSeconds: 20, restSeconds: 10, rounds: 8 };
  }

  // EMOM
  const emom = txt.match(/emom[^0-9]*(\d+)\s*(?:'|min|minutos?|m\b)?/i);
  if (emom) {
    const totalMin = Number(emom[1]);
    if (isFinite(totalMin) && totalMin > 0) {
      // Intervalo custom "EMOM 15' cada 90s" — raro pero soportado
      const intervalMatch = txt.match(/cada\s*(\d+)\s*s/i);
      const intervalSeconds = intervalMatch ? Math.max(10, Number(intervalMatch[1])) : 60;
      return { mode: "emom", totalSeconds: totalMin * 60, intervalSeconds };
    }
  }

  // AMRAP
  const amrap = txt.match(/amrap[^0-9]*(\d+)\s*(?:'|min|minutos?|m\b)?/i);
  if (amrap) {
    const totalMin = Number(amrap[1]);
    if (isFinite(totalMin) && totalMin > 0) {
      return { mode: "amrap", totalSeconds: totalMin * 60 };
    }
  }

  // For time (con cap opcional)
  if (/\bfor\s*time\b|\bpor\s*tiempo\b/.test(txt)) {
    const cap = txt.match(/cap[^0-9]*(\d+)\s*(?:'|min|minutos?)/i);
    const capSeconds = cap ? Number(cap[1]) * 60 : null;
    return { mode: "fortime", capSeconds };
  }

  // Intervals: patrón "5x3'/3'" o "4x800m R:90s" o "10x30s/15s"
  const intervals = txt.match(/(\d+)\s*[x×]\s*(\d+)\s*['"]?\s*[\/:]\s*(\d+)\s*(['"]|s|min|m|seg)?/i);
  if (intervals) {
    const rounds = Number(intervals[1]);
    const workNum = Number(intervals[2]);
    const restNum = Number(intervals[3]);
    const restUnit = normalize(intervals[4]);
    // Heurística: si el rest es <= 10 → asumimos que work y rest son en la misma unidad
    // del work. Si el work no tiene unidad clara pero parece minutos (>=1 y <= 20),
    // los tratamos como minutos.
    const workSeconds = workNum <= 20 ? workNum * 60 : workNum;
    const restSeconds = /min|m|['"]/.test(restUnit) || (restUnit === "" && restNum <= 10)
      ? restNum * 60
      : restNum;
    if (rounds > 0 && workSeconds > 0 && restSeconds >= 0) {
      return { mode: "intervals", workSeconds, restSeconds, rounds };
    }
  }

  return null;
}

/** Duración total estimada del timer en segundos (para preview en el botón). */
export function estimateTimerTotalSeconds(cfg: TimerConfig): number {
  switch (cfg.mode) {
    case "emom":
    case "amrap":
      return cfg.totalSeconds;
    case "tabata":
    case "intervals":
      return (cfg.workSeconds + cfg.restSeconds) * cfg.rounds;
    case "fortime":
      return cfg.capSeconds ?? 0;
  }
}

export function modeLabel(mode: TimerMode): string {
  switch (mode) {
    case "emom": return "EMOM";
    case "tabata": return "Tabata";
    case "intervals": return "Intervalos";
    case "amrap": return "AMRAP";
    case "fortime": return "For time";
  }
}
