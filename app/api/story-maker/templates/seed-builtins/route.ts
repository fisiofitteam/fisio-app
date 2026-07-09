/**
 * POST /api/story-maker/templates/seed-builtins
 *
 * Crea en BD las 4 plantillas base (Portada, Cita, Lista, Pregunta) para
 * que aparezcan en el listado normal y se puedan editar/borrar. Si ya
 * existe una plantilla con el mismo nombre, la omite (evita duplicados
 * cuando el CEO pulsa "cargar ejemplos" dos veces).
 *
 * Solo CEO/setter.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { BUILTIN_TEMPLATES } from "@/lib/story-maker/templates";

export const runtime = "nodejs";

export async function POST() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "ceo" && user.role !== "setter") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.contentStoryTemplate.findMany({
    select: { name: true },
  });
  const existingNames = new Set(existing.map((r) => r.name.toLowerCase()));

  const created: string[] = [];
  for (const tpl of BUILTIN_TEMPLATES) {
    if (existingNames.has(tpl.name.toLowerCase())) continue;
    await prisma.contentStoryTemplate.create({
      data: {
        name: tpl.name,
        description: tpl.description || null,
        jsonSlides: JSON.stringify({ slides: tpl.slides, aiSlots: tpl.aiSlots ?? [] }),
        createdById: user.id,
      },
    });
    created.push(tpl.name);
  }

  return NextResponse.json({ ok: true, created });
}
