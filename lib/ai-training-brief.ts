// Lectura/escritura del brief de estilo de sesiones ADVANCE. Hay uno por
// kind: "accesorios" (sesiones cortas de movilidad/técnica/activación) y
// "entrenamiento" (sesión principal de fuerza/metcon).

import { prisma } from "@/lib/prisma";
import { TRAINING_BRIEF_SEED_BY_KIND } from "@/lib/ai-training-brief-seed";

export type BriefKind = "accesorios" | "entrenamiento";
export const BRIEF_KINDS: BriefKind[] = ["accesorios", "entrenamiento"];

export function isBriefKind(x: unknown): x is BriefKind {
  return x === "accesorios" || x === "entrenamiento";
}

export const BRIEF_KIND_LABEL: Record<BriefKind, string> = {
  accesorios: "Accesorios (movilidad · técnica · activación)",
  entrenamiento: "Entrenamiento (fuerza · metcon)",
};

export type AiTrainingBriefData = {
  systemPrompt: string;
  philosophy: string;
  voiceTone: string;
  structureHints: string;
  formats: string;
  intensityRules: string;
  vocabulary: string;
  dos: string;
  donts: string;
  goodExamples: string;
  badExamples: string;
};

const EMPTY: AiTrainingBriefData = {
  systemPrompt: "",
  philosophy: "",
  voiceTone: "",
  structureHints: "",
  formats: "",
  intensityRules: "",
  vocabulary: "",
  dos: "",
  donts: "",
  goodExamples: "",
  badExamples: "",
};

function toData(row: {
  systemPrompt: string;
  philosophy: string;
  voiceTone: string;
  structureHints: string;
  formats: string;
  intensityRules: string;
  vocabulary: string;
  dos: string;
  donts: string;
  goodExamples: string;
  badExamples: string;
}): AiTrainingBriefData {
  return {
    systemPrompt: row.systemPrompt,
    philosophy: row.philosophy,
    voiceTone: row.voiceTone,
    structureHints: row.structureHints,
    formats: row.formats,
    intensityRules: row.intensityRules,
    vocabulary: row.vocabulary,
    dos: row.dos,
    donts: row.donts,
    goodExamples: row.goodExamples,
    badExamples: row.badExamples,
  };
}

export async function getAiTrainingBrief(kind: BriefKind): Promise<AiTrainingBriefData> {
  const row = await prisma.aiTrainingBrief.findUnique({ where: { id: kind } });
  if (!row) return EMPTY;
  return toData(row);
}

export async function updateAiTrainingBrief(
  kind: BriefKind,
  patch: Partial<AiTrainingBriefData>,
  updatedById?: string | null,
): Promise<AiTrainingBriefData> {
  const row = await prisma.aiTrainingBrief.upsert({
    where: { id: kind },
    update: { ...patch, updatedById: updatedById ?? undefined },
    create: { id: kind, ...patch, updatedById: updatedById ?? undefined },
  });
  return toData(row);
}

/**
 * Rellena el brief con la seed destilada (si algún campo está vacío).
 * Idempotente: no pisa lo que ya escribió el usuario. Si no hay seed para
 * ese kind (p. ej. "entrenamiento" aún no destilado) devuelve sin hacer nada.
 */
export async function seedAiTrainingBriefIfEmpty(
  kind: BriefKind,
  updatedById?: string | null,
): Promise<{ createdOrUpdated: boolean; filledFields: string[]; noSeed?: boolean }> {
  const seed = TRAINING_BRIEF_SEED_BY_KIND[kind];
  if (!seed) return { createdOrUpdated: false, filledFields: [], noSeed: true };
  const current = await getAiTrainingBrief(kind);
  const patch: Partial<AiTrainingBriefData> = {};
  const filled: string[] = [];
  for (const key of Object.keys(seed) as (keyof AiTrainingBriefData)[]) {
    if (!current[key]?.trim() && seed[key]?.trim()) {
      patch[key] = seed[key];
      filled.push(key);
    }
  }
  if (filled.length === 0) return { createdOrUpdated: false, filledFields: [] };
  await updateAiTrainingBrief(kind, patch, updatedById);
  return { createdOrUpdated: true, filledFields: filled };
}
