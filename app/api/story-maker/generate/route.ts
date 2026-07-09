/**
 * POST /api/story-maker/generate
 *
 * Body: { templateKey: string, prompt: string, count: number }
 * Devuelve: { ok, slides: [{fills}] }
 *
 * templateKey resuelve a una BUILTIN_TEMPLATES o una plantilla guardada
 * en BD por su clave slug. Solo CEO/setter.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { getBuiltinTemplate } from "@/lib/story-maker/templates";
import { generateStoryContent } from "@/lib/story-maker/ai";
import type { StoryTemplate } from "@/lib/story-maker/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "setter") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const templateKey = typeof body?.templateKey === "string" ? body.templateKey : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const count = Math.max(1, Math.min(10, Number(body?.count) || 3));

  if (!templateKey) {
    return NextResponse.json({ error: "Falta templateKey" }, { status: 400 });
  }
  if (prompt.length < 5) {
    return NextResponse.json({ error: "Prompt demasiado corto (mín 5 caracteres)" }, { status: 400 });
  }

  // Resolver plantilla: primero builtins, después BD
  let template: StoryTemplate | null = getBuiltinTemplate(templateKey);
  if (!template) {
    const row = await prisma.contentStoryTemplate.findFirst({
      where: { name: templateKey },
      select: { id: true, name: true, description: true, jsonSlides: true },
    });
    if (row) {
      try {
        const parsed = JSON.parse(row.jsonSlides);
        template = {
          id: row.id,
          key: templateKey,
          name: row.name,
          description: row.description ?? "",
          slides: parsed.slides ?? [],
          aiSlots: parsed.aiSlots ?? [],
        };
      } catch (e) {
        return NextResponse.json({ error: "Plantilla guardada corrupta" }, { status: 500 });
      }
    }
  }
  if (!template) {
    return NextResponse.json({ error: `Plantilla no encontrada: ${templateKey}` }, { status: 404 });
  }

  try {
    const slides = await generateStoryContent({ template, prompt, count });
    return NextResponse.json({ ok: true, slides });
  } catch (e: any) {
    console.error("[story-maker/generate] Error:", e);
    return NextResponse.json({ error: e?.message ?? "Error generando" }, { status: 500 });
  }
}
