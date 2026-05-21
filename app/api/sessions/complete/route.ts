import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  // Recorrer las respuestas y, si alguna es de tipo EVOLUTION, alimentar métricas
  const tasksSnapshot = JSON.parse(session.tasksSnapshot) as any[];
  const patientId = session.assignment.patientId;
  const now = session.completedAt ?? new Date();

  // Mapa key → metricId
  const metrics = await prisma.patientMetric.findMany({
    where: { patientId, key: { in: ["pain", "rpe", "stiffness"] } },
  });
  const byKey: Record<string, string> = {};
  for (const m of metrics) byKey[m.key] = m.id;

  for (const task of tasksSnapshot) {
    if (task.type !== "EVOLUTION") continue;
    const r = responses?.[task.id];
    if (!r) continue;

    const mappings: { key: string; value: any }[] = [
      { key: "rpe", value: r.rpe },
      { key: "pain", value: r.pain },
      { key: "stiffness", value: r.stiffness },
    ];

    for (const { key, value } of mappings) {
      if (typeof value !== "number") continue;
      if (!byKey[key]) continue;
      await prisma.metricEntry.create({
        data: { metricId: byKey[key], value, recordedAt: now, source: "session", sessionId },
      });
    }
  }

  return NextResponse.json(session);
}
