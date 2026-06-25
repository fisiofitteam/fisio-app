/**
 * Asignación de nivel por categoría a un paciente.
 *
 * GET /api/patient-category-levels?patientId=
 *   → lista las selecciones actuales del paciente.
 *
 * PUT { patientId, categoryId, categoryLevelId }
 *   → upsert + materializa reglas en PatientAdaptation.
 *
 * DELETE ?patientId=&categoryId=
 *   → quita la selección de esa categoría + limpia las adaptaciones aplicadas.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { materializePatientCategoryLevels } from "@/lib/materialize-category-levels";

function forbidden() { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }

async function canAccessPatient(userId: string, isManager: boolean, patientId: string): Promise<boolean> {
  if (isManager) return true;
  const p = await prisma.patient.findUnique({ where: { id: patientId }, select: { assignedProfessionalId: true } });
  return !!p && p.assignedProfessionalId === userId;
}

export async function GET(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const patientId = req.nextUrl.searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId requerido" }, { status: 400 });
  if (!(await canAccessPatient(user.id, user.isManager, patientId))) return forbidden();
  const selections = await prisma.patientCategoryLevel.findMany({
    where: { patientId },
    include: { category: true, categoryLevel: true },
  });
  return NextResponse.json({ selections });
}

export async function PUT(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => ({}));
  const patientId = typeof data?.patientId === "string" ? data.patientId : "";
  const categoryId = typeof data?.categoryId === "string" ? data.categoryId : "";
  const categoryLevelId = typeof data?.categoryLevelId === "string" ? data.categoryLevelId : "";
  if (!patientId || !categoryId || !categoryLevelId) {
    return NextResponse.json({ error: "patientId + categoryId + categoryLevelId requeridos" }, { status: 400 });
  }
  if (!(await canAccessPatient(user.id, user.isManager, patientId))) return forbidden();

  // Validar que el nivel pertenece a la categoría.
  const level = await prisma.categoryLevel.findUnique({ where: { id: categoryLevelId }, select: { categoryId: true } });
  if (!level || level.categoryId !== categoryId) {
    return NextResponse.json({ error: "El nivel no pertenece a esa categoría" }, { status: 400 });
  }

  await prisma.patientCategoryLevel.upsert({
    where: { patientId_categoryId: { patientId, categoryId } },
    create: { patientId, categoryId, categoryLevelId },
    update: { categoryLevelId },
  });
  await materializePatientCategoryLevels(patientId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const patientId = req.nextUrl.searchParams.get("patientId");
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  if (!patientId || !categoryId) {
    return NextResponse.json({ error: "patientId + categoryId requeridos" }, { status: 400 });
  }
  if (!(await canAccessPatient(user.id, user.isManager, patientId))) return forbidden();

  await prisma.patientCategoryLevel.deleteMany({ where: { patientId, categoryId } });
  // Limpia las adaptaciones materializadas: borra todas las del paciente para movimientos de esta categoría.
  const movements = await prisma.movement.findMany({ where: { categoryId }, select: { id: true } });
  await prisma.patientAdaptation.deleteMany({
    where: { patientId, movementId: { in: movements.map((m) => m.id) } },
  });
  return NextResponse.json({ ok: true });
}
