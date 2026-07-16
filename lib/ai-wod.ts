// Parser de WODs basado en Claude (Anthropic API). Recibe el texto crudo y
// devuelve los movimientos detectados con sus reps/carga, mapeados a los IDs
// del catálogo del banco. Robusto a abreviaturas (T2B/OHS/HSPU/...), castellano
// vs inglés, variantes (Power/Hang/Squat snatch...) y formato libre.
// Si la API falla o no está configurada, el endpoint hace fallback al parser
// heurístico de lib/wodParser.ts.
import { prisma } from "./prisma";
import type { ParsedLine } from "./wodParser";

export function aiWodConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Modelo: Haiku 4.5 → rápido, baratísimo y muy capaz para extracción estructurada.
const MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `Eres un parser experto de WODs de CrossFit. Recibirás:
1. El texto de un WOD (puede venir en inglés, castellano, con abreviaturas o en formato libre).
2. Un catálogo JSON de movimientos disponibles con su id, nombre y aliases.

Tu trabajo: identificar TODOS los movimientos que aparecen en el WOD y devolverlos en JSON, usando EXCLUSIVAMENTE los IDs del catálogo.

Reglas:
- Una línea puede contener varios movimientos (ej. "10 thrusters + 15 pull-ups" → 2 entradas distintas).
- Reconoce abreviaturas habituales: T2B = Toes to bar, C2B = Chest to bar, OHS = Overhead squat, HSPU = Handstand push-up, DU = Double under, KBS = KB swing, BMU = Bar muscle up, RMU = Ring muscle up, DB = Dumbbell, KB = Kettlebell, GHD sit-up, WB = Wall ball.
- Distingue variantes: Power clean ≠ Clean ≠ Hang clean; Power snatch ≠ Snatch ≠ Hang snatch ≠ Squat snatch. Usa el id del catálogo MÁS específico que coincida; si no existe la variante exacta, usa el base.
- Castellano: dominadas=Pull-up, sentadilla=Squat, fondos=Push-up, peso muerto=Deadlift, zancadas=Lunge, saltos al cajón=Box jump, remo=Row, comba=Jump rope, balanceos de pesa rusa=KB swing, etc.
- IGNORA líneas que solo describen estructura: "For time", "AMRAP 20'", "EMOM 12'", "21-15-9", "5 rounds", "Buy-in", "Cash-out", "Rest", tiempos de descanso, números sueltos, etc.
- Para cada movimiento detectado extrae reps (string, puede ser "21-15-9" o "10") y load (string con unidad, ej. "42.5 kg", "20 lb", "24 kg").
- CRÍTICO: NO te saltes movimientos "obvios" como burpees, wall balls, ring dips, box jumps, dominadas, etc. Cada línea del WOD que menciona un ejercicio debe generar una entrada. Si ves "10 burpees" DEBE aparecer en la salida.
- Prefijos como "weighted", "banded", "russian", "kipping", "strict", "assisted", "tempo", "paused", "single arm", "single leg" NO son movimientos distintos: usa el movementId BASE del catálogo (ej. "3 weighted ring dip" → movementId de "Ring dip"; "20 banded tricep extension" → id de "Tricep extension" si existe; "3 strict pull-up" → id de "Pull-up"). Ese matching base es esencial para que el sistema encuentre la adaptación del paciente. Solo usa una variante específica si aparece explícitamente en el catálogo.

IMPORTANTE — Movimientos compuestos / variantes:
Para movimientos compuestos como "Hang power snatch", "Hang power clean", "Squat clean thruster" etc., NO basta con asignar UN solo id. Devuelve también la lista \`relatedMovementIds\` con TODAS las variantes del catálogo de las que ese movimiento "hereda": el sistema combinará las restricciones del paciente y se quedará con la más estricta.

Ejemplos de inheritance:
- "Hang power snatch" → movementId: Power snatch (la más específica del catálogo que coincida) + relatedMovementIds: [Hang snatch, Snatch].
- "Hang power clean" → movementId: Power clean + relatedMovementIds: [Hang clean, Clean].
- "Push jerk" → movementId: Push jerk (si existe) + relatedMovementIds: [Jerk, Push press] (los que existan).
- "DB snatch" → movementId: DB snatch (si existe) si no Snatch + relatedMovementIds: [Snatch].

Sé generoso poniendo hermanos: si dudas, inclúyelo. El sistema solo aplicará restricciones de los que el paciente tenga limitados.

Devuelve EXCLUSIVAMENTE un JSON array (sin texto antes ni después, sin code fences) con este formato:
[
  {
    "movementId": "<id principal>",
    "relatedMovementIds": ["<id hermano>", "<otro id>"],
    "raw": "<fragmento original>",
    "reps": "<opcional>",
    "load": "<opcional>"
  }
]

\`relatedMovementIds\` puede ser [] si no hay variantes hermanas. Si no detectas ningún movimiento del catálogo, devuelve [].`;

export async function parseWodWithAI(rawText: string): Promise<ParsedLine[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurado");

  // Catálogo compacto de movimientos
  const movements = await prisma.movement.findMany({
    select: { id: true, displayName: true, aliases: true },
  });
  const catalog = movements.map((m) => ({
    id: m.id,
    name: m.displayName,
    aliases: m.aliases.split(",").map((s) => s.trim()).filter(Boolean),
  }));
  const movNameById = new Map(movements.map((m) => [m.id, m.displayName]));
  const validIds = new Set(movements.map((m) => m.id));

  const userMessage = `WOD:
${rawText.trim()}

Catálogo de movimientos disponibles (usa SOLO estos ids):
${JSON.stringify(catalog)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";

  // Extraer el array JSON (Claude a veces lo envuelve en texto, aunque pedimos lo contrario)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  let parsed: Array<{ movementId?: string; relatedMovementIds?: unknown; raw?: string; reps?: string; load?: string }>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((p) => p?.movementId && validIds.has(p.movementId))
    .map((p) => {
      // Filtramos hermanos: solo ids válidos del catálogo y distintos del principal
      const related = Array.isArray(p.relatedMovementIds)
        ? p.relatedMovementIds.filter((x): x is string => typeof x === "string" && validIds.has(x) && x !== p.movementId)
        : [];
      return {
        raw: typeof p.raw === "string" ? p.raw : "",
        matchedMovementId: p.movementId!,
        matchedMovementName: movNameById.get(p.movementId!),
        reps: typeof p.reps === "string" ? p.reps : undefined,
        load: typeof p.load === "string" ? p.load : undefined,
        relatedMovementIds: related,
      };
    });
}
