import { prisma } from "@/lib/prisma";
import { EvolutionDashboard } from "@/components/EvolutionDashboard";

export default async function PatientEvolucionTab({ params }: { params: { id: string } }) {
  const metrics = await prisma.patientMetric.findMany({
    where: { patientId: params.id, isVisible: true },
    include: {
      entries: { orderBy: { recordedAt: "asc" } },
    },
    orderBy: [{ isPreset: "desc" }, { order: "asc" }],
  });

  return (
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
  );
}
