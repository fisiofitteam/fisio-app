/**
 * GET / PATCH /api/ads/brief
 *
 * Lectura y edición del singleton AiAdsBrief. Solo CEO.
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { getAiAdsBrief, updateAiAdsBrief } from "@/lib/ai-ads-brief";
import { canManageAds } from "@/lib/ads";

const ALLOWED_FIELDS = [
  "systemPrompt",
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
  if (!user || !canManageAds(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const brief = await getAiAdsBrief();
  return NextResponse.json(brief);
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, string> = {};
  for (const k of ALLOWED_FIELDS) {
    if (typeof body?.[k] === "string") patch[k] = body[k];
  }
  const updated = await updateAiAdsBrief(patch, user.id);
  return NextResponse.json(updated);
}
