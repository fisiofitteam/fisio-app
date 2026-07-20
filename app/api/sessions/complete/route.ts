import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { materializePatientMetrics } from "@/lib/metric-definitions";
import { classifyPatientNote } from "@/lib/ai-classify-patient-notes";
import { createPatientAlert } from "@/lib/patient-alerts";

export async function POST(req: NextRequest) {
  const { sessionId, responses, patientNotes } = await req.json();

  // Sensaciones del paciente al terminar la sesión (nuevo flujo para
  // RECUPERA/CONSOLIDA). Trimeamos y descartamos si viene vacío/muy corto.
  const notes = typeof patientNotes === "string" ? patientNotes.trim() : "";
  const notesToSave = notes.length > 0 ? notes : null;

  const session = await prisma.programSession.update({
    where: { id: sessionId },
    data: {
      completedAt: new Date(),
      responses: JSON.stringify(responses ?? {}),
      patientNotes: notesToSave,
    },
    include: { assignment: true },
  });

  // Detector IA de sensaciones — clasifica la nota y, si es warn+, crea
  // una PatientAlert para que el fisio la vea en su buzón. Va aqui despues
  // del save del session, envuelto en try/catch: fallo IA nunca rompe el
  // completar-sesion del paciente.
  if (notesToSave) {
    try {
      const classification = await classifyPatientNote(notesToSave);
      if (classification && (classification.severity === "warn" || classification.severity === "high")) {
        await createPatientAlert({
          patientId: session.assignment.patientId,
          kind: "notes_ai",
          severity: classification.severity,
          summary: classification.summary,
          triggerData: {
            note: notesToSave,
            sentiment: classification.sentiment,
            topics: classification.topics,
          },
          sourceType: "session",
          sourceId: session.id,
        });
      }
    } catch {
      // Nunca bloqueamos el flujo del paciente por fallo del clasificador.
    }
  }

  const tasksSnapshot = JSON.parse(session.tasksSnapshot) as any[];
  const patientId = session.assignment.patientId;
  const now = session.completedAt ?? new Date();

  // Métricas activas con auto=true (las que se piden en sesión).
  const autoDefs = await prisma.metricDefinition.findMany({
    where: { auto: true, active: true },
    select: { key: true },
  });
  const autoKeys = autoDefs.map((d) => d.key);
  if (autoKeys.length === 0) {
    return NextResponse.json(session);
  }

  // Asegura que existen PatientMetric para todas las keys auto (por si el CEO
  // añadió una métrica después de crear al paciente, no estaría materializada).
  await materializePatientMetrics(patientId);

  // Mapa key → metricId
  const metrics = await prisma.patientMetric.findMany({
    where: { patientId, key: { in: autoKeys } },
    select: { id: true, key: true },
  });
  const byKey: Record<string, string> = {};
  for (const m of metrics) byKey[m.key] = m.id;

  for (const task of tasksSnapshot) {
    if (task.type !== "EVOLUTION") continue;
    const r = responses?.[task.id];
    if (!r || typeof r !== "object") continue;

    for (const key of autoKeys) {
      const value = (r as any)[key];
      if (typeof value !== "number") continue;
      if (!byKey[key]) continue;
      await prisma.metricEntry.create({
        data: { metricId: byKey[key], value, recordedAt: now, source: "session", sessionId },
      });
    }
  }

  return NextResponse.json(session);
}
