// Mensaje de bienvenida de la home del paciente: tipos, defaults, normalización
// y selección por reglas. Sin dependencias de servidor (se puede usar en cliente).

export type WelcomeRule = {
  programType: "RECUPERA" | "CONSOLIDA" | "ADVANCE" | "any";
  minWeeks: number | null; // semanas en programa >= minWeeks (null = sin mínimo)
  maxWeeks: number | null; // semanas en programa < maxWeeks (null = sin máximo)
  line1: string;
  line2: string;
};

export type WelcomeConfig = {
  rules: WelcomeRule[];
  fallbackLine1: string;
  fallbackLine2: string;
};

// Por defecto: sin reglas, mensaje actual como fallback (no cambia el comportamiento
// hasta que el CEO añada reglas).
export const WELCOME_DEFAULTS: WelcomeConfig = {
  rules: [],
  fallbackLine1: "Lo difícil era empezar.",
  fallbackLine2: "Ya estás aquí.",
};

const PROGRAMS = ["RECUPERA", "CONSOLIDA", "ADVANCE", "any"];

export function normalizeWelcomeConfig(raw: unknown): WelcomeConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v : fb);
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const rawRules = Array.isArray(o.rules) ? o.rules : [];
  const rules: WelcomeRule[] = [];
  for (const r of rawRules as any[]) {
    if (!r || typeof r !== "object") continue;
    const line1 = typeof r.line1 === "string" ? r.line1 : "";
    const line2 = typeof r.line2 === "string" ? r.line2 : "";
    if (!line1.trim() && !line2.trim()) continue; // regla vacía
    rules.push({
      programType: PROGRAMS.includes(r.programType) ? r.programType : "any",
      minWeeks: num(r.minWeeks),
      maxWeeks: num(r.maxWeeks),
      line1,
      line2,
    });
  }
  return {
    rules,
    fallbackLine1: str(o.fallbackLine1, WELCOME_DEFAULTS.fallbackLine1),
    fallbackLine2: str(o.fallbackLine2, WELCOME_DEFAULTS.fallbackLine2),
  };
}

// Devuelve la primera regla que encaja con el programa y las semanas en programa.
// Si ninguna encaja, devuelve el fallback.
export function pickWelcomeMessage(
  config: WelcomeConfig,
  ctx: { programType: string | null; weeksInProgram: number }
): { line1: string; line2: string } {
  for (const r of config.rules) {
    if (r.programType !== "any" && r.programType !== ctx.programType) continue;
    if (r.minWeeks != null && ctx.weeksInProgram < r.minWeeks) continue;
    if (r.maxWeeks != null && ctx.weeksInProgram >= r.maxWeeks) continue;
    return { line1: r.line1, line2: r.line2 };
  }
  return { line1: config.fallbackLine1, line2: config.fallbackLine2 };
}
