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

/** Normalización "espaciada": minúsculas, sin acentos, sin hyphens ni
 *  underscores (los sustituimos por espacio), espacios múltiples colapsados.
 *  Ej: "Wall-Balls" → "wall balls"; "Handstand Push-Up" → "handstand push up".
 *  Se usa para el matching con \b (word boundaries funcionan bien sobre esta
 *  representación). */
function normalizeSpaced(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // sin diacríticos (á → a)
    .replace(/[-_/]+/g, " ")             // hyphens/underscores/slashes → espacio
    .replace(/\s+/g, " ")                // colapsa espacios
    .trim();
}

/** Normalización "colapsada": la anterior + sin espacios. Sirve para pillar
 *  variantes pegadas típicas del CrossFit ("wallballs", "toestobar",
 *  "kbswing"). Se usa como segunda pasada por si el alias no matcheó
 *  espaciado. */
function normalizeCollapsed(s: string): string {
  return normalizeSpaced(s).replace(/\s+/g, "");
}

// Tokeniza el WOD en líneas y detecta movimientos por aliases
export async function parseWod(rawText: string): Promise<ParsedLine[]> {
  const movements = await prisma.movement.findMany();

  // Índice: guardamos las dos normalizaciones de cada alias para poder
  // matchear "wall balls" ↔ "wallballs" ↔ "wall-balls" indistintamente.
  const aliasIndex: Array<{ spaced: string; collapsed: string; mov: typeof movements[0] }> = [];
  for (const mov of movements) {
    const rawAliases = [
      ...mov.aliases.split(",").map((a) => a.trim()).filter(Boolean),
      mov.canonicalName,
      mov.displayName,
    ];
    for (const raw of rawAliases) {
      const spaced = normalizeSpaced(raw);
      if (!spaced) continue;
      aliasIndex.push({ spaced, collapsed: spaced.replace(/\s+/g, ""), mov });
    }
  }
  // Ordenar por longitud descendente para matchear "ring muscle up" antes que "muscle up"
  aliasIndex.sort((a, b) => b.spaced.length - a.spaced.length);

  // Separar el texto en líneas
  const lines = rawText
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: ParsedLine[] = [];

  for (const line of lines) {
    const spaced = normalizeSpaced(line);
    const collapsed = normalizeCollapsed(line);

    // Pasada 1 — match espaciado con word boundaries. Cubre el 95% de casos.
    // Pasada 2 — match sobre versión sin espacios (para "wallballs" cuando el
    // catálogo dice "wall balls" y viceversa). Sin \b porque perderíamos
    // demasiado; buscamos como substring y filtramos por longitud mínima
    // para no dar falsos positivos con aliases cortos.
    let matched: typeof aliasIndex[0] | undefined;
    for (const entry of aliasIndex) {
      const spacedRe = new RegExp(`(^|\\W)${escapeRegex(entry.spaced)}(\\W|$)`, "i");
      if (spacedRe.test(spaced)) { matched = entry; break; }
      // La versión colapsada solo la usamos si el alias tiene >=5 chars —
      // umbral bajo para pillar plurales como "squats"/"cleans", pero no
      // aliases muy cortos ("row") que darían falsos positivos.
      if (entry.collapsed.length >= 5 && collapsed.includes(entry.collapsed)) {
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
