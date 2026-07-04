/**
 * GET / PATCH /api/ai/training-brief?kind=accesorios|entrenamiento
 *
 * Lectura y edición del brief de sesiones ADVANCE, por kind. Solo CEO y
 * head_success — los mismos roles que acceden a /fisio/advance.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import {
  getAiTrainingBrief,
  updateAiTrainingBrief,
  seedAiTrainingBriefIfEmpty,
  isBriefKind,
  type BriefKind,
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

function readKind(req: NextRequest): BriefKind | null {
  const k = req.nextUrl.searchParams.get("kind");
  return isBriefKind(k) ? k : null;
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const kind = readKind(req);
  if (!kind) return NextResponse.json({ error: "kind requerido (accesorios | entrenamiento)" }, { status: 400 });
  const brief = await getAiTrainingBrief(kind);
  return NextResponse.json(brief);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const kind = readKind(req);
  if (!kind) return NextResponse.json({ error: "kind requerido (accesorios | entrenamiento)" }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  if (body?.action === "seed-empty-fields") {
    const result = await seedAiTrainingBriefIfEmpty(kind, user.id);
    const brief = await getAiTrainingBrief(kind);
    return NextResponse.json({ ...brief, _seedResult: result });
  }

  // Reset: pone todos los campos a "" (para que "🌱 Sembrar" pueda volver a
  // rellenarlos limpio). No borra la fila — solo la vacía.
  if (body?.action === "clear-all-fields") {
    const empty: Record<string, string> = {};
    for (const k of ALLOWED_FIELDS) empty[k] = "";
    const updated = await updateAiTrainingBrief(kind, empty, user.id);
    return NextResponse.json({ ...updated, _cleared: true });
  }

  const patch: Record<string, string> = {};
  for (const k of ALLOWED_FIELDS) {
    if (typeof body?.[k] === "string") patch[k] = body[k];
  }
  const updated = await updateAiTrainingBrief(kind, patch, user.id);
  return NextResponse.json(updated);
}
