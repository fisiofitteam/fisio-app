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
import { todayForPatient, dowForPatient, weekStartForPatient } from "@/lib/patient-dates";
import { classifyPatientNote } from "@/lib/ai-classify-patient-notes";
import { createPatientAlert } from "@/lib/patient-alerts";
import { resolveVisibleRollingWeek } from "@/lib/rolling-visible-week";
import { applyRollingOverridesToTasks, fetchOverridesForPatient } from "@/lib/apply-rolling-overrides";

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

  const sessionDate = todayForPatient(full.timezone);

  // Snapshot de tareas del rolling ese dia — para que el historico del
  // paciente refleje lo que hizo aunque el rolling cambie despues.
  const tasksSnapshot = await buildTasksSnapshot(full);

  const log = await (prisma as any).advanceSessionLog.upsert({
    where: { patientId_sessionDate: { patientId: full.id, sessionDate } },
    create: { patientId: full.id, sessionDate, patientNotes: notes, tasksSnapshot },
    update: { patientNotes: notes, tasksSnapshot, completedAt: new Date() },
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

/**
 * Construye el snapshot JSON de las tareas efectivas del atleta ese dia
 * (dia = hoy en su TZ). Junta los dos bloques (Accesorios + Entrenamiento)
 * y aplica overrides por-paciente. Devuelve string JSON o null si no hay
 * nada programado. Silencioso ante fallos — el snapshot es un extra.
 */
async function buildTasksSnapshot(patient: {
  id: string;
  timezone: string | null;
  rollingAccessoriesId: string | null;
  rollingTrainingId: string | null;
  rollingProgramId: string | null;
}): Promise<string | null> {
  try {
    const today = new Date();
    const dowMondayBased = dowForPatient(patient.timezone, today);
    const todayDow = dowMondayBased % 7;
    const thisMonday = weekStartForPatient(patient.timezone, today);
    const accId = patient.rollingAccessoriesId;
    const trnId = patient.rollingTrainingId || patient.rollingProgramId;

    async function tasksFor(programId: string | null) {
      if (!programId) return [] as any[];
      const week: any = await resolveVisibleRollingWeek(programId, thisMonday, {
        days: {
          where: { dayOfWeek: todayDow },
          include: { tasks: { orderBy: { order: "asc" } } },
        },
      });
      if (!week) return [];
      return week.days.flatMap((d: any) => d.tasks);
    }

    const [accRaw, trnRaw, overrides] = await Promise.all([
      tasksFor(accId),
      tasksFor(trnId),
      fetchOverridesForPatient(patient.id),
    ]);
    const acc = applyRollingOverridesToTasks(accRaw as any, overrides as any);
    const trn = applyRollingOverridesToTasks(trnRaw as any, overrides as any);

    // Resolvemos vídeos referenciados para poder mostrarlos luego en el
    // histórico sin volver a consultar.
    const videoIds = new Set<string>();
    for (const t of [...acc, ...trn]) {
      if ((t.type === "VIDEO" || t.type === "WORKOUT") && t.videoId) videoIds.add(t.videoId);
    }
    const videos = videoIds.size > 0
      ? await prisma.videoLibrary.findMany({ where: { id: { in: Array.from(videoIds) } } })
      : [];
    const videosById: Record<string, { youtubeUrl: string; title: string }> = {};
    for (const v of videos) videosById[v.id] = { youtubeUrl: v.youtubeUrl, title: v.title };

    const shape = (t: any, block: "Accesorios" | "Entrenamiento") => ({
      id: t.id,
      type: t.type,
      title: t.title,
      bodyText: t.bodyText ?? null,
      videoId: t.videoId ?? null,
      youtubeUrl: t.videoId ? (videosById[t.videoId]?.youtubeUrl ?? null) : null,
      block,
    });
    const snapshot = [...acc.map((t) => shape(t, "Accesorios")), ...trn.map((t) => shape(t, "Entrenamiento"))];
    if (snapshot.length === 0) return null;
    return JSON.stringify(snapshot);
  } catch {
    return null;
  }
}
