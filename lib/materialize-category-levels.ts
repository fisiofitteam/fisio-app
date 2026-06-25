/**
 * Materializa las reglas de los niveles seleccionados por el paciente en
 * PatientAdaptation (la tabla que ya consulta WodAdapter, AdaptationEditor, etc).
 *
 * Para cada (patientId, categoryId, categoryLevelId) → para cada movimiento de
 * la categoría con regla en ese nivel → upsert en PatientAdaptation.
 *
 * Movimientos de la categoría que NO tienen regla en el nivel: se borra la
 * adaptación (queda "OK" por defecto).
 */
import { prisma } from "@/lib/prisma";

export async function materializePatientCategoryLevels(patientId: string) {
  const selections = await prisma.patientCategoryLevel.findMany({
    where: { patientId },
    include: {
      category: { include: { movements: { select: { id: true } } } },
      categoryLevel: { include: { rules: true } },
    },
  });

  for (const sel of selections) {
    const movementIdsInCategory = new Set(sel.category.movements.map((m) => m.id));
    const ruleByMovementId = new Map(sel.categoryLevel.rules.map((r) => [r.movementId, r]));

    for (const mid of movementIdsInCategory) {
      const rule = ruleByMovementId.get(mid);
      if (rule) {
        await prisma.patientAdaptation.upsert({
          where: { patientId_movementId: { patientId, movementId: mid } },
          create: {
            patientId, movementId: mid,
            state: rule.state,
            loadConstraint: rule.loadConstraint,
            substitutionText: rule.substitutionText,
            physioWarning: rule.physioWarning,
          },
          update: {
            state: rule.state,
            loadConstraint: rule.loadConstraint,
            substitutionText: rule.substitutionText,
            physioWarning: rule.physioWarning,
          },
        });
      } else {
        // Si no hay regla en este nivel para ese movimiento → no es restringido.
        await prisma.patientAdaptation.deleteMany({
          where: { patientId, movementId: mid },
        });
      }
    }
  }
}
