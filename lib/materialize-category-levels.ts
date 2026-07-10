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
};

// Cuanto MAYOR el número, más restrictivo.
function stateWeight(state: string): number {
  if (state === "BLOCKED") return 3;
  if (state === "CONDITIONAL") return 2;
  return 1; // OK o desconocido
}

// Extrae un porcentaje de un texto tipo "50%", "al 60 %", "hasta 40%". Menor = más restrictivo.
function extractPct(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  const n = Number(m[1]);
  return isFinite(n) ? n : null;
}

/**
 * `a` es más restrictiva que `b` si su state pesa más, o (mismo state) su
 * loadConstraint es un porcentaje menor.
 */
function isMoreRestrictive(a: MinimalRule, b: MinimalRule): boolean {
  const wa = stateWeight(a.state);
  const wb = stateWeight(b.state);
  if (wa !== wb) return wa > wb;
  // Mismo state → comparar carga
  const pa = extractPct(a.loadConstraint);
  const pb = extractPct(b.loadConstraint);
  if (pa != null && pb != null) return pa < pb;
  if (pa != null && pb == null) return true;   // a tiene límite concreto, b no
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
    for (const rule of sel.categoryLevel.rules) {
      const candidate: MinimalRule = {
        movementId: rule.movementId,
        state: rule.state,
        loadConstraint: rule.loadConstraint,
        substitutionText: rule.substitutionText,
        physioWarning: rule.physioWarning,
      };
      const prev = chosen.get(rule.movementId);
      if (!prev || isMoreRestrictive(candidate, prev)) {
        chosen.set(rule.movementId, candidate);
      }
    }
  }

  const keepIds = [...chosen.keys()];

  // Borrar adaptaciones de movimientos que ya no tienen regla en ninguna
  // categoría seleccionada. Si `keepIds` está vacío borra todas las
  // adaptaciones de patrones — que es lo correcto (todos los niveles del
  // paciente son "OK" para ese movimiento).
  await prisma.patientAdaptation.deleteMany({
    where: {
      patientId,
      ...(keepIds.length ? { movementId: { notIn: keepIds } } : {}),
    },
  });

  // Upsert de las elegidas (más restrictivas).
  for (const [mid, rule] of chosen) {
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
  }
}
