/**
 * Cierra la decisión del fisio sobre un LoadReviewRecord.
 *
 * PATCH body: { recordId, decision: "apply"|"edit"|"ignore", appliedNotes? }
 *  → marca el record + actualiza loadReviewLastAt del paciente.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveProfessional } from "@/lib/session";

export async function PATCH(req: NextRequest) {
  const user = await getActiveProfessional();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json().catch(() => ({}));
  const recordId = typeof data?.recordId === "string" ? data.recordId : "";
  const decisionIn = typeof data?.decision === "string" ? data.decision : "";
  const decision: "apply" | "edit" | "ignore" | null =
    decisionIn === "apply" || decisionIn === "edit" || decisionIn === "ignore" ? decisionIn : null;
  if (!recordId || !decision) {
    return NextResponse.json({ error: "recordId + decision (apply|edit|ignore)" }, { status: 400 });
  }
  const appliedNotes = typeof data?.appliedNotes === "string" ? data.appliedNotes : null;

  const record = await prisma.loadReviewRecord.findUnique({ where: { id: recordId } });
  if (!record) return NextResponse.json({ error: "Record no encontrado" }, { status: 404 });

  // Solo el fisio que generó la sugerencia o un manager pueden cerrar.
  if (record.professionalId !== user.id && !user.isManager) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.loadReviewRecord.update({
    where: { id: recordId },
    data: { decision, appliedNotes, decidedAt: new Date() },
  });

  // Si el fisio aplicó (tal cual o editado), marca como revisado al paciente.
  if (decision === "apply" || decision === "edit") {
    await prisma.patient.update({
      where: { id: record.patientId },
      data: { loadReviewLastAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
