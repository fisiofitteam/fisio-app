/**
 * GET / PATCH /api/ai/training-brief
 *
 * Lectura y edición del singleton AiTrainingBrief. Solo CEO y head_success —
 * los mismos roles que ya acceden a /fisio/advance.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import {
  getAiTrainingBrief,
  updateAiTrainingBrief,
  seedAiTrainingBriefIfEmpty,
} from "@/lib/ai-training-brief";

const ALLOWED_FIELDS = [
  "systemPrompt",
  "philosophy",
  "voiceTone",
  "structureHints",
  "formats",
  "intensityRules",
  "vocabulary",
  "dos",
  "donts",
  "goodExamples",
  "badExamples",
] as const;

function canEdit(role: string): boolean {
  return role === "ceo" || role === "head_success";
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const brief = await getAiTrainingBrief();
  return NextResponse.json(brief);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));

  // Modo especial: rellenar campos vacíos con la seed destilada del histórico.
  if (body?.action === "seed-empty-fields") {
    const result = await seedAiTrainingBriefIfEmpty(user.id);
    const brief = await getAiTrainingBrief();
    return NextResponse.json({ ...brief, _seedResult: result });
  }

  const patch: Record<string, string> = {};
  for (const k of ALLOWED_FIELDS) {
    if (typeof body?.[k] === "string") patch[k] = body[k];
  }
  const updated = await updateAiTrainingBrief(patch, user.id);
  return NextResponse.json(updated);
}
