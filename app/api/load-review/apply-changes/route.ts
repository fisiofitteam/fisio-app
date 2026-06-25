/**
 * Aplica los cambios IA seleccionados al control de cargas del paciente
 * (upsert de PatientAdaptation por cada cambio).
 *
 * POST body: { recordId, patientId, changes: AdaptationChangeSlim[] }
 *   AdaptationChangeSlim: { movementId, proposed: { state, loadConstraint, substitutionText, physioWarning } }
 *
 * Marca el LoadReviewRecord con decision="apply" (o "edit" si se filtró) y
 * actualiza loadReviewLastAt del paciente.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function POST(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json().catch(() => ({}));
  const recordId = typeof data?.recordId === "string" ? data.recordId : "";
  const patientId = typeof data?.patientId === "string" ? data.patientId : "";
  const changes = Array.isArray(data?.changes) ? data.changes : [];
  const decisionLabel = typeof data?.decision === "string" ? data.decision : "apply";

  if (!recordId || !patientId) {
    return NextResponse.json({ error: "recordId + patientId requeridos" }, { status: 400 });
  }

  // Acceso
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, assignedProfessionalId: true },
  });
  if (!patient) return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 });
  const allowed = user.isManager || patient.assignedProfessionalId === user.id;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let applied = 0;
  for (const c of changes) {
    const movementId = String(c?.movementId ?? "").trim();
    const proposed = c?.proposed && typeof c.proposed === "object" ? c.proposed : {};
    const state = ["OK", "CONDITIONAL", "BLOCKED"].includes(String(proposed.state)) ? String(proposed.state) : null;
    if (!movementId || !state) continue;
    const loadConstraint = proposed.loadConstraint ? String(proposed.loadConstraint) : null;
    const substitutionText = proposed.substitutionText ? String(proposed.substitutionText) : null;
    const physioWarning = proposed.physioWarning ? String(proposed.physioWarning) : null;

    await prisma.patientAdaptation.upsert({
      where: { patientId_movementId: { patientId, movementId } },
      create: { patientId, movementId, state, loadConstraint, substitutionText, physioWarning },
      update: { state, loadConstraint, substitutionText, physioWarning },
    });
    applied++;
  }

  // Cerrar LoadReviewRecord
  await prisma.loadReviewRecord.update({
    where: { id: recordId },
    data: {
      decision: decisionLabel === "edit" ? "edit" : "apply",
      appliedNotes: JSON.stringify({ changesApplied: applied }),
      decidedAt: new Date(),
    },
  });
  await prisma.patient.update({
    where: { id: patientId },
    data: { loadReviewLastAt: new Date() },
  });

  return NextResponse.json({ ok: true, applied });
}
