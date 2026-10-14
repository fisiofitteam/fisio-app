/**
 * evaluate() del Autotest Funcional del Hombro.
 *
 * Partimos de un baseline 50 en cada una de las 6 áreas. Cada respuesta
 * aporta sus `deltas` (ver preguntas.ts). Clampamos a [0, 100].
 *
 * Igual que en el Semáforo: la función la comparten cliente y servidor —
 * el cliente la usa para pintar el resultado en vivo, el servidor la
 * recalcula al cerrar el registro para no confiar en lo que mande el
 * navegador. Cualquier cambio aquí afecta a ambos lados.
 */

import { AREAS, type AreaId } from "./areas";
import { Q } from "./preguntas";
import { selectArquetipo, type ArquetipoId, type Scores } from "./arquetipos";

export type Respuestas = Record<string, { v: string } | string | undefined>;

export type EvaluationResult = {
  scores: Scores;
  arquetipoId: ArquetipoId;
};

// Baseline neutral de cada área. Subimos a 55 (antes 50) para que un
// atleta medio no caiga a "En Reconstrucción" por sumar unos cuantos
// deltas negativos leves; los perfiles problemáticos reales siguen
// bajando por debajo de los umbrales de ese arquetipo.
const BASELINE = 55;

function emptyScores(): Scores {
  return {
    movilidadOverhead: BASELINE,
    estabilidadEscapular: BASELINE,
    fuerzaEmpuje: BASELINE,
    controlDinamico: BASELINE,
    rotacionExterna: BASELINE,
    confianza: BASELINE,
  };
}

function clamp(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

export function evaluate(answers: Respuestas): EvaluationResult {
  const scores = emptyScores();

  for (const q of Q) {
    if (q.type !== "single") continue;
    const raw = answers[q.id];
    const v = typeof raw === "object" && raw && "v" in raw ? raw.v : raw;
    if (!v) continue;
    const opt = q.options.find((o) => o.v === v);
    if (!opt?.deltas) continue;
    for (const [area, delta] of Object.entries(opt.deltas) as [AreaId, number][]) {
      scores[area] += delta;
    }
  }

  const finalScores: Scores = {} as Scores;
  for (const a of AREAS) {
    finalScores[a.id] = clamp(scores[a.id]);
  }

  return {
    scores: finalScores,
    arquetipoId: selectArquetipo(finalScores).id,
  };
}
