/**
 * Generación de guiones de contenido con Claude Opus 4.7.
 *
 * Solo se importa desde el server (lee process.env y llama a la API).
 *
 * Diseño:
 *  - Construimos un system prompt con el brief estable (quién eres, tono, etc.).
 *  - Inyectamos contexto dinámico (semana, pieza, plantilla, piezas top) en el
 *    mensaje del usuario.
 *  - Le pedimos JSON estructurado de vuelta para poder aplicarlo directo a la
 *    pieza sin parsear texto libre.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-7";
const MAX_OUTPUT_TOKENS = 4000;

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

// ─── Tipos de entrada/salida ────────────────────────────────────────────────

export type AiBrief = {
  brand: string;
  voiceTone: string;
  dos: string;
  donts: string;
  structureHints: string;
  goodExamples: string;
  badExamples: string;
};

export type WeekContext = {
  centralTheme: string;
  bodyZone: string;
  weekType: string;
  limitingBeliefs: string[];
  leadMagnetName: string | null;
  leadMagnetKeyword: string | null;
  commercialTrigger: string | null;
};

export type PieceContext = {
  format: string;          // "reel" | "carousel" | ...
  goal: string;
  goals: string[];
  ctaType: string;
  dayOfWeek: number;       // 1..7
  title: string | null;
  dmKeyword: string | null;
};

export type TemplateContext = {
  name: string;
  format: string;
  blocks: { id: string; label: string; order: number }[];
};

export type TopPiece = {
  format: string;
  hook: string;
  blocks: { label: string; content: string }[];
  caption: string | null;
  score: number;           // métrica compuesta interna (no se envía)
};

export type GenerateInput = {
  brief: AiBrief;
  week: WeekContext;
  piece: PieceContext;
  template?: TemplateContext | null;
  /** Instrucciones específicas para esta pieza (obligatorias). Reemplazan al
   *  hook como guía principal. Cuentan qué quiere el CEO que la pieza diga,
   *  qué ángulo, qué mensaje, etc. */
  instructions: string;
  /** Hook proporcionado. Opcional. Si viene, la IA DEBE usarlo textual en la
   *  primera línea del guion. Si no viene, la IA propone uno. */
  hook?: string;
  freeNote?: string;       // "hazlo más corto", "más directo"...
  topPieces: TopPiece[];
  /** Modo iteración: versión anterior del guion que el CEO quiere ajustar.
   *  Si está presente, la IA NO reescribe desde cero — mantiene lo bueno
   *  y aplica solo el iterationInstruction. */
  previousResult?: GenerateOutput;
  /** Instrucción de ajuste que el CEO pide sobre previousResult.
   *  Ej: "hazlo más corto", "menos académico", "cambia el cierre por un
   *  CTA más directo a DM". */
  iterationInstruction?: string;
};

export type GeneratedBlock = {
  /** Etiqueta del bloque tal y como aparece en la pieza/plantilla. */
  label: string;
  /** Contenido en texto plano. Mantenemos saltos de línea. */
  content: string;
};

export type GenerateOutput = {
  blocks: GeneratedBlock[];
  caption: string;
  /** Hasta 3 alternativas más fuertes al hook proporcionado. */
  hookVariations: string[];
};

// ─── Construcción del prompt ────────────────────────────────────────────────

