/**
 * POST /api/story-maker/generate
 *
 * Body: { prompt: string, templateKey?: string, count?: number }
 * Devuelve: { ok, slides: [{fills}], templateKey }
 *
 * templateKey es opcional. Si no viene, usamos la primera plantilla
 * guardada, o la primera builtin como fallback. Después el CEO puede
 * aplicar otra plantilla desde el sidebar preservando textos.
 *
 * Solo CEO/setter.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from "@/lib/story-maker/templates";
import { generateStoryContent } from "@/lib/story-maker/ai";
import type { StoryTemplate } from "@/lib/story-maker/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function extractCountFromPrompt(prompt: string, fallback = 3): number {
  // Heurística barata: busca "N stories/historias/slides" al principio del prompt.
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

  // Resolver plantilla base: primero por templateKey, después primera guardada, después builtin
  let template: StoryTemplate | null = null;
  let usedKey = templateKeyRaw;

  if (templateKeyRaw) {
    template = getBuiltinTemplate(templateKeyRaw);
    if (!template) {
      const row = await prisma.contentStoryTemplate.findUnique({
        where: { id: templateKeyRaw },
        select: { id: true, name: true, description: true, jsonSlides: true },
      }).catch(() => null);
      if (row) {
        try {
          const parsed = JSON.parse(row.jsonSlides);
          template = {
            id: row.id,
            key: row.id,
            name: row.name,
            description: row.description ?? "",
            slides: parsed.slides ?? [],
            aiSlots: parsed.aiSlots ?? [],
          };
        } catch { /* ignore */ }
      }
    }
  }

  if (!template) {
    // Primera guardada como base por defecto
    const row = await prisma.contentStoryTemplate.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, description: true, jsonSlides: true },
    }).catch(() => null);
    if (row) {
      try {
        const parsed = JSON.parse(row.jsonSlides);
        template = {
          id: row.id,
          key: row.id,
          name: row.name,
          description: row.description ?? "",
          slides: parsed.slides ?? [],
          aiSlots: parsed.aiSlots ?? [],
        };
        usedKey = row.id;
      } catch { /* ignore */ }
    }
  }

  if (!template) {
    // Fallback definitivo: primera builtin
    template = BUILTIN_TEMPLATES[0];
    usedKey = template.key;
  }

  if (!template.aiSlots?.length) {
    return NextResponse.json({
      error: "La plantilla base no tiene aiSlots configurados. Aplica primero una plantilla con huecos IA.",
    }, { status: 400 });
  }

  try {
    const slides = await generateStoryContent({ template, prompt, count });
    return NextResponse.json({ ok: true, slides, templateKey: usedKey });
  } catch (e: any) {
    console.error("[story-maker/generate] Error:", e);
    return NextResponse.json({ error: e?.message ?? "Error generando" }, { status: 500 });
  }
}
