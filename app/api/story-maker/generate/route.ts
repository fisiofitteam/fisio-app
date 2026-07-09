/**
 * POST /api/story-maker/generate
 *
 * Body: { prompt: string, templateKey?: string, count?: number }
 * Devuelve: { ok, slides: [{fills}], templateKey, template }
 *
 * templateKey es opcional. El backend siempre garantiza aiSlots
 * hardcoded para la generación (usando una builtin como fuente
 * semántica). Después el CEO aplica el estilo visual que quiera
 * desde el dropdown con "mantener textos".
 *
 * Solo CEO/setter.
 */
import { NextResponse } from "next/server";
import { getActiveProfessional } from "@/lib/session";
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from "@/lib/story-maker/templates";
import { generateStoryContent } from "@/lib/story-maker/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const templateKeyRaw = typeof body?.templateKey === "string" ? body.templateKey : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const rawCount = Number(body?.count);
  const count = isFinite(rawCount) && rawCount > 0
    ? Math.min(10, Math.max(1, Math.floor(rawCount)))
    : extractCountFromPrompt(prompt);

  if (prompt.length < 5) {
    return NextResponse.json({ error: "Prompt demasiado corto (mín 5 caracteres)" }, { status: 400 });
  }

  // La plantilla que usamos para GENERAR TEXTO siempre es una builtin con
  // aiSlots configurados. Preferimos "Portada" por su formato genérico
  // (título + subtítulo). El CEO aplica el estilo visual después desde el
  // dropdown con "mantener textos".
  let template = getBuiltinTemplate(templateKeyRaw);
  if (!template || !template.aiSlots?.length) {
    template = BUILTIN_TEMPLATES.find((t) => t.aiSlots?.length) ?? BUILTIN_TEMPLATES[0];
  }
  if (!template) {
    return NextResponse.json({ error: "No hay plantillas base disponibles" }, { status: 500 });
  }

  try {
    const slides = await generateStoryContent({ template, prompt, count });

    // Devolvemos también los slides completos de la plantilla para que el
    // frontend pueda materializarlos aunque no tenga esa plantilla en su
    // lista local (las builtin ya no viven en el frontend).
    return NextResponse.json({
      ok: true,
      slides,
      templateKey: template.key,
      template: {
        id: template.id,
        key: template.key,
        name: template.name,
        description: template.description,
        slides: template.slides,
        aiSlots: template.aiSlots,
      },
    });
  } catch (e: any) {
    console.error("[story-maker/generate] Error:", e);
    return NextResponse.json({ error: e?.message ?? "Error generando" }, { status: 500 });
  }
}
