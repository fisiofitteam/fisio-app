/**
 * POST /api/story-maker/generate
 *
 * Body: { prompt: string, count?: number }
 * Devuelve: { ok, slides: Slide[] }
 *
 * Claude Opus 4.7 diseña Y escribe cada slide completo (posiciones,
 * tipografías, tamaños, colores, contenido). Sin concepto de plantilla —
 * el JSON de cada slide es directamente ingerible por el frontend.
 *
 * Solo CEO/setter.
 */
import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { generateStoryContent } from "@/lib/story-maker/ai";

export const runtime = "nodejs";
export const maxDuration = 90;

function extractCountFromPrompt(prompt: string, fallback = 3): number {
  const m = prompt.match(/(\d{1,2})\s*(stories|historias|slides|piezas)/i);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!isFinite(n) || n < 1) return fallback;
  return Math.min(10, n);
}

export async function POST(req: Request) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "setter") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const rawCount = Number(body?.count);
  const count = isFinite(rawCount) && rawCount > 0
    ? Math.min(10, Math.max(1, Math.floor(rawCount)))
    : extractCountFromPrompt(prompt);

  if (prompt.length < 5) {
    return NextResponse.json({ error: "Prompt demasiado corto (mín 5 caracteres)" }, { status: 400 });
  }

  try {
    const slides = await generateStoryContent({ prompt, count });
    return NextResponse.json({ ok: true, slides });
  } catch (e: any) {
    console.error("[story-maker/generate] Error:", e);
    return NextResponse.json({ error: e?.message ?? "Error generando" }, { status: 500 });
  }
}
