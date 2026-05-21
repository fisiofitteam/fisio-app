import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdaptationEditor } from "@/components/AdaptationEditor";

export default async function PatientCargasTab({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: {
      adaptations: true,
      wodLogs: { orderBy: { submittedAt: "desc" }, take: 5 },
    },
  });
  if (!patient) notFound();

  const movements = await prisma.movement.findMany({
    include: { category: true },
    orderBy: [{ category: { name: "asc" } }, { displayName: "asc" }],
  });

  const categories = await prisma.movementCategory.findMany({
    orderBy: { name: "asc" },
  });

  const profiles = await prisma.clinicalProfile.findMany({
    include: { levels: { orderBy: { order: "asc" } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <AdaptationEditor
        patientId={patient.id}
        appliedLevelId={patient.appliedLevelId}
        existing={patient.adaptations.map((a) => ({
          movementId: a.movementId,
          state: a.state as "OK" | "CONDITIONAL" | "BLOCKED",
          substitutionText: a.substitutionText ?? "",
          loadConstraint: a.loadConstraint ?? "",
          physioWarning: a.physioWarning ?? "",
        }))}
        movements={movements.map((m) => ({
          id: m.id,
          displayName: m.displayName,
          categoryId: m.categoryId,
          categoryName: m.category.name,
        }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        profiles={profiles.map((p) => ({
          id: p.id,
          name: p.name,
          levels: p.levels.map((l) => ({ id: l.id, name: l.name, order: l.order })),
        }))}
      />

      {patient.wodLogs.length > 0 && (
        <section className="card mt-4">
          <h2 className="font-medium mb-3">Últimos WODs registrados</h2>
          <div className="space-y-2">
            {patient.wodLogs.map((log) => (
              <div key={log.id} className="p-3 bg-neutral-50 rounded-lg text-sm">
                <div className="flex justify-between items-start">
                  <div className="text-xs text-neutral-500">
                    {new Date(log.submittedAt).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {log.rpe !== null && (
                    <div className="text-xs">
                      RPE <span className="font-medium">{log.rpe}</span>
                      {log.painScore !== null && log.painScore > 0 && (
                        <span className="ml-2 text-amber-700">Dolor {log.painScore}/10</span>
                      )}
                    </div>
                  )}
                </div>
                <pre className="text-xs mt-2 text-neutral-700 whitespace-pre-wrap font-mono">{log.rawText}</pre>
                {log.notes && <p className="text-xs italic text-neutral-600 mt-1">{log.notes}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
