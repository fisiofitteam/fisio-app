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
  // El nuevo bloque va al final del orden actual.
  const last = await prisma.movementCategory.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (last?.order ?? -1) + 1;
  const created = await prisma.movementCategory.create({
    data: { name, slug: await uniqueSlug(slugify(name)), order: nextOrder },
  });
  return NextResponse.json({ id: created.id, name: created.name });
}

// PUT — reordenar bloques. body: { orderedIds: string[] }
// Asigna `order` = índice del array a cada categoría en una transacción.
// Las categorías no incluidas en orderedIds se quedan como estaban.
export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const ids = Array.isArray(b?.orderedIds) ? b.orderedIds.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "orderedIds requerido" }, { status: 400 });
  await prisma.$transaction(
    ids.map((id: string, idx: number) =>
      prisma.movementCategory.update({ where: { id }, data: { order: idx } })
    )
  );
  return NextResponse.json({ ok: true, count: ids.length });
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

// DELETE ?id= — borra un bloque en cascada.
// Antes bloqueábamos si tenía movimientos. El CEO pidió poder borrar
// siempre, incluso con niveles y movimientos configurados. Hacemos el
// limpiado manual de lo que no tiene onDelete:Cascade en el schema:
//   - PatientCategoryLevel: selección de un paciente a un nivel de esta
//     categoría (no cascade).
//   - PatientAdaptation: adaptaciones del paciente sobre movimientos de
//     esta categoría (no cascade).
//   - ClinicalLevelRule: reglas del sistema antiguo de perfiles sobre
//     esos movimientos.
//   - Movement: los ejercicios de la categoría.
// Luego borramos la categoría; sus CategoryLevel (y por cascada sus
// CategoryLevelRule) caen solos.
export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const exists = await prisma.movementCategory.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });

  const result = await prisma.$transaction(async (tx) => {
    const movements = await tx.movement.findMany({ where: { categoryId: id }, select: { id: true } });
    const movIds = movements.map((m) => m.id);

    const patientSelections = await tx.patientCategoryLevel.deleteMany({ where: { categoryId: id } });

    let adaptations = 0;
    let clinicalRules = 0;
    if (movIds.length > 0) {
      const a = await tx.patientAdaptation.deleteMany({ where: { movementId: { in: movIds } } });
      const c = await tx.clinicalLevelRule.deleteMany({ where: { movementId: { in: movIds } } });
      adaptations = a.count;
      clinicalRules = c.count;
      await tx.movement.deleteMany({ where: { id: { in: movIds } } });
    }

    await tx.movementCategory.delete({ where: { id } });

    return {
      movements: movIds.length,
      patientSelections: patientSelections.count,
      adaptations,
      clinicalRules,
    };
  });

  return NextResponse.json({ ok: true, cleaned: result });
}

// GET ?id=X&usage=1 — qué se va a perder si borro el bloque.
// Lo usa la UI para mostrar el detalle antes del confirm.
export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user || !canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  const usage = req.nextUrl.searchParams.get("usage");
  if (!id || usage !== "1") return NextResponse.json({ error: "params requeridos" }, { status: 400 });

  const [movements, levels, patientSelections] = await Promise.all([
    prisma.movement.findMany({ where: { categoryId: id }, select: { id: true } }),
    prisma.categoryLevel.count({ where: { categoryId: id } }),
    prisma.patientCategoryLevel.count({ where: { categoryId: id } }),
  ]);
  const movIds = movements.map((m) => m.id);
  const [adaptations, clinicalRules, categoryRules] = movIds.length > 0
    ? await Promise.all([
        prisma.patientAdaptation.count({ where: { movementId: { in: movIds } } }),
        prisma.clinicalLevelRule.count({ where: { movementId: { in: movIds } } }),
        prisma.categoryLevelRule.count({ where: { movementId: { in: movIds } } }),
      ])
    : [0, 0, 0];

  return NextResponse.json({
    movements: movIds.length,
    levels,
    patientSelections,
    adaptations,
    clinicalRules,
    categoryRules,
  });
}
