/**
 * Lectura / escritura del singleton AiContentBrief.
 * Solo servidor.
 */
import { prisma } from "@/lib/prisma";
import type { AiBrief } from "@/lib/ai-content";

export const AI_BRIEF_ID = "singleton";

export async function getAiBrief(): Promise<AiBrief> {
  const row = await prisma.aiContentBrief.findUnique({ where: { id: AI_BRIEF_ID } });
  if (!row) {
    return {
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
    brand: row.brand,
    voiceTone: row.voiceTone,
    dos: row.dos,
    donts: row.donts,
    structureHints: row.structureHints,
    goodExamples: row.goodExamples,
    badExamples: row.badExamples,
  };
}

export async function updateAiBrief(
  patch: Partial<AiBrief>,
  updatedById?: string | null
): Promise<AiBrief> {
  const row = await prisma.aiContentBrief.upsert({
    where: { id: AI_BRIEF_ID },
    update: { ...patch, updatedById: updatedById ?? undefined },
    create: {
      id: AI_BRIEF_ID,
      brand: patch.brand ?? "",
      voiceTone: patch.voiceTone ?? "",
      dos: patch.dos ?? "",
      donts: patch.donts ?? "",
      structureHints: patch.structureHints ?? "",
      goodExamples: patch.goodExamples ?? "",
      badExamples: patch.badExamples ?? "",
      updatedById: updatedById ?? undefined,
    },
  });
  return {
    brand: row.brand,
    voiceTone: row.voiceTone,
    dos: row.dos,
    donts: row.donts,
    structureHints: row.structureHints,
    goodExamples: row.goodExamples,
    badExamples: row.badExamples,
  };
}
