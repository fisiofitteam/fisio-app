import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { assessmentTestFromSnapshot } from "@/lib/assessments";
import { head } from "@vercel/blob";

export async function assessmentAccess(patientId: string, patientOnly = false) {
  const actor = await getSessionUser();
  if (actor?.kind === "patient") return actor.patient.id === patientId;
  return !patientOnly && actor?.kind === "professional" && await canAccessEvidencePatient(patientId, actor.pro);
}
export async function assignedAssessment(sessionId: string, taskId: string, testId: string) {
  const session = await prisma.programSession.findUnique({ where: { id: sessionId }, include: { assignment: { select: { patientId: true } } } });
  if (!session || !await assessmentAccess(session.assignment.patientId, true)) throw new Error("Valoración no disponible.");
  const { task, test } = assessmentTestFromSnapshot(session.tasksSnapshot, taskId, testId);
  return { session, task, test };
}
export async function finishAssessmentUpload(id: string, pathname: string) {
  const row = await prisma.assessmentVideo.findUnique({ where: { id } });
  if (!row || row.pendingPath !== pathname || row.reviewedAt || !row.pendingUntil || row.pendingUntil < new Date()) return false;
  // Only inspect the server-created path. Never fetch a URL supplied by a client.
  if (!process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN) throw new Error("Almacenamiento no configurado.");
  const blob = await head(pathname, { token: process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN });
  if (blob.pathname !== pathname || blob.size !== row.pendingSize || blob.contentType !== row.pendingMime) throw new Error("El vídeo no coincide con la entrega.");
  const result = await prisma.assessmentVideo.updateMany({
    where: { id, pendingPath: pathname, reviewedAt: null },
    data: { url: blob.url, uploadedAt: new Date(), pendingPath: null, pendingMime: null, pendingSize: null, pendingUntil: null },
  });
  return result.count > 0;
}
