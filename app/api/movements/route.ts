import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

function canManage(role: string) {
  return role === "ceo" || role === "head_success";
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "mov";
}

async function uniqueCanonical(base: string): Promise<string> {
  let name = base;
  let i = 1;
  while (await prisma.movement.findUnique({ where: { canonicalName: name } })) name = `${base}_${i++}`;
  return name;
}

// POST — crear ejercicio. body: { displayName, categoryId, aliases?, isOverhead?, isImpact?, isKipping? }
export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const displayName = typeof b?.displayName === "string" ? b.displayName.trim() : "";
  const categoryId = typeof b?.categoryId === "string" ? b.categoryId : "";
  if (!displayName) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  if (!categoryId) return NextResponse.json({ error: "Elige un bloque" }, { status: 400 });
  const cat = await prisma.movementCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!cat) return NextResponse.json({ error: "Bloque no válido" }, { status: 400 });

  const created = await prisma.movement.create({
    data: {
      displayName,
      canonicalName: await uniqueCanonical(slugify(displayName)),
      aliases: typeof b?.aliases === "string" ? b.aliases.trim() : "",
      categoryId,
      isOverhead: !!b.isOverhead,
      isImpact: !!b.isImpact,
      isKipping: !!b.isKipping,
    },
  });
  return NextResponse.json({ id: created.id });
}

// PATCH — editar ejercicio. body: { id, displayName?, categoryId?, aliases?, isOverhead?, isImpact?, isKipping? }
export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b?.id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  const data: any = {};
  if (b.displayName !== undefined) data.displayName = String(b.displayName).trim();
  if (b.categoryId !== undefined) data.categoryId = b.categoryId;
  if (b.aliases !== undefined) data.aliases = String(b.aliases).trim();
  if (b.isOverhead !== undefined) data.isOverhead = !!b.isOverhead;
  if (b.isImpact !== undefined) data.isImpact = !!b.isImpact;
  if (b.isKipping !== undefined) data.isKipping = !!b.isKipping;
  const updated = await prisma.movement.update({ where: { id: b.id }, data });
  return NextResponse.json({ id: updated.id });
}

// DELETE ?id= — borra un ejercicio (si no está en uso en adaptaciones/perfiles).
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  try {
    await prisma.movement.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Este ejercicio está en uso (adaptaciones o perfiles). No se puede eliminar." },
      { status: 409 }
    );
  }
}
