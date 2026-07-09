/**
 * /api/story-maker/templates
 *
 * GET    → lista de plantillas guardadas (todas, orderBy updatedAt desc).
 * POST   → crea plantilla { name, description?, slides }.
 * DELETE → borra por id (?id=).
 *
 * Solo staff con acceso a Contenido.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

function checkRole(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const templates = await prisma.contentStoryTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      jsonSlides: true,
      updatedAt: true,
    },
  });
  return NextResponse.json({
    ok: true,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      slides: JSON.parse(t.jsonSlides),
      updatedAt: t.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const slides = Array.isArray(body?.slides) ? body.slides : null;
  if (!name) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }
  if (!slides || slides.length === 0) {
    return NextResponse.json({ error: "La plantilla no tiene slides" }, { status: 400 });
  }

  const created = await prisma.contentStoryTemplate.create({
    data: {
      name,
      description: description || null,
      jsonSlides: JSON.stringify(slides),
      createdById: user.id,
    },
  });
  return NextResponse.json({
    ok: true,
    template: { id: created.id, name: created.name },
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!checkRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.contentStoryTemplate.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
