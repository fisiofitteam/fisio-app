/**
 * Generación de series de Instagram Stories (9:16) con Claude Opus 4.7.
 *
 * Recibe un guion libre + parámetros del negocio (marca, nicho, tono) y
 * devuelve un JSON con slides ya maquetados: cada slide tiene un estilo
 * visual asignado y los textos distribuidos por hueco (título, subtítulo,
 * cuerpo, CTA).
 *
 * Solo servidor. Reutiliza la ANTHROPIC_API_KEY que ya usan ai-content y
 * ai-generate-session.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 3500;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY no configurada en Vercel.");
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// ─── Catálogo de estilos disponibles ────────────────────────────────────────
// El editor implementa cada uno como componente React con la paleta FisioFit.
// El promptHint es lo que se le envía a Claude para que sepa cuándo usarlo.

export const STORY_STYLES = [
  {
    key: "marca-base",
    label: "Marca base",
    promptHint:
      "look premium dark: fondo negro con textura sutil, título grande en amarillo cálido (Antonio o similar), cuerpo blanco. Ideal para arrancar la serie o para portadas.",
  },
  {
    key: "luxury",
    label: "Lujo / testimonio",
    promptHint:
      "look editorial elegante para testimonios reales de atletas: cita destacada entre comillas en italic serif (Cormorant), autoría abajo pequeño. Fondo negro puro. Sin adornos.",
  },
  {
    key: "bento",
    label: "Bento / datos",
    promptHint:
      "look estilo dashboard con bloques bento: 2-4 celdas con big-number o KPI, título arriba pequeño. Ideal para stats, resultados de reto, comparativas.",
  },
  {
    key: "magazine",
    label: "Revista / lección",
    promptHint:
      "look tipo revista impresa: título gigante ocupando 2/3 del slide, cuerpo justificado abajo. Ideal para lecciones largas, mitos vs realidades, análisis técnico.",
  },
  {
    key: "flashcard",
    label: "Flashcard / consejo",
    promptHint:
      "look tipo tarjeta minimal: un solo mensaje central corto y contundente. Fondo casi vacío, mucho aire. Ideal para consejos, hooks, one-liners.",
  },
] as const;

export type StoryStyleKey = (typeof STORY_STYLES)[number]["key"];

// ─── Tipos del slide y de la salida IA ──────────────────────────────────────

export type Slide = {
  styleKey: StoryStyleKey;
  title: string;
  subtitle: string;
  body: string;
  cta: string;
  bgUrl: string;      // vacío = fondo del estilo por defecto
  attribution: string; // solo para testimonios (autor + programa)
};

export type StoryMakerInput = {
  script: string;               // guion libre del usuario
  count: number;                // nº de slides a generar (1-10)
  brand: string;                // "FisioFit Team"
  niche: string;                // "atletas de CrossFit y Hyrox con dolor"
  tone: string;                 // "directo, sin humo, empático"
  terminologyRule: string;      // "nunca 'cliente', siempre 'atleta'"
};

export type StoryMakerOutput = {
  slides: Slide[];
};

// ─── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(input: StoryMakerInput): string {
  const styleList = STORY_STYLES.map(
    (s) => `- \`${s.key}\` (${s.label}): ${s.promptHint}`,
  ).join("\n");

  return `Eres el editor de contenido de ${input.brand}. Nicho: ${input.niche}.
Tono: ${input.tone}.
${input.terminologyRule ? `Regla de terminología obligatoria: ${input.terminologyRule}.` : ""}

Tu tarea: convertir un guion en una serie de Instagram Stories (formato 9:16) ya maquetadas y distribuidas por estilo visual.

ESTILOS DISPONIBLES:
${styleList}

REGLAS ESTRICTAS:
1. Alterna estilos para que la serie tenga variedad visual — no uses el mismo estilo en 2 slides seguidos salvo que el contenido lo pida.
2. La primera slide SIEMPRE es un HOOK potente (usa "marca-base" o "flashcard").
3. La última slide SIEMPRE tiene un CTA claro (usa "marca-base" o "flashcard").
4. Testimonios reales → estilo "luxury" con la cita en \`title\` y autoría en \`attribution\`.
5. Datos/cifras → estilo "bento" con el número en \`title\` y el contexto en \`subtitle\`.
6. Lecciones largas → estilo "magazine" con título en \`title\` y explicación en \`body\`.
7. Consejos cortos / hooks → estilo "flashcard" con el mensaje único en \`title\`.

FORMATOS DE TEXTO:
- \`title\`: 3-10 palabras. Sin punto final. Sin emojis (salvo en flashcard, máx 1).
- \`subtitle\`: 5-15 palabras. Contextualiza el título. Puede quedar vacío si el estilo no lo necesita.
- \`body\`: 20-60 palabras. Solo para "magazine". Vacío en el resto.
- \`cta\`: solo en la última slide y en las de conversión. Ejemplos: "Desliza", "Guarda esto", "Reserva tu plaza".
- \`attribution\`: solo en "luxury" para testimonios. Formato: "Nombre · Programa · Meses".

SALIDA:
Devuelve SOLO JSON válido (sin markdown, sin explicaciones), con esta forma exacta:
{
  "slides": [
    { "styleKey": "marca-base", "title": "…", "subtitle": "…", "body": "", "cta": "", "bgUrl": "", "attribution": "" },
    …
  ]
}

Nº de slides: EXACTAMENTE ${input.count}. Si el guion da para menos, condensa; si da para más, resume.`;
}

// ─── Función principal ─────────────────────────────────────────────────────

export async function generateStorySlides(input: StoryMakerInput): Promise<StoryMakerOutput> {
  const system = buildSystemPrompt(input);
  const userMsg = `Guion del CEO:\n"""\n${input.script.trim()}\n"""\n\nGenera ${input.count} slides.`;

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Aislar el JSON: la IA a veces envuelve con ```json … ``` pese al system.
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("La respuesta de Claude no contiene JSON parseable.");
  }
  const parsed = JSON.parse(jsonMatch[0]) as StoryMakerOutput;

  if (!Array.isArray(parsed.slides)) {
    throw new Error("La respuesta no tiene el campo `slides` esperado.");
  }
  // Normalizamos por si algún campo viene undefined.
  parsed.slides = parsed.slides.map((s) => ({
    styleKey: (STORY_STYLES.some((sty) => sty.key === s.styleKey) ? s.styleKey : "marca-base") as StoryStyleKey,
    title: (s.title ?? "").toString(),
    subtitle: (s.subtitle ?? "").toString(),
    body: (s.body ?? "").toString(),
    cta: (s.cta ?? "").toString(),
    bgUrl: (s.bgUrl ?? "").toString(),
    attribution: (s.attribution ?? "").toString(),
  }));
  return parsed;
}
