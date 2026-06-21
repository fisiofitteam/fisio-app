/**
 * POST /api/ads/brief/append
 *
 * Añade contenido a una sección del AiAdsBrief manteniendo lo que ya hay.
 * Lo usa el modal de generación cuando el CEO da feedback ("súmalo a buenos
 * ejemplos", "súmalo a evitar", "convertir mi ajuste en regla").
 *
 * Body: { section: "goodExamples"|"badExamples"|"dos"|"donts", content: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { canManageAds } from "@/lib/ads";
import { getAiAdsBrief, updateAiAdsBrief } from "@/lib/ai-ads-brief";

const VALID_SECTIONS = ["goodExamples", "badExamples", "dos", "donts"] as const;
type Section = (typeof VALID_SECTIONS)[number];

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManageAds(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const section = body?.section as Section | undefined;
  const content = String(body?.content ?? "").trim();
  if (!section || !VALID_SECTIONS.includes(section)) {
    return NextResponse.json({ error: "section inválida" }, { status: 400 });
  }
  if (!content) return NextResponse.json({ error: "content vacío" }, { status: 400 });

  const brief = await getAiAdsBrief();
  const existing = brief[section]?.trim() ?? "";
  const next = existing ? `${existing}\n\n${content}` : content;

  const updated = await updateAiAdsBrief({ [section]: next } as any, user.id);
  return NextResponse.json({ ok: true, section, length: updated[section].length });
}
