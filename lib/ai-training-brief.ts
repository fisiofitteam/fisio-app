// Lectura/escritura del singleton AiTrainingBrief.
// Rige el estilo con el que la IA genera sesiones de ADVANCE.

import { prisma } from "@/lib/prisma";
import { TRAINING_BRIEF_SEED } from "@/lib/ai-training-brief-seed";

export const AI_TRAINING_BRIEF_ID = "singleton";

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

export async function getAiTrainingBrief(): Promise<AiTrainingBriefData> {
  const row = await prisma.aiTrainingBrief.findUnique({ where: { id: AI_TRAINING_BRIEF_ID } });
  if (!row) return EMPTY;
  return toData(row);
}

export async function updateAiTrainingBrief(
  patch: Partial<AiTrainingBriefData>,
  updatedById?: string | null,
): Promise<AiTrainingBriefData> {
  const row = await prisma.aiTrainingBrief.upsert({
    where: { id: AI_TRAINING_BRIEF_ID },
    update: { ...patch, updatedById: updatedById ?? undefined },
    create: { id: AI_TRAINING_BRIEF_ID, ...patch, updatedById: updatedById ?? undefined },
  });
  return toData(row);
}

/**
 * Rellena el brief con la seed destilada del histórico (si algún campo está
 * vacío). Idempotente: no pisa lo que ya escribió el usuario.
 */
export async function seedAiTrainingBriefIfEmpty(updatedById?: string | null): Promise<{
  createdOrUpdated: boolean;
  filledFields: string[];
}> {
  const current = await getAiTrainingBrief();
  const patch: Partial<AiTrainingBriefData> = {};
  const filled: string[] = [];
  for (const key of Object.keys(TRAINING_BRIEF_SEED) as (keyof AiTrainingBriefData)[]) {
    if (!current[key]?.trim()) {
      patch[key] = TRAINING_BRIEF_SEED[key];
      filled.push(key);
    }
  }
  if (filled.length === 0) return { createdOrUpdated: false, filledFields: [] };
  await updateAiTrainingBrief(patch, updatedById);
  return { createdOrUpdated: true, filledFields: filled };
}
