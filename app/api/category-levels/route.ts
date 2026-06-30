/**
 * CRUD de niveles por categoría.
 *
 * Acceso: CEO + Head Success + Fisio. Los fisios también pueden editar los
 * niveles para que iteren sus propias plantillas de carga sin depender del
 * CEO. El catálogo base de movimientos sigue siendo solo de managers.
 *
 * GET /api/category-levels[?categoryId=…]
 *   → lista todos los niveles con sus reglas (o solo los de una categoría).
 *
 * POST { categoryId, name, description? }
 *   → crea nivel nuevo al final (order auto-incremental).
 *
 * PATCH { id, name?, description?, order? }
 * DELETE ?id=
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function forbidden() { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

// CEO, head_success y fisio pueden editar niveles de categoría.
function canEditLevels(role: string) {
  return role === "ceo" || role === "head_success" || role === "fisio";
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canEditLevels(user.role)) return forbidden();
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const levels = await prisma.categoryLevel.findMany({
    where: categoryId ? { categoryId } : undefined,
    include: { rules: { include: { movement: true } } },
    orderBy: [{ category: { name: "asc" } }, { order: "asc" }],
  });
  return NextResponse.json({ levels });
}

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canEditLevels(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const categoryId = typeof data?.categoryId === "string" ? data.categoryId : "";
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  const description = typeof data?.description === "string" ? data.description.trim() || null : null;
  if (!categoryId || !name) {
    return NextResponse.json({ error: "categoryId y name requeridos" }, { status: 400 });
  }
  const last = await prisma.categoryLevel.findFirst({
    where: { categoryId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const created = await prisma.categoryLevel.create({
    data: { categoryId, name, description, order: (last?.order ?? -1) + 1 },
  });
  return NextResponse.json({ level: created });
}

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canEditLevels(user.role)) return forbidden();
  const data = await req.json().catch(() => ({}));
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const update: any = {};
  if (data.name !== undefined) update.name = String(data.name);
  if (data.description !== undefined) update.description = data.description ? String(data.description) : null;
  if (data.order !== undefined && Number.isFinite(Number(data.order))) update.order = Number(data.order);
  const updated = await prisma.categoryLevel.update({ where: { id }, data: update });
  return NextResponse.json({ level: updated });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canEditLevels(user.role)) return forbidden();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await prisma.categoryLevel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
