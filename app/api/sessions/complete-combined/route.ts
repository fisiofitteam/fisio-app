/**
 * Completa varias ProgramSession a la vez (sesión "combinada" del paciente
 * con N programas en paralelo).
 *
 * POST body:
 *   {
 *     sessionIds: string[],    // todas las sesiones de hoy a marcar completadas
 *     responses: { [taskId]: any }  // respuestas del paciente (texto, métricas…)
 *   }
 *
 * Para las tareas EVOLUTION: si la sesión X tiene una EVOLUTION con id e1 y
 * la sesión Y tiene EVOLUTION con id e2, el cliente puede enviar la respuesta
 * solo bajo una de las dos ids. Aquí detectamos eso y replicamos la respuesta
 * a la otra para que ambos programas reciban la misma entrada de métricas.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { materializePatientMetrics } from "@/lib/metric-definitions";
import { classifyPatientNote } from "@/lib/ai-classify-patient-notes";
import { createPatientAlert } from "@/lib/patient-alerts";

export async function POST(req: NextRequest) {
  const { sessionIds, responses, patientNotes } = await req.json();
  if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
    return NextResponse.json({ error: "sessionIds requerido" }, { status: 400 });
  }
  const responsesObj: Record<string, any> = responses && typeof responses === "object" ? responses : {};

  // Sensaciones del paciente al terminar la sesion combinada. Se replica
  // en TODAS las ProgramSession del combo para que aparezcan en el registro
  // del fisio (tab "Readaptacion y wods") independientemente de por que
  // sesion filtre. Si viene vacio (compat con clientes antiguos), null.
  const notes = typeof patientNotes === "string" ? patientNotes.trim() : "";
  const notesToSave = notes.length > 0 ? notes : null;

  // Cargar todas las sesiones
  const sessions = await prisma.programSession.findMany({
    where: { id: { in: sessionIds } },
    include: { assignment: true },
  });

  if (sessions.length === 0) {
    return NextResponse.json({ error: "No se encontraron sesiones" }, { status: 404 });
  }

  // Asumimos que todas las sesiones son del mismo paciente.
  const patientId = sessions[0].assignment.patientId;
  for (const s of sessions) {
    if (s.assignment.patientId !== patientId) {
      return NextResponse.json({ error: "Todas las sesiones deben ser del mismo paciente" }, { status: 400 });
    }
  }

  // Detectar respuesta EVOLUTION compartida: si alguna evolution task tiene
  // respuesta, esa es la "buena". Replicarla a las demás evolution tasks de
  // todas las sesiones.
  let sharedEvolutionResponse: any | null = null;
  for (const s of sessions) {
    const snap = parseSnapshot(s.tasksSnapshot);
    for (const t of snap) {
      if (t?.type === "EVOLUTION" && responsesObj[t.id]) {
        sharedEvolutionResponse = responsesObj[t.id];
        break;
      }
    }
    if (sharedEvolutionResponse) break;
  }

  const now = new Date();

  // Métricas activas con "En sesión"
  const autoDefs = await prisma.metricDefinition.findMany({
    where: { auto: true, active: true },
    select: { key: true },
  });
  const autoKeys = autoDefs.map((d) => d.key);
  let byKey: Record<string, string> = {};
  if (autoKeys.length > 0) {
    await materializePatientMetrics(patientId);
    const metrics = await prisma.patientMetric.findMany({
      where: { patientId, key: { in: autoKeys } },
      select: { id: true, key: true },
    });
    for (const m of metrics) byKey[m.key] = m.id;
  }

  // Procesar cada sesión
  for (const s of sessions) {
    const snap = parseSnapshot(s.tasksSnapshot);
    // Construir el responses específico de esta sesión
    const sessionResponses: Record<string, any> = {};
    for (const t of snap) {
      if (t?.id && responsesObj[t.id] !== undefined) {
        sessionResponses[t.id] = responsesObj[t.id];
      }
      // Replicar evolution compartida si esta sesión tiene EVOLUTION y no
      // recibió respuesta directa.
      if (t?.type === "EVOLUTION" && sharedEvolutionResponse && !sessionResponses[t.id]) {
        sessionResponses[t.id] = sharedEvolutionResponse;
      }
    }

    await prisma.programSession.update({
      where: { id: s.id },
      data: {
        completedAt: now,
        responses: JSON.stringify(sessionResponses),
        patientNotes: notesToSave,
      },
    });

    // Registrar MetricEntries para esta sesión
    if (autoKeys.length > 0) {
      for (const t of snap) {
        if (t?.type !== "EVOLUTION") continue;
        const r = sessionResponses[t.id];
        if (!r || typeof r !== "object") continue;
        for (const key of autoKeys) {
          const v = r[key];
          if (typeof v !== "number") continue;
          if (!byKey[key]) continue;
          await prisma.metricEntry.create({
            data: { metricId: byKey[key], value: v, recordedAt: now, source: "session", sessionId: s.id },
          });
        }
      }
    }
  }

  // Clasificador IA de sensaciones — 1 sola pasada aunque haya N sesiones
  // combinadas (misma nota). Si detecta warn/high, crea UNA alerta
  // anclada a la primera sesion del combo. Silencioso ante fallos.
  if (notesToSave) {
    try {
      const classification = await classifyPatientNote(notesToSave);
      if (classification && (classification.severity === "warn" || classification.severity === "high")) {
        await createPatientAlert({
          patientId,
          kind: "notes_ai",
          severity: classification.severity,
          summary: classification.summary,
          triggerData: {
            note: notesToSave,
            sentiment: classification.sentiment,
            topics: classification.topics,
            combinedSessionIds: sessions.map((s) => s.id),
          },
          sourceType: "session",
          sourceId: sessions[0].id,
        });
      }
    } catch { /* no bloquear el flujo */ }
  }

  return NextResponse.json({ ok: true, completed: sessions.length });
}

function parseSnapshot(snap: string): any[] {
  try {
    const arr = JSON.parse(snap);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
