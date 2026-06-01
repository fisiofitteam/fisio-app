import { prisma } from "@/lib/prisma";
import { EvolutionDashboard } from "@/components/EvolutionDashboard";
import { CoachDailyLogPanel } from "@/components/CoachDailyLogPanel";
import { materializePatientMetrics } from "@/lib/metric-definitions";

export default async function PatientEvolucionTab({ params }: { params: { id: string } }) {
  // Asegura que las métricas generales del CEO están asignadas a este paciente.
  await materializePatientMetrics(params.id);

  const [metrics, dailyLogs] = await Promise.all([
    prisma.patientMetric.findMany({
      where: { patientId: params.id, isVisible: true },
      include: { entries: { orderBy: { recordedAt: "asc" } } },
      orderBy: [{ isPreset: "desc" }, { order: "asc" }],
    }),
    prisma.patientDailyLog.findMany({
      where: { patientId: params.id },
      orderBy: { recordedDate: "desc" },
      take: 90,
    }).catch(() => [] as any[]),
  ]);

  return (
    <div className="space-y-4">
      <CoachDailyLogPanel
        entries={dailyLogs.map((e: any) => ({
          recordedDate: e.recordedDate.toISOString(),
          fatigue: e.fatigue,
          rpe: e.rpe,
          sleep: e.sleep,
        }))}
      />

      <EvolutionDashboard
        patientId={params.id}
        metrics={metrics.map((m) => ({
          id: m.id,
          key: m.key,
          name: m.name,
          unit: m.unit ?? "",
          isPreset: m.isPreset,
          entries: m.entries.map((e) => ({
            id: e.id,
            value: e.value,
            recordedAt: e.recordedAt.toISOString(),
            source: e.source,
          })),
        }))}
      />
    </div>
  );
}
