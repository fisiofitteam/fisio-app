/**
 * POST /api/patient/advance-session/complete
 *
 * "He terminado la sesion" para pacientes ADVANCE. La semana del atleta
 * es una lista ordenada de sesiones 1..N (ver lib/advance-week.ts). Este
 * endpoint recibe el sessionIndex de la sesion que se acaba de marcar,
 * VALIDA que sea la siguiente pendiente (orden estricto) y persiste un
 * AdvanceSessionLog para (patient, weekStart, sessionIndex).
 *
 * Body:
 *   { sessionIndex: number, patientNotes?: string }
 *
 * Al guardar dispara el clasificador IA de notas: si detecta warn/high,
 * crea una PatientAlert (kind="notes_ai"). Las alertas de ADVANCE las
 * gestiona el CEO — no llegan al buzon de los fisios (filtrado en /api/alerts).
 *
 * Auth: paciente activo. Solo funciona con programType="ADVANCE".
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActivePatient } from "@/lib/session";
import { todayForPatient } from "@/lib/patient-dates";
import { classifyPatientNote } from "@/lib/ai-classify-patient-notes";
import { createPatientAlert } from "@/lib/patient-alerts";
import { buildAdvanceWeekView, buildAdvanceSessionSnapshot } from "@/lib/advance-week";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const patient = await getActivePatient();
  if (!patient) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const full = await prisma.patient.findUnique({
    where: { id: patient.id },
    select: {
      id: true, programType: true, timezone: true,
      rollingAccessoriesId: true, rollingTrainingId: true, rollingProgramId: true,
    },
  });
  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (full.programType !== "ADVANCE") {
    return NextResponse.json({ error: "Solo pacientes ADVANCE" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const rawNotes = typeof body?.patientNotes === "string" ? body.patientNotes.trim() : "";
  const notes = rawNotes.length > 0 ? rawNotes : null;

  const rawIndex = typeof body?.sessionIndex === "number" ? body.sessionIndex : Number(body?.sessionIndex);
  const sessionIndex = Number.isFinite(rawIndex) ? Math.round(rawIndex) : NaN;
  if (!Number.isFinite(sessionIndex) || sessionIndex < 1) {
    return NextResponse.json({ error: "sessionIndex requerido" }, { status: 400 });
  }

  // Cargamos la vista de la semana para validar orden estricto y capturar
  // el snapshot de tareas del atleta.
  const week = await buildAdvanceWeekView(full);
  const target = week.sessions.find((s) => s.sessionIndex === sessionIndex);
  if (!target) {
    return NextResponse.json({ error: "Esa sesión no existe en tu semana" }, { status: 400 });
  }
  // Solo se permite marcar la actual (nextIndex). Reeditando (target ya
  // completed) se acepta también — el atleta puede corregir sus notas.
  if (!target.completed && week.nextIndex !== null && sessionIndex !== week.nextIndex) {
    return NextResponse.json({
      error: `Antes debes completar la sesión ${week.nextIndex}.`,
    }, { status: 400 });
  }

  const sessionDate = todayForPatient(full.timezone);
  const tasksSnapshot = target.completed
    ? null // ya guardado la primera vez, no lo re-capturamos
    : await buildAdvanceSessionSnapshot(full, sessionIndex);

  const log = await (prisma as any).advanceSessionLog.upsert({
    where: {
      patientId_weekStart_sessionIndex: {
        patientId: full.id,
        weekStart: week.weekStart,
        sessionIndex,
      },
    },
    create: {
      patientId: full.id,
      sessionDate,
      weekStart: week.weekStart,
      sessionIndex,
      patientNotes: notes,
      tasksSnapshot,
    },
    update: {
      // Al re-editar sensaciones respetamos el snapshot y sessionDate
      // originales; solo actualizamos notes + completedAt.
      patientNotes: notes,
      completedAt: new Date(),
    },
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
            sessionIndex,
            weekStart: week.weekStart.toISOString(),
          },
          sourceType: "session",
          sourceId: log.id,
        });
      }
    } catch { /* no bloquear al paciente */ }
  }

  return NextResponse.json({ ok: true, log });
}
