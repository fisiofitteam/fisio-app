/**
 * Generador de sesiones ADVANCE con Claude Opus 4.7 + tool use.
 *
 * Flujo:
 *  1. Lee el brief del kind (accesorios | entrenamiento). Si tiene systemPrompt
 *     explícito, lo usa tal cual. Si no, compone el system a partir de los
 *     otros 10 campos (philosophy / voiceTone / structureHints / ...).
 *  2. Recupera 3-5 ejemplos del banco AiSessionExample que coincidan por
 *     palabras clave del prompt (título / focusTags / summary / contenido de
 *     los bloques). Los pasa como few-shot dentro del user message.
 *  3. Llama a Claude Opus 4.7 con una tool que fuerza el schema de salida.
 *  4. Devuelve la sesión ya parseada + metadata (tokens / ms).
 */
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getAiTrainingBrief, type BriefKind } from "@/lib/ai-training-brief";

const MODEL = "claude-opus-4-7";
// 4000 se quedaba corto con extraContext largos (ficha completa del paciente)
// + few-shot examples + tool schema: Claude cortaba a mitad y raw.blocks
// llegaba sin cerrar → 'Salida sin title o blocks'. 8000 da margen suficiente.
const MAX_OUTPUT_TOKENS = 8000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY no configurada. Añádela en Vercel → Environment Variables (Production)."
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type GeneratedBlock = {
  heading: string;
  body: string;
  exercises: string[];
};
export type GeneratedSession = {
  title: string;
  description: string | null;
  blocks: GeneratedBlock[];
};

export type GenerateSessionInput = {
  kind: BriefKind;
  prompt: string;                   // "hoy toca fuerza hombro accesorios, 45 min"
  dayOfWeek?: number | null;        // 1=lunes..7=domingo (contexto opcional)
  durationMin?: number | null;      // minutos objetivo (contexto opcional)
  extraContext?: string | null;     // texto libre extra (paciente, limitaciones…)
};

export type GenerateSessionResult = {
  session: GeneratedSession;
  meta: {
    model: string;
    kind: BriefKind;
    exampleIds: string[];           // ids del banco usados como few-shot
    inputTokens: number;
    outputTokens: number;
    elapsedMs: number;
  };
};

// ─── System prompt fallback (si el brief no tiene systemPrompt propio) ───────

function composeSystemFromFields(kind: BriefKind, b: {
  philosophy: string;
  voiceTone: string;
  structureHints: string;
  formats: string;
  intensityRules: string;
  vocabulary: string;
  dos: string;
  donts: string;
  goodExamples: string;
  badExamples: string;
}): string {
  const label = kind === "accesorios"
    ? "SESIÓN DE ACCESORIOS (movilidad · técnica · activación)"
    : "SESIÓN PRINCIPAL (fuerza · metcon)";
  const parts: string[] = [];
  parts.push(`Eres el coach de FisioFit Team generando UNA ${label} del programa ADVANCE. Devuelve tu respuesta usando la tool provista.`);
  if (b.philosophy.trim()) parts.push(`## Filosofía\n${b.philosophy.trim()}`);
  if (b.voiceTone.trim()) parts.push(`## Voz y tono\n${b.voiceTone.trim()}`);
  if (b.structureHints.trim()) parts.push(`## Estructura\n${b.structureHints.trim()}`);
  if (b.formats.trim()) parts.push(`## Formatos y notación\n${b.formats.trim()}`);
  if (b.intensityRules.trim()) parts.push(`## Intensidad\n${b.intensityRules.trim()}`);
  if (b.vocabulary.trim()) parts.push(`## Vocabulario\n${b.vocabulary.trim()}`);
  if (b.dos.trim()) parts.push(`## Do's\n${b.dos.trim()}`);
  if (b.donts.trim()) parts.push(`## Don'ts\n${b.donts.trim()}`);
  if (b.goodExamples.trim()) parts.push(`## Ejemplos buenos\n${b.goodExamples.trim()}`);
  if (b.badExamples.trim()) parts.push(`## Ejemplos malos\n${b.badExamples.trim()}`);
  return parts.join("\n\n");
}

// ─── Retrieval simple del banco por palabras clave ───────────────────────────

const STOPWORDS = new Set([
  "el","la","los","las","un","una","de","del","al","y","o","con","sin","en","por","para","que","es","un","una","hoy","es","tocan","toca","hacer","una","sesion","sesión","sessions","de","min","minutos","hombre","mujer",
]);