function buildSystemPrompt(brief: AiBrief, topPieces: TopPiece[]): string {
  const parts: string[] = [];

  parts.push(
    "Eres el copy & content strategist interno de FisioFit Team, un servicio español de fisioterapia online especializado en readaptación deportiva para atletas CrossFit. Tu trabajo es escribir guiones de Reels, Carruseles e Infografías que el equipo publicará en Instagram."
  );
  parts.push("");
  parts.push("Te van a pasar contexto de la marca, de la semana de contenido y de la pieza concreta. Tu único trabajo es escribir el guion respetando ESCRUPULOSAMENTE la voz, las reglas y la estructura indicadas.");

  parts.push("");
  parts.push("═══ MARCA ═══");
  parts.push(brief.brand.trim() || "(sin definir)");

  parts.push("");
  parts.push("═══ TONO Y VOZ ═══");
  parts.push(brief.voiceTone.trim() || "(sin definir)");

  parts.push("");
  parts.push("═══ QUÉ SÍ HAGO SIEMPRE ═══");
  parts.push(brief.dos.trim() || "(sin definir)");

  parts.push("");
  parts.push("═══ QUÉ NO HAGO JAMÁS ═══");
  parts.push(brief.donts.trim() || "(sin definir)");

  if (brief.structureHints.trim()) {
    parts.push("");
    parts.push("═══ ESTRUCTURAS Y PATRONES HABITUALES ═══");
    parts.push(brief.structureHints.trim());
  }

  if (brief.goodExamples.trim()) {
    parts.push("");
    parts.push("═══ EJEMPLOS DE GUIONES QUE CLAVÉ (replica este nivel) ═══");
    parts.push(brief.goodExamples.trim());
  }

  if (brief.badExamples.trim()) {
    parts.push("");
    parts.push("═══ EJEMPLOS DE LO QUE NO QUIERO (evítalo) ═══");
    parts.push(brief.badExamples.trim());
  }

  if (topPieces.length > 0) {
    parts.push("");
    parts.push("═══ PIEZAS PUBLICADAS RECIENTEMENTE CON MEJORES MÉTRICAS ═══");
    parts.push("Estas son piezas reales del CEO que han funcionado mejor. Aprende su ritmo, longitud, estructura y voz. NO copies literal, sí captura el patrón.");
    topPieces.forEach((p, i) => {
      parts.push("");
      parts.push(`--- Pieza ${i + 1} · ${p.format} ---`);
      parts.push(`Hook: ${p.hook}`);
      p.blocks.forEach((b) => {
        if (b.content.trim()) {
          parts.push(`[${b.label}] ${b.content.trim()}`);
        }
      });
      if (p.caption) parts.push(`Caption: ${p.caption.trim()}`);
    });
  }

  parts.push("");
  parts.push("═══ FORMATO DE RESPUESTA OBLIGATORIO ═══");
  parts.push("Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, sin ```. La estructura exacta es:");
  parts.push(`{
  "blocks": [
    { "label": "<etiqueta exacta del bloque>", "content": "<contenido del bloque, texto plano con saltos de línea reales \\n donde corresponda>" }
  ],
  "caption": "<caption final para Instagram, incluyendo hashtags si procede y el CTA hacia DM/landing>",
  "hookVariations": ["<hook alternativo más fuerte 1>", "<hook alternativo más fuerte 2>", "<hook alternativo más fuerte 3>"]
}`);
  parts.push("");
  parts.push("Las etiquetas en blocks DEBEN coincidir literalmente con las que te paso en el contexto. Si la plantilla tiene 4 bloques, devuelves 4 blocks en ese orden.");

  return parts.join("\n");
}

