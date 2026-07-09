/**
 * POST /api/story-maker/generate
 *
 * Recibe un guion + parámetros y devuelve una serie de slides ya maquetados
 * por Claude. Solo staff (CEO / setter — ambos usan Contenido).
 */
import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { generateStorySlides, type StoryMakerInput } from "@/lib/ai-story-maker";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULTS: Omit<StoryMakerInput, "script" | "count"> = {
  brand: "FisioFit Team",
  niche: "atletas de CrossFit y Hyrox con dolor que quieren volver a entrenar sin miedo",
  tone: "directo, sin humo, empático. Habla de tú. Sin promesas mágicas.",
  terminologyRule: "nunca uses 'cliente' o 'paciente' — siempre 'atleta'.",
};

export async function POST(req: Request) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "setter") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const script = typeof body?.script === "string" ? body.script.trim() : "";
  const count = Math.max(1, Math.min(10, Number(body?.count) || 5));
  if (!script || script.length < 20) {
    return NextResponse.json(
      { error: "Necesito al menos 20 caracteres de guion para generar." },
      { status: 400 },
    );
  }

  try {
    const result = await generateStorySlides({
      script,
      count,
      brand: body?.brand?.trim() || DEFAULTS.brand,
      niche: body?.niche?.trim() || DEFAULTS.niche,
      tone: body?.tone?.trim() || DEFAULTS.tone,
      terminologyRule: body?.terminologyRule?.trim() || DEFAULTS.terminologyRule,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[story-maker/generate] Error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Error al generar" },
      { status: 500 },
    );
  }
}
