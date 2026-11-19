import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AdaptationEditor } from "@/components/AdaptationEditor";
import { PatientCategoryLevelsPanel } from "@/components/PatientCategoryLevelsPanel";
import { getActiveProfessional } from "@/lib/session";
import { canAccessEvidencePatient } from "@/lib/patient-evidence";
import { usesWodReadiness } from "@/lib/wod-readiness";

export default async function PatientCargasTab({ params }: { params: { id: string } }) {
  const actor = await getActiveProfessional();
  if (!await canAccessEvidencePatient(params.id, actor)) notFound();
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
    redCategoryLevelId: patient.categoryLevels.find((s) => s.categoryId === c.categoryId)?.redCategoryLevelId ?? null,
    greenCategoryLevelId: patient.categoryLevels.find((s) => s.categoryId === c.categoryId)?.greenCategoryLevelId ?? null,
  }));

  // Sistema antiguo de Profile/Level lo mantenemos por compat pero ya NO lo
  // renderizamos. Quedará desactivado en UI hasta limpiar todo en fase 2.
  const profiles: any[] = [];

  return (
    <div className="space-y-4">
      <PatientCategoryLevelsPanel
        patientId={patient.id}
        programType={patient.programType}
        catalog={catalog}
        initialSelections={initialSelections}
      />

      {usesWodReadiness(patient.programType) && <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <h2 className="text-sm font-medium">Excepciones por movimiento</h2>
        <p className="mt-1 text-xs text-neutral-600">Las adaptaciones que edites manualmente abajo se aplican a rojo, ámbar y verde. Tienen prioridad sobre los niveles de cada color. Usa «Restablecer al nivel» para retirar una excepción.</p>
      </section>}

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
          isCustomized: (a as any).isCustomized ?? false,
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
