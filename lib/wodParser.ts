import { prisma } from "./prisma";

export type ParsedLine = {
  raw: string;
  matchedMovementId?: string;
  matchedMovementName?: string;
  reps?: string;
  load?: string;
  unmatched?: boolean;
  // Variantes/movimientos hermanos que también aplican al ejercicio detectado.
  // Ej.: "Hang power snatch" hereda restricciones de "Hang snatch" y "Power snatch".
  // El adaptWod combina las adaptaciones de TODOS y se queda con la más estricta.
  relatedMovementIds?: string[];
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

// Aplica la tabla de adaptaciones del paciente al WOD parseado. Cuando un movimiento
// detectado declara hermanos (relatedMovementIds), se combinan las adaptaciones de
// todos los hermanos quedándonos con la MÁS ESTRICTA.
const STATE_RANK = { OK: 0, CONDITIONAL: 1, BLOCKED: 2 } as const;
type State = keyof typeof STATE_RANK;

// Extrae el primer número de un texto tipo "máx 50 kg" → 50. null si no hay número.
function loadNum(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(",", ".")) : null;
}

// Combina dos adaptaciones quedándonos con la más restrictiva.
function strictest(a: AdaptedLine, b: AdaptedLine): AdaptedLine {
  const ra = STATE_RANK[(a.state ?? "OK") as State];
  const rb = STATE_RANK[(b.state ?? "OK") as State];
  if (ra !== rb) return ra > rb ? a : b;
  // Mismo nivel de estado → fusionamos textos y nos quedamos con la carga más baja.
  const na = loadNum(a.adaptedLoad);
  const nb = loadNum(b.adaptedLoad);
  let adaptedLoad = a.adaptedLoad || b.adaptedLoad || null;
  if (na != null && nb != null) adaptedLoad = na <= nb ? a.adaptedLoad! : b.adaptedLoad!;
  else if (na != null) adaptedLoad = a.adaptedLoad!;
  else if (nb != null) adaptedLoad = b.adaptedLoad!;
  const join = (x?: string | null, y?: string | null) =>
    x && y && x !== y ? `${x} · ${y}` : (x || y || null);
  return {
    ...a,
    substitutionText: join(a.substitutionText, b.substitutionText),
    adaptedLoad,
    physioWarning: join(a.physioWarning, b.physioWarning),
  };
}

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
    // Movimiento principal + hermanos
    const ids = [line.matchedMovementId, ...(line.relatedMovementIds ?? [])];
    const adapts = ids.map((id) => adaptationMap.get(id)).filter(Boolean) as typeof adaptations;
    if (adapts.length === 0) {
      return { ...line, state: "OK" as const };
    }
    // Convertir cada adaptación a AdaptedLine y combinarlas con strictest()
    const asLines: AdaptedLine[] = adapts.map((a) => ({
      ...line,
      state: a.state as State,
      substitutionText: a.substitutionText,
      adaptedLoad: a.loadConstraint,
      physioWarning: a.physioWarning,
    }));
    return asLines.reduce((acc, cur) => strictest(acc, cur));
  });
}
