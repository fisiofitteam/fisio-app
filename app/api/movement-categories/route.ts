import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string) {
  return role === "ceo" || role === "head_success";
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "cat";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let i = 1;
  while (await prisma.movementCategory.findUnique({ where: { slug } })) slug = `${base}_${i++}`;
  return slug;
}

// POST — crear bloque (categoría). body: { name }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const dup = await prisma.movementCategory.findUnique({ where: { name } });
  if (dup) return NextResponse.json({ error: "Ya existe un bloque con ese nombre" }, { status: 409 });
  const created = await prisma.movementCategory.create({ data: { name, slug: await uniqueSlug(slugify(name)) } });
  return NextResponse.json({ id: created.id, name: created.name });
}

// PATCH — renombrar bloque. body: { id, name }
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  const updated = await prisma.movementCategory.update({ where: { id: b.id }, data: { name } });
  return NextResponse.json({ id: updated.id, name: updated.name });
}

// DELETE ?id= — borra un bloque vacío (sin movimientos).
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const count = await prisma.movement.count({ where: { categoryId: id } });
  if (count > 0) return NextResponse.json({ error: "El bloque tiene ejercicios. Muévelos o elimínalos primero." }, { status: 409 });
  await prisma.movementCategory.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
