/**
 * POST /api/story-maker/generate
 *
 * Body: { prompt: string, templateKey?: string, count?: number }
 * Devuelve: { ok, slides: [{fills}], templateKey, template }
 *
 * Resolución de la plantilla base:
 *   1. Si templateKey resuelve a una builtin de código → usarla (aiSlots
 *      curados).
 *   2. Si resuelve a una plantilla guardada en BD (por id) → usarla.
 *      Si esa plantilla no tiene aiSlots → los AUTO-GENERAMOS a partir
 *      de sus text elements (cada text = un slot con hint basado en su
 *      contenido actual).
 *   3. Fallback: primera builtin con aiSlots.
 *
 * Con esto la IA respeta la plantilla que el CEO tiene seleccionada en
 * el dropdown, incluso si es una custom sin aiSlots definidos.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from "@/lib/story-maker/templates";
import { generateStoryContent } from "@/lib/story-maker/ai";
import type { AiSlot, StoryTemplate, TextElement } from "@/lib/story-maker/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function extractCountFromPrompt(prompt: string, fallback = 3): number {
  const m = prompt.match(/(\d{1,2})\s*(stories|historias|slides|piezas)/i);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!isFinite(n) || n < 1) return fallback;
  return Math.min(10, n);
}

/**
 * Deriva aiSlots automáticos desde los text elements del primer slide.
 * Se usa cuando la plantilla que el CEO tiene seleccionada es custom
 * y no trae aiSlots definidos. Cada text element se convierte en un
 * slot con un hint basado en su contenido de plantilla.
 */
function deriveAiSlots(template: StoryTemplate): AiSlot[] {
  const base = template.slides[0];
  if (!base) return [];
  return base.elements
    .filter((el): el is TextElement => el.type === "text")
    .map((el) => {
      const content = el.content?.trim() || "texto";
      // Cortamos a algo razonable para el hint
      const sample = content.length > 80 ? content.slice(0, 80) + "…" : content;
      const words = content.split(/\s+/).filter(Boolean).length;
      const maxWords = Math.max(4, Math.min(30, Math.round(words * 1.4) || 15));
      return {
        slideIdx: 0,
        elementId: el.id,
        hint: `Texto similar en propósito a: "${sample}"`,
        maxWords,
      } satisfies AiSlot;
    });
}

async function resolveTemplate(templateKeyRaw: string): Promise<StoryTemplate | null> {
  if (templateKeyRaw) {
    // 1) Builtin exacta
    const builtin = getBuiltinTemplate(templateKeyRaw);
    if (builtin?.aiSlots?.length) return builtin;

    // 2) BD por id (las guardadas usan id como key)
    const row = await prisma.contentStoryTemplate.findUnique({
      where: { id: templateKeyRaw },
      select: { id: true, name: true, description: true, jsonSlides: true },
    }).catch(() => null);
    if (row) {
      try {
        const parsed = JSON.parse(row.jsonSlides);
        const t: StoryTemplate = {
          id: row.id,
          key: row.id,
          name: row.name,
          description: row.description ?? "",
          slides: parsed.slides ?? [],
          aiSlots: parsed.aiSlots ?? [],
        };
        // Si la BD guardada no trae aiSlots, los inferimos
        if (!t.aiSlots?.length) t.aiSlots = deriveAiSlots(t);
        if (t.aiSlots.length && t.slides[0]) return t;
      } catch { /* ignore */ }
    }
  }

  // 3) Fallback: primera builtin con aiSlots
  return BUILTIN_TEMPLATES.find((t) => t.aiSlots?.length) ?? BUILTIN_TEMPLATES[0] ?? null;
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

  const template = await resolveTemplate(templateKeyRaw);
  if (!template) {
    return NextResponse.json({ error: "No hay plantillas base disponibles" }, { status: 500 });
  }

  try {
    const slides = await generateStoryContent({ template, prompt, count });
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
