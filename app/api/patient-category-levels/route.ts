/**
 * The assigned category level is the AMBER baseline. RED/GREEN overrides only
 * configure a WOD variant: they never replace the baseline or materialize it.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { materializePatientCategoryLevels } from "@/lib/materialize-category-levels";
import { usesWodReadiness } from "@/lib/wod-readiness";
import { pilotSameOrigin } from "@/lib/shoulder-request-origin";

const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });
const selectionInclude = { category: true, categoryLevel: true, redCategoryLevel: true, greenCategoryLevel: true };
async function access(patientId: string) {
  const user = await getActiveProfessional();
  if (!user) return error("Unauthorized", 401);
  if (!await canAccessEvidencePatient(patientId, user)) return error("Forbidden", 403);
  return null;
}

export async function GET(req: NextRequest) {
  const patientId = req.nextUrl.searchParams.get("patientId");
  if (!patientId) return error("patientId requerido", 400);
  const denied = await access(patientId);
  if (denied) return denied;
  const selections = await prisma.patientCategoryLevel.findMany({
    where: { patientId }, include: selectionInclude,
  });
  return NextResponse.json({ selections }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: NextRequest) {
  if (!pilotSameOrigin(req)) return error("Origen no permitido", 403);
  const data = await req.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) return error("Petición no válida", 400);
  const patientId = typeof data.patientId === "string" ? data.patientId : "";
  const categoryId = typeof data.categoryId === "string" ? data.categoryId : "";
  const readiness = data.readiness === undefined ? "AMBER" : data.readiness;
  const categoryLevelId = data.categoryLevelId;
  if (!patientId || !categoryId || !["AMBER", "RED", "GREEN"].includes(readiness) ||
      (typeof categoryLevelId !== "string" && categoryLevelId !== null) ||
      (typeof categoryLevelId === "string" && !categoryLevelId) ||
      (readiness === "AMBER" && !categoryLevelId)) {
    return error("Paciente, categoría y nivel válidos requeridos", 400);
  }
  const denied = await access(patientId);
  if (denied) return denied;

  if (readiness !== "AMBER") {
    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { programType: true } });
    if (!patient || !usesWodReadiness(patient.programType)) return error("El semáforo está disponible en Recupera y Consolida", 400);
  }
  if (categoryLevelId !== null) {
    const level = await prisma.categoryLevel.findUnique({ where: { id: categoryLevelId }, select: { categoryId: true } });
    if (!level || level.categoryId !== categoryId) return error("El nivel no pertenece a esa categoría", 400);
  }

  if (readiness !== "AMBER") {
    const changed = await prisma.patientCategoryLevel.updateMany({
      where: { patientId, categoryId },
      data: readiness === "RED" ? { redCategoryLevelId: categoryLevelId } : { greenCategoryLevelId: categoryLevelId },
    });
    if (!changed.count) return error("Asigna primero el nivel base ámbar de esta categoría", 409);
    // No materialization here: editing a WOD variant must not alter the usual plan.
    return NextResponse.json({ ok: true });
  }

  await prisma.patientCategoryLevel.upsert({
    where: { patientId_categoryId: { patientId, categoryId } },
    create: { patientId, categoryId, categoryLevelId },
    // Explicit colour overrides survive a change to the baseline.
    update: { categoryLevelId },
  });
  await materializePatientCategoryLevels(patientId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!pilotSameOrigin(req)) return error("Origen no permitido", 403);
  const patientId = req.nextUrl.searchParams.get("patientId");
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  if (!patientId || !categoryId) return error("patientId + categoryId requeridos", 400);
  const denied = await access(patientId);
  if (denied) return denied;

  const selection = await prisma.patientCategoryLevel.findUnique({
    where: { patientId_categoryId: { patientId, categoryId } },
    include: { categoryLevel: { select: { rules: { select: { movementId: true } } } } },
  });
  if (!selection) return NextResponse.json({ ok: true });
  const removed = await prisma.patientCategoryLevel.deleteMany({ where: { patientId, categoryId } });
  if (!removed.count) return NextResponse.json({ ok: true });
  const remaining = await prisma.patientCategoryLevel.findFirst({ where: { patientId }, select: { id: true } });
  if (remaining) {
    // Reconcile all categories, including movements shared by several levels.
    await materializePatientCategoryLevels(patientId);
  } else {
    // Only withdraw rules from this baseline. Unrelated legacy adaptations and
    // manual exceptions must survive removal of the final category selection.
    const movementIds = selection.categoryLevel.rules.map(rule => rule.movementId);
    if (movementIds.length) await prisma.patientAdaptation.deleteMany({
      where: { patientId, isCustomized: false, movementId: { in: movementIds } },
    });
  }
  return NextResponse.json({ ok: true });
}
