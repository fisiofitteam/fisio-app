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

// DELETE ?id= — borra un ejercicio en cascada.
// Antes bloqueábamos el borrado si tenía adaptaciones de pacientes o reglas
// de nivel. El CEO pidió poder borrar siempre, así que ahora limpiamos las
// referencias en una transacción y devolvemos cuántas tocamos para auditoría.
// Las adaptaciones se pierden — el cliente avisa antes con un confirm.
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const exists = await prisma.movement.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Ejercicio no encontrado" }, { status: 404 });

  const result = await prisma.$transaction(async (tx) => {
    const adaptations = await tx.patientAdaptation.deleteMany({ where: { movementId: id } });
    const clinicalRules = await tx.clinicalLevelRule.deleteMany({ where: { movementId: id } });
    const categoryRules = await tx.categoryLevelRule.deleteMany({ where: { movementId: id } });
    await tx.movement.delete({ where: { id } });
    return {
      adaptations: adaptations.count,
      clinicalRules: clinicalRules.count,
      categoryRules: categoryRules.count,
    };
  });

  return NextResponse.json({ ok: true, cleaned: result });
}

// GET ?id=<movementId>/usage — cuántas referencias tiene un ejercicio.
// Lo usa el cliente para mostrar un confirm honesto antes de borrar.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  const usage = req.nextUrl.searchParams.get("usage");
  if (!id || usage !== "1") return NextResponse.json({ error: "params requeridos" }, { status: 400 });

  const [adaptations, clinicalRules, categoryRules] = await Promise.all([
    prisma.patientAdaptation.count({ where: { movementId: id } }),
    prisma.clinicalLevelRule.count({ where: { movementId: id } }),
    prisma.categoryLevelRule.count({ where: { movementId: id } }),
  ]);
  return NextResponse.json({ adaptations, clinicalRules, categoryRules });
}
