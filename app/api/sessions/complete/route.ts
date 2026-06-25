import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { materializePatientMetrics } from "@/lib/metric-definitions";

export async function POST(req: NextRequest) {
  const { sessionId, responses } = await req.json();

  const session = await prisma.programSession.update({
    where: { id: sessionId },
    data: {
      completedAt: new Date(),
      responses: JSON.stringify(responses ?? {}),
    },
    include: { assignment: true },
  });

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
