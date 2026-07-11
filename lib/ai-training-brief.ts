// Lectura/escritura del brief de estilo de sesiones ADVANCE. Hay uno por
// kind: "accesorios" (sesiones cortas de movilidad/técnica/activación) y
// "entrenamiento" (sesión principal de fuerza/metcon).

import { prisma } from "@/lib/prisma";
import { TRAINING_BRIEF_SEED_BY_KIND } from "@/lib/ai-training-brief-seed";

// Los kinds "builtin" son los originales que vienen destilados desde el HTML
// histórico del CEO. A partir de aquí, cada RollingProgram creado desde
// /fisio/advance/rolling tambien crea implícitamente un kind con id = programId
// (el brief-ia lo lista como pestaña más).
export type BriefKind = string;
export const BUILTIN_BRIEF_KINDS: string[] = ["accesorios", "entrenamiento"];
export const BRIEF_KINDS: string[] = BUILTIN_BRIEF_KINDS;

export function isBuiltinBriefKind(x: unknown): x is "accesorios" | "entrenamiento" {
  return x === "accesorios" || x === "entrenamiento";
}

// Acepta cualquier string no vacío. La validación real (existe el programa
// rolling correspondiente) se hace en las páginas / API cuando aplica.
export function isBriefKind(x: unknown): x is BriefKind {
  return typeof x === "string" && x.trim().length > 0;
}

export const BRIEF_KIND_LABEL: Record<string, string> = {
  accesorios: "Accesorios (movilidad · técnica · activación)",
  entrenamiento: "Entrenamiento (fuerza · metcon)",
};

/**
 * Dado el `role` y el `id` de un RollingProgram devuelve qué `kind` (id del
 * AiTrainingBrief) usar al generar sesiones con IA.
 *   - "advance-accesorios" | "prevention" → "accesorios" (comparten).
 *   - "advance-entrenamiento" → "entrenamiento".
 *   - "" (o cualquier otro) → el propio programId (brief propio del programa).
 */
export function resolveBriefKindForProgram(program: { id: string; role: string | null | undefined }): string {
  const r = program.role || "";
  if (r === "advance-accesorios" || r === "prevention") return "accesorios";
  if (r === "advance-entrenamiento") return "entrenamiento";
  return program.id;
}

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
