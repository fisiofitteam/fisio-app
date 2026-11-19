/**
 * Materializa las reglas de los niveles seleccionados por el paciente en
 * PatientAdaptation (la tabla que ya consulta WodAdapter, AdaptationEditor, etc).
 *
 * Un movimiento puede recibir reglas desde varios niveles (varias categorías
 * seleccionadas). En ese caso gana la MÁS RESTRICTIVA. Esto permite que el
 * mismo ejercicio (ej. overhead squat) esté configurado en "Sentadilla" y en
 * "Overhead" — y el paciente reciba la restricción más fuerte de las dos.
 *
 * Movimientos sin ninguna regla en las categorías seleccionadas → se borra la
 * adaptación (queda "OK" por defecto).
 */
import { prisma } from "@/lib/prisma";

import { isMoreRestrictive, type OrderedWodRule } from "./wod-readiness-rules";

export async function materializePatientCategoryLevels(patientId: string) {
  const selections = await prisma.patientCategoryLevel.findMany({
    where: { patientId },
    include: { categoryLevel: { include: { rules: true } } },
  });

  // Sin selecciones: no tocamos nada (respeta adaptaciones manuales previas
  // o el estado inicial del paciente).
  if (selections.length === 0) return;

  // Recolectamos todas las reglas, quedándonos con la más restrictiva por movimiento.
  const chosen = new Map<string, OrderedWodRule>();
  for (const sel of selections) {
    const levelOrder = sel.categoryLevel.order;
    for (const rule of sel.categoryLevel.rules) {
      const candidate: OrderedWodRule = {
        movementId: rule.movementId,
        state: rule.state,
        loadConstraint: rule.loadConstraint,
        substitutionText: rule.substitutionText,
        physioWarning: rule.physioWarning,
        levelOrder,
      };
      const prev = chosen.get(rule.movementId);
      if (!prev || isMoreRestrictive(candidate, prev)) {
        chosen.set(rule.movementId, candidate);
      }
    }
  }

  const keepIds = [...chosen.keys()];

  // Adaptaciones que el fisio ha editado a mano — no las pisamos NUNCA aunque
  // el paciente cambie de nivel. Volver al default requiere el botón
  // "Restablecer al nivel" en el editor (endpoint DELETE de adaptations).
  const customized = await prisma.patientAdaptation.findMany({
    where: { patientId, isCustomized: true },
    select: { movementId: true },
  });
  const customizedIds = new Set(customized.map((c) => c.movementId));

  // Borrar adaptaciones de movimientos que ya no tienen regla en ninguna
  // categoría seleccionada, EXCEPTO las personalizadas por el fisio.
  await prisma.patientAdaptation.deleteMany({
    where: {
      patientId,
      isCustomized: false,
      ...(keepIds.length ? { movementId: { notIn: keepIds } } : {}),
    },
  });

  // Upsert de las elegidas (más restrictivas), saltando las personalizadas.
  for (const [mid, rule] of chosen) {
    if (customizedIds.has(mid)) continue;
    await prisma.patientAdaptation.upsert({
      where: { patientId_movementId: { patientId, movementId: mid } },
      create: {
        patientId, movementId: mid,
        state: rule.state,
        loadConstraint: rule.loadConstraint,
        substitutionText: rule.substitutionText,
        physioWarning: rule.physioWarning,
        isCustomized: false,
      },
      update: {
        state: rule.state,
        loadConstraint: rule.loadConstraint,
        substitutionText: rule.substitutionText,
        physioWarning: rule.physioWarning,
        // isCustomized se mantiene false — solo el editor manual lo pone true.
      },
    });
  }
}