function tokenize(s: string): string[] {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

type ExampleRow = {
  id: string;
  title: string;
  summary: string;
  focusTags: string;
  description: string | null;
  blocksJSON: string;
  exerciseNames: string;
};

function scoreExample(promptTokens: string[], e: ExampleRow): number {
  const hay = [e.title, e.summary, e.focusTags, e.description ?? "", e.exerciseNames].join(" ").toLowerCase();
  const hayNorm = hay.normalize("NFD").replace(/[̀-ͯ]/g, "");
  let s = 0;
  for (const t of promptTokens) {
    if (hayNorm.includes(t)) s += 1;
    // El título pesa más
    if (e.title.toLowerCase().includes(t)) s += 1;
    // Los tags son señal clara
    if (e.focusTags.toLowerCase().includes(t)) s += 1;
  }
  return s;
}

async function retrieveExamples(kind: BriefKind, prompt: string, topN = 4): Promise<ExampleRow[]> {
  const all = await prisma.aiSessionExample.findMany({
    where: { kind },
    select: {
      id: true, title: true, summary: true, focusTags: true,
      description: true, blocksJSON: true, exerciseNames: true,
    },
  });
  if (all.length === 0) return [];
  const tokens = tokenize(prompt);
  if (tokens.length === 0) {
    // Sin señal: devolvemos una muestra aleatoria pequeña
    return shuffle(all).slice(0, topN);
  }
  const scored = all.map((e) => ({ e, s: scoreExample(tokens, e) }));
  scored.sort((a, b) => b.s - a.s);
  // Si el mejor tiene score 0, elegimos aleatorios (evitar sesgo del orden natural).
  if (scored[0].s === 0) return shuffle(all).slice(0, topN);
  return scored.slice(0, topN).map((x) => x.e);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Renderizado de ejemplo en formato compacto para el modelo ───────────────

function renderExample(e: ExampleRow): string {
  let blocks: { heading: string; body: string; exercises?: string[] }[] = [];
  try { blocks = JSON.parse(e.blocksJSON); } catch { /* ignore */ }
  const lines: string[] = [];
  lines.push(`## ${e.title}`);
  if (e.description) lines.push(`> ${e.description}`);
  for (const b of blocks) {
    lines.push("");
    lines.push(`**${b.heading}**`);
    lines.push(b.body);
  }
  return lines.join("\n");
}

// ─── Tool schema (fuerza salida JSON) ────────────────────────────────────────

const TOOL_NAME = "emit_session";
const TOOL_SCHEMA = {
  name: TOOL_NAME,
  description: "Emite la sesión generada como JSON estructurado.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string" as const,
        description: "Título corto de la sesión. Ej: 'ACC SNATCH/ OHS', 'Movilidad/ Act Squat', 'S1/D1 In-season'.",
      },
      description: {
        type: ["string", "null"] as any,
        description: "Intro opcional (2-4 líneas). null si no aporta contexto real.",
      },
      blocks: {
        type: "array" as const,
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object" as const,
          properties: {
            heading: { type: "string" as const, description: "Nombre del bloque en MAYÚSCULAS." },
            body: { type: "string" as const, description: "Cuerpo del bloque con formato, ejercicios, cargas y pausas. Usa \\n para saltos de línea." },
            exercises: {
              type: "array" as const,
              items: { type: "string" as const },
              description: "Lista de nombres de ejercicios del bloque.",
            },
          },
          required: ["heading", "body", "exercises"],
        },
      },
    },
    required: ["title", "blocks"],
  },
};

// ─── Función principal ───────────────────────────────────────────────────────

export async function generateSession(input: GenerateSessionInput): Promise<GenerateSessionResult> {
  const t0 = Date.now();
  const brief = await getAiTrainingBrief(input.kind);
  const system = brief.systemPrompt.trim()
    ? brief.systemPrompt.trim()
    : composeSystemFromFields(input.kind, brief);
  const examples = await retrieveExamples(input.kind, input.prompt, 4);

  const contextParts: string[] = [];
  if (typeof input.dayOfWeek === "number") {
    const names = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
    contextParts.push(`Día: ${names[input.dayOfWeek] ?? input.dayOfWeek}`);
  }
  if (typeof input.durationMin === "number") contextParts.push(`Duración objetivo: ${input.durationMin} min`);
  if (input.extraContext?.trim()) contextParts.push(`Extra: ${input.extraContext.trim()}`);

  const exampleBlock = examples.length > 0
    ? `Ejemplos de mi estilo (usa estos como referencia; NO los copies literales):\n\n${examples.map(renderExample).join("\n\n---\n\n")}`
    : "";

  const userMessage = [
    exampleBlock,
    contextParts.length > 0 ? `Contexto: ${contextParts.join(" · ")}` : "",
    `Pedido del fisio:\n${input.prompt.trim()}`,
    `Genera UNA sesión completa devolviéndola con la tool \`${TOOL_NAME}\`.`,
  ].filter(Boolean).join("\n\n");

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    tools: [TOOL_SCHEMA as any],
    tool_choice: { type: "tool", name: TOOL_NAME } as any,
    messages: [{ role: "user", content: userMessage }],
  });

  // Sacamos el tool_use del content
  const tu = res.content.find((c: any) => c.type === "tool_use") as any;
  if (!tu) throw new Error("Claude no llamó a la tool emit_session");
  const raw = tu.input as {
    title?: string;
    description?: string | null;
    blocks?: Array<{ heading?: string; body?: string; exercises?: string[] }>;
  };
  if (!raw?.title || !Array.isArray(raw?.blocks)) throw new Error("Salida sin title o blocks");
  const session: GeneratedSession = {
    title: raw.title,
    description: (typeof raw.description === "string" && raw.description.trim()) ? raw.description : null,
    blocks: raw.blocks.map((b) => ({
      heading: (b.heading ?? "").toString(),
      body: (b.body ?? "").toString(),
      exercises: Array.isArray(b.exercises) ? b.exercises.map(String) : [],
    })),
  };

  return {
    session,
    meta: {
      model: MODEL,
      kind: input.kind,
      exampleIds: examples.map((e) => e.id),
      inputTokens: (res.usage?.input_tokens ?? 0) as number,
      outputTokens: (res.usage?.output_tokens ?? 0) as number,
      elapsedMs: Date.now() - t0,
    },
  };
}
