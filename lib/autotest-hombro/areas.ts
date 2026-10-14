/**
 * Las 6 áreas que mide el Autotest Funcional del Hombro para CrossFit.
 * Cada respuesta del test puntúa a una o varias áreas (ver preguntas.ts).
 * Al final se pintan 6 barras 0-100 con color verde/ámbar/rojo según el %.
 *
 * Baseline inicial = 50 (ni fuerte ni débil). Cada respuesta ajusta ±deltas
 * configurados en preguntas.ts; el resultado se clampa a [0, 100].
 */

export type AreaId =
  | "movilidadOverhead"
  | "estabilidadEscapular"
  | "fuerzaEmpuje"
  | "controlDinamico"
  | "rotacionExterna"
  | "confianza";

export type AreaMeta = {
  id: AreaId;
  name: string;
  short: string;
  emoji: string;
  /** Explicación breve cuando el área sale bajo (<40) en el resultado. */
  weakHint: string;
};

export const AREAS: readonly AreaMeta[] = [
  {
    id: "movilidadOverhead",
    name: "Movilidad overhead",
    short: "Movilidad",
    emoji: "🎯",
    weakHint:
      "Te falta recorrido para colocar bien el brazo arriba, así que compensas con lumbar o caderas en snatch/jerk.",
  },
  {
    id: "estabilidadEscapular",
    name: "Estabilidad escapular",
    short: "Estabilidad",
    emoji: "🛡",
    weakHint:
      "El hombro aguanta por ósea, no por control. Es la base del dolor \"detrás del WOD\" al día siguiente.",
  },
  {
    id: "fuerzaEmpuje",
    name: "Fuerza de empuje vertical",
    short: "Fuerza",
    emoji: "💪",
    weakHint:
      "Fuerza por encima de la cabeza corta. Afecta a HSPU, press, jerk y a la capacidad de recibir pesos en snatch.",
  },
  {
    id: "controlDinamico",
    name: "Control dinámico y kipping",
    short: "Control",
    emoji: "🤸",
    weakHint:
      "Pierdes el hombro cuando añades kipping o velocidad. Suele ser el techo real en pull-ups y muscle-ups.",
  },
  {
    id: "rotacionExterna",
    name: "Rotación externa y snatch",
    short: "Rotación",
    emoji: "🔄",
    weakHint:
      "La recepción del snatch sufre: te vas por delante o cedes el brazo en vez de rotar y bloquear.",
  },
  {
    id: "confianza",
    name: "Confianza percibida",
    short: "Confianza",
    emoji: "🧠",
    weakHint:
      "No confías en tu hombro bajo carga. La parte técnica probablemente mejoraría si la cabeza acompañara.",
  },
] as const;

/** 0..100 → "verde" | "amber" | "red". */
export function levelFromScore(score: number): "green" | "amber" | "red" {
  if (score >= 65) return "green";
  if (score >= 40) return "amber";
  return "red";
}
