import { prisma } from "./prisma";

export type ParsedLine = {
  raw: string;
  matchedMovementId?: string;
  matchedMovementName?: string;
  reps?: string;
  load?: string;
  unmatched?: boolean;
};

export type AdaptedLine = ParsedLine & {
  state?: "OK" | "CONDITIONAL" | "BLOCKED";
  substitutionText?: string | null;
  adaptedLoad?: string | null;
  physioWarning?: string | null;
};

// Tokeniza el WOD en líneas y detecta movimientos por aliases
export async function parseWod(rawText: string): Promise<ParsedLine[]> {
  const movements = await prisma.movement.findMany();

  // Construir índice: alias -> movement
  const aliasIndex: Array<{ alias: string; mov: typeof movements[0] }> = [];
  for (const mov of movements) {
    const aliases = mov.aliases.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
    aliases.push(mov.canonicalName.toLowerCase());
    aliases.push(mov.displayName.toLowerCase());
    for (const alias of aliases) {
      aliasIndex.push({ alias, mov });
    }
  }
  // Ordenar por longitud descendente para matchear "ring muscle up" antes que "muscle up"
  aliasIndex.sort((a, b) => b.alias.length - a.alias.length);

  // Separar el texto en líneas
  const lines = rawText
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: ParsedLine[] = [];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Buscar el primer alias que matchee
    let matched: typeof aliasIndex[0] | undefined;
    for (const entry of aliasIndex) {
      // Buscar como palabra independiente (no parte de otra)
      const regex = new RegExp(`(^|[^a-z0-9])${escapeRegex(entry.alias)}([^a-z0-9]|$)`, "i");
      if (regex.test(lowerLine)) {
        matched = entry;
        break;
      }
    }

    // Extraer reps y carga
    const repsMatch = line.match(/(\d+[-x]\d+(?:[-x]\d+)*|\d+\s*(?:reps?|rounds?|min|s)?)/i);
    const loadMatch = line.match(/(\d+(?:[.,]\d+)?\s*(?:kg|kilos?|lbs?|libras?|cm|m\b))/i);

    if (matched) {
      result.push({
        raw: line,
        matchedMovementId: matched.mov.id,
        matchedMovementName: matched.mov.displayName,
        reps: repsMatch?.[0],
        load: loadMatch?.[0],
      });
    } else {
      // Solo marcamos como unmatched si la línea parece tener un movimiento (no solo números/header)
      const looksLikeMovement = /[a-z]{3,}/i.test(line);
      result.push({
        raw: line,
        unmatched: looksLikeMovement,
      });
    }
  }

  return result;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Aplica la tabla de adaptaciones del paciente al WOD parseado
export async function adaptWod(
  parsed: ParsedLine[],
  patientId: string
): Promise<AdaptedLine[]> {
  const adaptations = await prisma.patientAdaptation.findMany({
    where: { patientId },
    include: { movement: true },
  });

  const adaptationMap = new Map(adaptations.map((a) => [a.movementId, a]));

  return parsed.map((line) => {
    if (!line.matchedMovementId) {
      return { ...line };
    }
    const adapt = adaptationMap.get(line.matchedMovementId);
    if (!adapt) {
      return { ...line, state: "OK" as const };
    }
    return {
      ...line,
      state: adapt.state as "OK" | "CONDITIONAL" | "BLOCKED",
      substitutionText: adapt.substitutionText,
      adaptedLoad: adapt.loadConstraint,
      physioWarning: adapt.physioWarning,
    };
  });
}
