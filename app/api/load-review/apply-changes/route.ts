/**
 * Aplica el plan IA: upsert de PatientCategoryLevel para cada selección y
 * materializa las reglas en PatientAdaptation. Marca el record.
 *
 * POST body: { recordId, patientId, selections: [{categoryId, proposedLevelId}] }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";
import { materializePatientCategoryLevels } from "@/lib/materialize-category-levels";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json().catch(() => ({}));
  const recordId = typeof data?.recordId === "string" ? data.recordId : "";
  const patientId = typeof data?.patientId === "string" ? data.patientId : "";
  const selections = Array.isArray(data?.selections) ? data.selections : [];
  if (!recordId || !patientId) {
    return NextResponse.json({ error: "recordId + patientId requeridos" }, { status: 400 });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId }, select: { id: true, assignedProfessionalId: true },
  });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  const allowed = user.isManager || patient.assignedProfessionalId === user.id;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let applied = 0;
  for (const s of selections) {
    const categoryId = String(s?.categoryId ?? "").trim();
    const categoryLevelId = String(s?.proposedLevelId ?? "").trim();
    if (!categoryId || !categoryLevelId) continue;
    // Validar pertenencia
    const lv = await prisma.categoryLevel.findUnique({ where: { id: categoryLevelId }, select: { categoryId: true } });
    if (!lv || lv.categoryId !== categoryId) continue;
    await prisma.patientCategoryLevel.upsert({
      where: { patientId_categoryId: { patientId, categoryId } },
      create: { patientId, categoryId, categoryLevelId },
      update: { categoryLevelId },
    });
    applied++;
  }

  await materializePatientCategoryLevels(patientId);

  await prisma.loadReviewRecord.update({
    where: { id: recordId },
    data: {
      decision: "apply",
      appliedNotes: JSON.stringify({ selectionsApplied: applied }),
      decidedAt: new Date(),
    },
  });
  await prisma.patient.update({
    where: { id: patientId },
    data: { loadReviewLastAt: new Date() },
  });

  return NextResponse.json({ ok: true, applied });
}
