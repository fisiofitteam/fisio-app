/**
 * GET    /api/script-templates              → lista todas las plantillas (filtrable por ?format=reel)
 * POST   /api/script-templates              → crea una nueva
 * PATCH  /api/script-templates              → actualiza una existente (id en body)
 * DELETE /api/script-templates?id=xxx       → borra
 *
 * Acceso: solo CEO crea/edita/borra. Setter y CEO pueden leer.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export const dynamic = "force-dynamic";

function canRead(role: string) {
  return role === "ceo" || role === "setter";
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canRead(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format = req.nextUrl.searchParams.get("format");
  const templates = await prisma.scriptTemplate.findMany({
    where: format ? { format } : undefined,
    orderBy: [{ format: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      format: t.format,
      blocks: JSON.parse(t.blocks),
      description: t.description,
      updatedAt: t.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const data = await req.json();
  const name = String(data.name || "").trim();
  const format = String(data.format || "");
  if (!name) return NextResponse.json({ error: "name requerido" }, { status: 400 });
  if (!["reel", "carousel", "infographic", "image", "live"].includes(format)) {
    return NextResponse.json({ error: "format inválido" }, { status: 400 });
  }

  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const normalizedBlocks = blocks.map((b: any, idx: number) => ({
    id: String(b.id || `block_${Date.now()}_${idx}`),
    label: String(b.label || ""),
    order: typeof b.order === "number" ? b.order : idx,
  }));

  const tpl = await prisma.scriptTemplate.create({
    data: {
      name,
      format,
      blocks: JSON.stringify(normalizedBlocks),
      description: data.description ? String(data.description) : null,
      createdById: user.id,
    },
  });

  return NextResponse.json({
    template: {
      id: tpl.id,
      name: tpl.name,
      format: tpl.format,
      blocks: JSON.parse(tpl.blocks),
      description: tpl.description,
      updatedAt: tpl.updatedAt.toISOString(),
    },
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const data = await req.json();
  const id = String(data.id || "");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const update: any = {};
  if (data.name !== undefined) update.name = String(data.name).trim();
  if (data.format !== undefined) {
    if (!["reel", "carousel", "infographic", "image", "live"].includes(String(data.format))) {
      return NextResponse.json({ error: "format inválido" }, { status: 400 });
    }
    update.format = String(data.format);
  }
  if (data.description !== undefined) update.description = data.description ? String(data.description) : null;
  if (data.blocks !== undefined) {
    if (!Array.isArray(data.blocks)) {
      return NextResponse.json({ error: "blocks debe ser array" }, { status: 400 });
    }
    update.blocks = JSON.stringify(
      data.blocks.map((b: any, idx: number) => ({
        id: String(b.id || `block_${Date.now()}_${idx}`),
        label: String(b.label || ""),
        order: typeof b.order === "number" ? b.order : idx,
      }))
    );
  }

  const tpl = await prisma.scriptTemplate.update({ where: { id }, data: update });
  return NextResponse.json({
    template: {
      id: tpl.id,
      name: tpl.name,
      format: tpl.format,
      blocks: JSON.parse(tpl.blocks),
      description: tpl.description,
      updatedAt: tpl.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || user.role !== "ceo") {
    return NextResponse.json({ error: "Solo CEO" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await prisma.scriptTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
