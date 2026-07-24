/**
 * POST /api/sessions/update-notes
 *   body: { sessionId, patientNotes }
 *
 * Permite al paciente reeditar sus sensaciones DESPUÉS de haber marcado
 * la sesión como completada. No modifica responses ni completedAt — solo
 * actualiza patientNotes. Dispara el clasificador IA de nuevo por si el
 * texto ha cambiado (podría escalar/desescalar la severidad).
 *
 * Auth: paciente activo. Solo se puede editar sesiones del propio
 * paciente y ya completadas (para editar antes de completar, la usa el
 * flujo normal de POST /api/sessions/complete).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";
import { classifyPatientNote } from "@/lib/ai-classify-patient-notes";
import { createPatientAlert } from "@/lib/patient-alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const raw = typeof body?.patientNotes === "string" ? body.patientNotes.trim() : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId requerido" }, { status: 400 });

  const session = await prisma.programSession.findUnique({
    where: { id: sessionId },
    include: { assignment: { select: { patientId: true } } },
  });
  if (!session) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  if (session.assignment.patientId !== patient.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session.completedAt) {
    return NextResponse.json({ error: "La sesión aún no está completada" }, { status: 400 });
  }

  const notesToSave = raw.length > 0 ? raw : null;

  await prisma.programSession.update({
    where: { id: sessionId },
    data: { patientNotes: notesToSave },
  });

  // Clasificador IA — silencioso ante fallos. Si el texto cambio y el
  // nivel de severidad sube, se genera otra alerta para el fisio.
  if (notesToSave) {
    try {
      const classification = await classifyPatientNote(notesToSave);
      if (classification && (classification.severity === "warn" || classification.severity === "high")) {
        await createPatientAlert({
          patientId: patient.id,
          kind: "notes_ai",
          severity: classification.severity,
          summary: classification.summary,
          triggerData: {
            note: notesToSave,
            sentiment: classification.sentiment,
            topics: classification.topics,
            edited: true,
          },
          sourceType: "session",
          sourceId: sessionId,
        });
      }
    } catch { /* silencioso */ }
  }

  return NextResponse.json({ ok: true });
}
