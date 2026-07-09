/**
 * /api/story-maker/templates
 *
 * GET     → lista plantillas guardadas (no incluye builtins).
 * POST    → { name, description, slides, aiSlots } crea plantilla nueva.
 * PATCH   → { id, name?, description?, slides?, aiSlots? } actualiza.
 * DELETE  → ?id=X borra por id.
 *
 * Solo CEO/setter.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const runtime = "nodejs";

function ok(role: string): boolean {
  return role === "ceo" || role === "setter";
}

export async function GET() {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ok(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.contentStoryTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, description: true, jsonSlides: true, updatedAt: true },
  });
  return NextResponse.json({
    ok: true,
    templates: rows.map((r) => {
      let parsed: any = {};
      try { parsed = JSON.parse(r.jsonSlides); } catch {}
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        slides: parsed.slides ?? [],
        aiSlots: parsed.aiSlots ?? [],
        updatedAt: r.updatedAt.toISOString(),
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ok(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = (body?.name ?? "").toString().trim();
  const description = (body?.description ?? "").toString().trim();
  const slides = Array.isArray(body?.slides) ? body.slides : null;
  const aiSlots = Array.isArray(body?.aiSlots) ? body.aiSlots : [];
  if (!name) return NextResponse.json({ error: "Nombre obligatorio" }, { status: 400 });
  if (!slides || slides.length === 0) return NextResponse.json({ error: "Sin slides" }, { status: 400 });

  const created = await prisma.contentStoryTemplate.create({
    data: {
      name,
      description: description || null,
      jsonSlides: JSON.stringify({ slides, aiSlots }),
      createdById: user.id,
    },
  });
  return NextResponse.json({ ok: true, id: created.id, name: created.name });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ok(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = (body?.id ?? "").toString();
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const current = await prisma.contentStoryTemplate.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "No existe" }, { status: 404 });
  let parsed: any = {};
  try { parsed = JSON.parse(current.jsonSlides); } catch {}

  const patch: any = {};
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.description !== undefined) patch.description = String(body.description).trim() || null;
  if (body.slides || body.aiSlots) {
    patch.jsonSlides = JSON.stringify({
      slides: body.slides ?? parsed.slides ?? [],
      aiSlots: body.aiSlots ?? parsed.aiSlots ?? [],
    });
  }

  const updated = await prisma.contentStoryTemplate.update({ where: { id }, data: patch });
  return NextResponse.json({ ok: true, id: updated.id });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ok(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
  await prisma.contentStoryTemplate.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
