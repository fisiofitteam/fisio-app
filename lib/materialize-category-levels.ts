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

type MinimalRule = {
  movementId: string;
  state: string;                   // "OK" | "CONDITIONAL" | "BLOCKED"
  loadConstraint: string | null;
  substitutionText: string | null;
  physioWarning: string | null;
  levelOrder: number;              // orden del nivel dentro de su categoría (menor = más restrictivo)
};

// Cuanto MAYOR el número, más restrictivo.
function stateWeight(state: string): number {
  if (state === "BLOCKED") return 3;
  if (state === "CONDITIONAL") return 2;
  return 1; // OK o desconocido
}

// Extrae un porcentaje de un texto tipo "50%", "al 60 %", "hasta 40%".
function extractPct(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return isFinite(n) ? n : null;
}

/**
 * Devuelve true si `a` es más restrictiva que `b`.
 *
 * Criterio en cascada:
 *   1. Menor `levelOrder` (nivel 2 gana sobre nivel 7 aunque sean de distintas categorías).
 *      Es la regla explícita pedida por el CEO: "si uno tiene nivel 2 y otro
 *      nivel 7, gana el 2".
 *   2. Mayor peso de state (BLOCKED > CONDITIONAL > OK) como desempate.
 *   3. Menor % en loadConstraint como último desempate.
 */
function isMoreRestrictive(a: MinimalRule, b: MinimalRule): boolean {
  if (a.levelOrder !== b.levelOrder) return a.levelOrder < b.levelOrder;
  const wa = stateWeight(a.state);
  const wb = stateWeight(b.state);
  if (wa !== wb) return wa > wb;
  const pa = extractPct(a.loadConstraint);
  const pb = extractPct(b.loadConstraint);
  if (pa != null && pb != null) return pa < pb;
  if (pa != null && pb == null) return true;
  return false;
}

export async function materializePatientCategoryLevels(patientId: string) {
  const selections = await prisma.patientCategoryLevel.findMany({
    where: { patientId },
    include: { categoryLevel: { include: { rules: true } } },
  });

  // Sin selecciones: no tocamos nada (respeta adaptaciones manuales previas
  // o el estado inicial del paciente).
  if (selections.length === 0) return;

  // Recolectamos todas las reglas, quedándonos con la más restrictiva por movimiento.
  const chosen = new Map<string, MinimalRule>();
  for (const sel of selections) {
    const levelOrder = sel.categoryLevel.order;
    for (const rule of sel.categoryLevel.rules) {
      const candidate: MinimalRule = {
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
