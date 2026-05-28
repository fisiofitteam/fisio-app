import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdaptationEditor } from "@/components/AdaptationEditor";

export default async function PatientCargasTab({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: {
      adaptations: true,
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

    </div>
  );
}
