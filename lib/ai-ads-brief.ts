// Lectura/escritura del singleton AiAdsBrief. Espejo de lib/ai-brief.ts pero
// para Anuncios (con un campo extra `systemPrompt` opcional).

import { prisma } from "@/lib/prisma";

export const AI_ADS_BRIEF_ID = "singleton";

export type AiAdsBriefData = {
  systemPrompt: string;
  brand: string;
  voiceTone: string;
  dos: string;
  donts: string;
  structureHints: string;
  goodExamples: string;
  badExamples: string;
};

export async function getAiAdsBrief(): Promise<AiAdsBriefData> {
  const row = await prisma.aiAdsBrief.findUnique({ where: { id: AI_ADS_BRIEF_ID } });
  if (!row) {
    return {
      systemPrompt: "",
      brand: "",
      voiceTone: "",
      dos: "",
      donts: "",
      structureHints: "",
      goodExamples: "",
      badExamples: "",
    };
  }
  return {
    systemPrompt: row.systemPrompt,
    brand: row.brand,
    voiceTone: row.voiceTone,
    dos: row.dos,
    donts: row.donts,
    structureHints: row.structureHints,
    goodExamples: row.goodExamples,
    badExamples: row.badExamples,
  };
}

export async function updateAiAdsBrief(
  patch: Partial<AiAdsBriefData>,
  updatedById?: string | null,
): Promise<AiAdsBriefData> {
  const row = await prisma.aiAdsBrief.upsert({
    where: { id: AI_ADS_BRIEF_ID },
    update: { ...patch, updatedById: updatedById ?? undefined },
    create: { id: AI_ADS_BRIEF_ID, ...patch, updatedById: updatedById ?? undefined },
  });
  return {
    systemPrompt: row.systemPrompt,
    brand: row.brand,
    voiceTone: row.voiceTone,
    dos: row.dos,
    donts: row.donts,
    structureHints: row.structureHints,
    goodExamples: row.goodExamples,
    badExamples: row.badExamples,
  };
}

/**
 * Construye el system prompt definitivo para Claude.
 * Si el usuario ha pegado un systemPrompt entero (Skill de Claude), se usa
 * tal cual. Si no, se ensambla con los campos estructurados.
 */
export function buildAdsSystemPrompt(brief: AiAdsBriefData): string {
  if (brief.systemPrompt.trim()) {
    return brief.systemPrompt.trim();
  }
  return `Eres un copy de respuesta directa especializado en anuncios para servicios de salud y deporte. Trabajas con FisioFit Team, un servicio de fisioterapia online para deportistas (sobre todo CrossFit). El equipo está liderado por Ales Faus.

VOZ DE MARCA:
${brief.brand || "(sin definir)"}

TONO:
${brief.voiceTone || "(sin definir)"}

QUÉ HACER:
${brief.dos || "(sin definir)"}

QUÉ NO HACER:
${brief.donts || "(sin definir)"}

ESTRUCTURA RECOMENDADA:
${brief.structureHints || "(sin definir)"}

EJEMPLOS BUENOS:
${brief.goodExamples || "(sin definir)"}

EJEMPLOS MALOS:
${brief.badExamples || "(sin definir)"}`;
}
