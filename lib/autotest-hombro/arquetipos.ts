/**
 * Arquetipos del Autotest Funcional del Hombro.
 *
 * Dado el vector de scores (6 áreas 0-100), elegimos el arquetipo que mejor
 * clasifica al atleta. El orden del catálogo IMPORTA: la primera condición
 * que matchee gana (de ahí que el "Competitivo" vaya primero y el default
 * "En Reconstrucción" al final).
 *
 * Cada arquetipo tiene una narrativa que explica qué significa el perfil y
 * cuál es el siguiente paso. El CTA de WhatsApp hereda este tono.
 */

import type { AreaId } from "./areas";

export type ArquetipoId =
  | "COMPETITIVO"
  | "CABALLO_DESCONTROLADO"
  | "RIGIDO"
  | "INESTABLE"
  | "FLUIDO_DEBIL"
  | "RECONSTRUCCION";

export type Scores = Record<AreaId, number>;

export type Arquetipo = {
  id: ArquetipoId;
  emoji: string;
  title: string;
  /** 2-3 líneas en primera persona para el atleta: qué le pasa y qué toca. */
  summary: string;
  /** Match function sobre el vector de scores. Primero que haga true gana. */
  match: (s: Scores) => boolean;
};

const avg = (s: Scores) =>
  (s.movilidadOverhead + s.estabilidadEscapular + s.fuerzaEmpuje +
   s.controlDinamico + s.rotacionExterna + s.confianza) / 6;

const low = (s: Scores, threshold = 40) =>
  Object.values(s).filter((v) => v < threshold).length;

export const ARQUETIPOS: readonly Arquetipo[] = [
  {
    id: "COMPETITIVO",
    emoji: "💎",
    title: "Hombro Competitivo",
    summary:
      "Tienes buena base en todo. Tu hombro no es el eslabón débil: aguanta carga, se mueve con soltura y lo controlas. Toca pulir detalles y meter volumen bien pautado para seguir subiendo marcas sin tocar techo por lesión.",
    match: (s) => avg(s) >= 68 && low(s, 50) === 0,
  },
  {
    id: "RECONSTRUCCION",
    emoji: "🧩",
    title: "En Reconstrucción",
    summary:
      "El hombro no está preparado para la carga del box todavía. Varias capacidades están claramente por debajo de lo que necesita para entrenar sin que empieces a arrastrar molestias. No es un problema, es tu punto de partida: primero construimos base, después progresamos a lo técnico.",
    // Solo salta cuando el hombro de verdad está mal — necesitamos al
    // menos 4 áreas muy bajas (<30) y una media global <40. Antes era
    // demasiado laxo y absorbía a la mayoría de atletas.
    match: (s) => low(s, 30) >= 4 && avg(s) < 40,
  },
  {
    id: "CABALLO_DESCONTROLADO",
    emoji: "🐴",
    title: "Caballo Descontrolado",
    summary:
      "Mueves pesado y empujas fuerte, pero el hombro aguanta de milagro, no por control. Eres el típico atleta que \"tira de huevos\" en el WOD y luego se queja al día siguiente. Trabaja estabilidad escapular antes de que te pase factura.",
    match: (s) => s.fuerzaEmpuje >= 55 && s.estabilidadEscapular < 50,
  },
  {
    id: "RIGIDO",
    emoji: "🪵",
    title: "Rígido Vertical",
    summary:
      "Tienes músculo pero el hombro no tiene recorrido para colocarse donde necesita. Compensas con lumbar en los overhead y pierdes la cabeza del húmero en el snatch. La movilidad arriba te está limitando más que la fuerza.",
    match: (s) => s.movilidadOverhead < 50 && s.fuerzaEmpuje >= 45,
  },
  {
    id: "FLUIDO_DEBIL",
    emoji: "🏃",
    title: "Fluido pero Débil",
    summary:
      "La técnica la tienes: te mueves bien, el hombro va donde tiene que ir. Lo que te falta es fuerza para mantenerla cuando el WOD se pone pesado. Toca empujar carga vertical específica — HSPU, press, jerk — con progresiones claras.",
    match: (s) => s.movilidadOverhead >= 50 && s.rotacionExterna >= 45 && s.fuerzaEmpuje < 50,
  },
  {
    id: "INESTABLE",
    emoji: "🌀",
    title: "Atleta Inestable",
    summary:
      "Te mueves con soltura pero el hombro pierde control cuando añades kipping o velocidad. En gymnastics vas a tirones, no fluido. El techo real para tus pull-ups y muscle-ups está en el control escapular, no en la fuerza.",
    // Pasa a ser el "cajón de sastre" para atletas con control o
    // estabilidad limitada — el perfil más frecuente en CrossFit.
    match: (s) => s.controlDinamico < 55 || s.estabilidadEscapular < 55,
  },
];

/** Fallback si nada matchea (defensa en depth). En la práctica es muy raro
 *  porque INESTABLE captura casi todo lo que no ha caído en bucket específico. */
const DEFAULT: Arquetipo = ARQUETIPOS.find((a) => a.id === "INESTABLE")!;

export function selectArquetipo(scores: Scores): Arquetipo {
  for (const a of ARQUETIPOS) {
    if (a.match(scores)) return a;
  }
  return DEFAULT;
}

export function arquetipoById(id: string | null | undefined): Arquetipo | null {
  if (!id) return null;
  return ARQUETIPOS.find((a) => a.id === id) ?? null;
}
