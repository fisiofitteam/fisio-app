import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdaptationEditor } from "@/components/AdaptationEditor";
import { PatientCategoryLevelsPanel } from "@/components/PatientCategoryLevelsPanel";

export default async function PatientCargasTab({ params }: { params: { id: string } }) {
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: {
      adaptations: true,
      categoryLevels: { include: { category: true, categoryLevel: true } },
    },
  });
  if (!patient) notFound();

  const movements = await prisma.movement.findMany({
    include: { category: true },
    orderBy: [{ category: { name: "asc" } }, { displayName: "asc" }],
  });
  const categories = await prisma.movementCategory.findMany({
    include: { levels: { orderBy: { order: "asc" } } },
    orderBy: { name: "asc" },
  });

  // Catálogo solo de categorías que tienen niveles definidos.
  const catalog = categories
    .filter((c) => c.levels.length > 0)
    .map((c) => ({
      categoryId: c.id,
      categoryName: c.name,
      levels: c.levels.map((l) => ({ id: l.id, name: l.name, description: l.description, order: l.order })),
    }));

  const initialSelections = catalog.map((c) => ({
    categoryId: c.categoryId,
    categoryLevelId: patient.categoryLevels.find((s) => s.categoryId === c.categoryId)?.categoryLevelId ?? null,
  }));

  // Sistema antiguo de Profile/Level lo mantenemos por compat pero ya NO lo
  // renderizamos. Quedará desactivado en UI hasta limpiar todo en fase 2.
  const profiles: any[] = [];

  return (
    <div className="space-y-4">
      <PatientCategoryLevelsPanel
        patientId={patient.id}
        catalog={catalog}
        initialSelections={initialSelections}
      />

      <AdaptationEditor
        patientId={patient.id}
        appliedLevelId={null}
        hideProfileSelector={true}
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
        profiles={profiles}
      />
    </div>
  );
}
