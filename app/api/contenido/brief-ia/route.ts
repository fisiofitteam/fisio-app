/**
 * GET / PATCH /api/contenido/brief-ia
 *
 * Lectura y edición del singleton AiContentBrief. Solo CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { getAiBrief, updateAiBrief } from "@/lib/ai-brief";

const ALLOWED_FIELDS = [
  "brand",
  "voiceTone",
  "dos",
  "donts",
  "structureHints",
  "goodExamples",
  "badExamples",
] as const;

export async function GET() {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const brief = await getAiBrief();
  return NextResponse.json(brief);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, string> = {};
  for (const k of ALLOWED_FIELDS) {
    if (typeof body?.[k] === "string") patch[k] = body[k];
  }
  const updated = await updateAiBrief(patch, user.id);
  return NextResponse.json(updated);
}
