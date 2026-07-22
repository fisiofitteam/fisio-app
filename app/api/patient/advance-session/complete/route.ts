/**
 * POST /api/patient/advance-session/complete
 *
 * "He terminado la sesion" para pacientes ADVANCE (rolling). No hay
 * ProgramSession, asi que guardamos un AdvanceSessionLog por dia
 * (patientId + sessionDate unicos). Incluye las sensaciones que ha
 * escrito el atleta.
 *
 * Al guardar, dispara el clasificador IA de notas: si detecta warn/high,
 * crea una PatientAlert (kind="notes_ai"). Las alertas de pacientes
 * ADVANCE las gestiona el CEO — no llegan al buzon de los fisios normales
 * (filtro aplicado en /api/alerts).
 *
 * Auth: paciente activo. Solo funciona con programType="ADVANCE".
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";
import { todayForPatient } from "@/lib/patient-dates";
import { classifyPatientNote } from "@/lib/ai-classify-patient-notes";
import { createPatientAlert } from "@/lib/patient-alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const full = await prisma.patient.findUnique({
    where: { id: patient.id },
    select: { id: true, programType: true, timezone: true },
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (full.programType !== "ADVANCE") {
    return NextResponse.json({ error: "Solo pacientes ADVANCE" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const rawNotes = typeof body?.patientNotes === "string" ? body.patientNotes.trim() : "";
  const notes = rawNotes.length > 0 ? rawNotes : null;

  const sessionDate = todayForPatient(full.timezone);

  const log = await (prisma as any).advanceSessionLog.upsert({
    where: { patientId_sessionDate: { patientId: full.id, sessionDate } },
    create: { patientId: full.id, sessionDate, patientNotes: notes },
    update: { patientNotes: notes, completedAt: new Date() },
  });

  // Clasificador IA — silencioso ante fallos.
  if (notes) {
    try {
      const classification = await classifyPatientNote(notes);
      if (classification && (classification.severity === "warn" || classification.severity === "high")) {
        await createPatientAlert({
          patientId: full.id,
          kind: "notes_ai",
          severity: classification.severity,
          summary: classification.summary,
          triggerData: {
            note: notes,
            sentiment: classification.sentiment,
            topics: classification.topics,
          },
          sourceType: "session",
          sourceId: log.id,
        });
      }
    } catch { /* no bloquear al paciente */ }
  }

  return NextResponse.json({ ok: true, log });
}