function buildUserPrompt(input: GenerateInput): string {
  const parts: string[] = [];
  parts.push("CONTEXTO DE LA SEMANA");
  parts.push(`- Tema central: ${input.week.centralTheme}`);
  parts.push(`- Zona corporal: ${input.week.bodyZone}`);
  parts.push(`- Tipo de semana: ${input.week.weekType}`);
  if (input.week.limitingBeliefs.length > 0) {
    parts.push(`- Creencias limitantes a desmontar: ${input.week.limitingBeliefs.join(" / ")}`);
  }
  if (input.week.leadMagnetName) {
    parts.push(`- Lead magnet activo: "${input.week.leadMagnetName}"${input.week.leadMagnetKeyword ? ` (palabra clave DM: ${input.week.leadMagnetKeyword})` : ""}`);
  }
  if (input.week.commercialTrigger) {
    parts.push(`- Disparador comercial: ${input.week.commercialTrigger}`);
  }

  parts.push("");
  parts.push("CONTEXTO DE LA PIEZA");
  parts.push(`- Formato: ${input.piece.format}`);
  parts.push(`- Día de la semana: ${dayName(input.piece.dayOfWeek)}`);
  parts.push(`- Objetivo principal: ${input.piece.goal}`);
  if (input.piece.goals.length > 0) parts.push(`- Objetivos secundarios: ${input.piece.goals.join(", ")}`);
  parts.push(`- Tipo de CTA: ${input.piece.ctaType}`);
  if (input.piece.dmKeyword) parts.push(`- Palabra clave DM esperada: ${input.piece.dmKeyword}`);

  if (input.template) {
    parts.push("");
    parts.push(`ESTRUCTURA OBLIGATORIA (plantilla "${input.template.name}")`);
    parts.push("Estos son los bloques del guion. Genera contenido para CADA uno respetando su nombre exacto:");
    input.template.blocks
      .sort((a, b) => a.order - b.order)
      .forEach((b, i) => parts.push(`  ${i + 1}. [${b.label}]`));
  } else {
    parts.push("");
    parts.push("Sin plantilla específica: usa la estructura típica del formato y devuelve los bloques con etiquetas razonables (\"Apertura\", \"Desarrollo\", \"Cierre\", \"CTA\", etc.).");
  }

  parts.push("");
  parts.push("INSTRUCCIONES PARA ESTA PIEZA (lo más importante — guía principal del guion)");
  parts.push(input.instructions.trim());

  const hook = input.hook?.trim();
  if (hook) {
    parts.push("");
    parts.push("HOOK FIJADO POR EL CEO — REGLAS NEGOCIABLES");
    parts.push(`Texto literal del hook: "${hook}"`);
    parts.push("");
    parts.push("REGLAS ESTRICTAS SOBRE EL HOOK:");
    parts.push(`1. La VOZ / lo que se dice a cámara en el primer bloque del guion DEBE EMPEZAR EXACTAMENTE con esta frase, palabra por palabra, sin reformular, sin parafrasear, sin cambiar puntuación, sin añadir ni quitar palabras.`);
    parts.push(`2. No la sustituyas por una variación "que suene mejor". Aunque tengas una mejor, NO la uses en el guion principal.`);
    parts.push(`3. Si el primer bloque incluye anotaciones tipo "Texto en pantalla:", "Voz:", "Cámara:", esas son OK — PERO el contenido del "Voz:" (o lo que se dice a cámara) tiene que empezar literalmente con: "${hook}". Después puedes continuar libremente.`);
    parts.push(`4. Si el bloque NO usa esa nomenclatura de "Voz:", entonces la PRIMERA línea del content de ese bloque debe ser literalmente: "${hook}".`);
    parts.push(`5. En hookVariations propón 3 alternativas distintas POR SI el CEO quiere probar otras, pero el guion principal usa el suyo tal cual.`);
  } else {
    parts.push("");
    parts.push("Sin hook fijado — propón uno tú. En hookVariations devuelve 3 alternativas adicionales (puedes incluir el que uses en el guion principal como una de ellas o totalmente distintas).");
  }

  if (input.freeNote?.trim()) {
    parts.push("");
    parts.push("NOTA / AJUSTE DE TONO PEDIDO POR EL CEO");
    parts.push(input.freeNote.trim());
  }

  // ─── Modo iteración: tenemos una versión previa que ajustar ───
  if (input.previousResult) {
    parts.push("");
    parts.push("═══ MODO ITERACIÓN ═══");
    parts.push("Esta NO es la primera generación. El CEO ya recibió una versión anterior y pide ajustar a partir de ella. NO reescribas el guion desde cero — manténle la idea, la estructura y lo que funcionó. Solo aplica los ajustes pedidos abajo.");
    parts.push("");
    parts.push("VERSIÓN ANTERIOR DEL GUION (mantén lo bueno, ajusta lo necesario):");
    parts.push(JSON.stringify({
      blocks: input.previousResult.blocks,
      caption: input.previousResult.caption,
      hookVariations: input.previousResult.hookVariations,
    }, null, 2));
    parts.push("");
    parts.push("AJUSTE PEDIDO POR EL CEO SOBRE ESA VERSIÓN ANTERIOR:");
    parts.push(`"${input.iterationInstruction?.trim() || "(sin ajuste específico, refina lo que puedas)"}"`);
    parts.push("");
    parts.push("Si el ajuste pedido NO afecta a una sección concreta, déjala IDÉNTICA. Solo cambia lo necesario para cumplir el ajuste.");
  }

  parts.push("");
  parts.push("Genera ahora el guion completo en el JSON especificado.");

  return parts.join("\n");
}

function dayName(dow: number): string {
  return ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][dow] || `Día ${dow}`;
}

// ─── Llamada al modelo + parseo ─────────────────────────────────────────────

export async function generateScriptWithAI(input: GenerateInput): Promise<GenerateOutput> {
  const system = buildSystemPrompt(input.brief, input.topPieces);
  const user = buildUserPrompt(input);

  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
  });

  // Concatenar bloques de texto de la respuesta
  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  // El modelo a veces envuelve en ```json ... ``` aunque se le pida no hacerlo.
  // Limpiamos y aceptamos esa variante.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `La IA no devolvió JSON válido. Esto pasa muy raro pero ha pasado. Inténtalo de nuevo. Detalle: ${(e as Error).message}`
    );
  }

  return normalizeOutput(parsed);
}

function normalizeOutput(raw: unknown): GenerateOutput {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawBlocks = Array.isArray(o.blocks) ? o.blocks : [];
  const blocks: GeneratedBlock[] = [];
  for (const b of rawBlocks as any[]) {
    if (!b || typeof b !== "object") continue;
    const label = typeof b.label === "string" ? b.label : "";
    const content = typeof b.content === "string" ? b.content : "";
    if (!label.trim() && !content.trim()) continue;
    blocks.push({ label: label.trim(), content });
  }
  const caption = typeof o.caption === "string" ? o.caption : "";
  const hookVariations = Array.isArray(o.hookVariations)
    ? (o.hookVariations as any[]).filter((x) => typeof x === "string" && x.trim()).slice(0, 3)
    : [];
  return { blocks, caption, hookVariations };
}
