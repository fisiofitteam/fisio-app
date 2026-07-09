/**
 * POST /api/story-maker/generate
 *
 * Body: { prompt: string, count?: number }
 * Devuelve: { ok, slides: [{templateKey, fills}], templatesByKey }
 *
 * La IA recibe TODAS las plantillas disponibles (builtins hardcoded +
 * las guardadas en BD del CEO) y para cada slide elige QUÉ PLANTILLA
 * USAR + rellena sus huecos. El frontend materializa cada slide con la
 * plantilla que la IA eligió.
 *
 * Solo CEO/setter.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { BUILTIN_TEMPLATES } from "@/lib/story-maker/templates";
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

function deriveAiSlots(template: StoryTemplate): AiSlot[] {
  const base = template.slides[0];
  if (!base) return [];
  return base.elements
    .filter((el): el is TextElement => el.type === "text")
    .map((el) => {
      const content = el.content?.trim() || "texto";
      const sample = content.length > 60 ? content.slice(0, 60) + "…" : content;
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

async function loadAllTemplates(): Promise<StoryTemplate[]> {
  const rows = await prisma.contentStoryTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, description: true, jsonSlides: true },
  }).catch(() => []);

  const saved: StoryTemplate[] = rows.flatMap((r) => {
    try {
      const parsed = JSON.parse(r.jsonSlides);
      const t: StoryTemplate = {
        id: r.id,
        key: r.id,
        name: r.name,
        description: r.description ?? "",
        slides: parsed.slides ?? [],
        aiSlots: parsed.aiSlots ?? [],
      };
      if (!t.slides?.[0]) return [];
      if (!t.aiSlots.length) t.aiSlots = deriveAiSlots(t);
      return [t];
    } catch {
      return [];
    }
  });

  // Combinamos builtins + guardadas. Deduplicamos por nombre (si el CEO
  // hizo seed, las builtin ya están en BD — nos quedamos con las de BD
  // porque son las editables).
  const savedNames = new Set(saved.map((t) => t.name.toLowerCase()));
  const builtins = BUILTIN_TEMPLATES.filter((t) => !savedNames.has(t.name.toLowerCase()));
  return [...saved, ...builtins].filter((t) => t.aiSlots?.length && t.slides?.[0]);
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

  const templates = await loadAllTemplates();
  if (!templates.length) {
    return NextResponse.json({
      error: "No hay plantillas con huecos IA disponibles",
    }, { status: 500 });
  }

  try {
    const slides = await generateStoryContent({ templates, prompt, count });

    // Devolvemos también las plantillas por key para que el frontend
    // pueda materializar sin conocer las builtin hardcoded.
    const templatesByKey: Record<string, StoryTemplate> = {};
    for (const t of templates) {
      templatesByKey[t.key] = {
        id: t.id,
        key: t.key,
        name: t.name,
        description: t.description,
        slides: t.slides,
        aiSlots: t.aiSlots,
      };
    }

    return NextResponse.json({ ok: true, slides, templatesByKey });
  } catch (e: any) {
    console.error("[story-maker/generate] Error:", e);
    return NextResponse.json({ error: e?.message ?? "Error generando" }, { status: 500 });
  }
}
