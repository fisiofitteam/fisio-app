/**
 * Carrusel Maker · Generador con IA (Claude Opus 4.7).
 *
 * Filosofía anti-IA:
 *   1. Reglas duras en el system prompt: lista negra de frases-tópico,
 *      estructuras prohibidas, obligación de sonar directo y humano.
 *   2. Few-shot con carruseles REALES publicados por el equipo. Elegimos
 *      los N más parecidos al brief por match de palabras (versión simple
 *      keyword-scoring — cuando la biblioteca crezca migramos a embeddings).
 *   3. La IA decide número de slides y estructura según lo que le pide el
 *      brief. No forzamos hook + 5 desarrollo + CTA como plantilla rígida.
 *
 * Output: JSON con `slides` (array), `caption` (pie del post), `title`
 * (nombre corto para el listado de drafts).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { CarouselSlide } from "./types";
import { parseSlides } from "./types";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 8000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada.");
  _client = new Anthropic({ apiKey });
  return _client;
}

// ────────────────────────────────────────────────────────────────────────────
// PROMPT — reglas duras para que no suene a IA
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres el copywriter de FisioFit Cross, una marca de fisioterapia especializada en atletas de CrossFit y Hyrox con dolor que quieren volver a entrenar sin miedo.

Tu trabajo: escribir carruseles de Instagram que suenen escritos por Ales Faus (fundador y fisio), NUNCA por una IA. Los carruseles se leen slide a slide y compiten con reels de 15 segundos, así que cada slide tiene que tener gancho propio.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TONO Y VOZ (obligatorio)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Habla de TÚ al lector. Siempre. Nunca "usted", nunca "vosotros".
- Frases cortas. Punto y aparte. Casi verso libre.
- La palabra "atleta" es preferible a "paciente" o "cliente".
- Directo. Nada de humo, adornos ni promesas mágicas.
- Empatía SIN condescendencia: reconoce el dolor y la frustración, pero desde el respeto — el lector no es débil, es alguien que quiere entrenar.
- Contrasta lo que el atleta HACE mal con lo que debería hacer, sin regañar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRASES Y ESTRUCTURAS PROHIBIDAS (lista negra)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NO uses NUNCA estas frases o variantes:
- "sabías que..."
- "imagina que..."
- "no te lo pierdas"
- "en el mundo del fitness"
- "en el mundo del crosstraining"
- "descubre" / "descubrirás"
- "impresionante" / "sorprendente" / "increíble"
- "sin duda" / "sin lugar a dudas"
- "cabe destacar" / "es importante mencionar"
- "en definitiva" / "en resumen" / "por último pero no menos importante"
- "a su vez" / "por otro lado" (como muletillas de transición)
- "revoluciona" / "transforma" / "cambia tu vida"
- "hoy te traigo" / "en el post de hoy"
- CTAs manidas: "dale like", "sígueme para más", "comparte con tus amigos"

NO abras el carrusel con una pregunta retórica del tipo "¿Sabías que el 80% de los atletas...?".

NO uses exclamaciones seguidas (¡¡así!!).

NO uses hashtags dentro de los slides. Sí puedes ponerlos al final del CAPTION.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMOJIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Permitidos, con moderación: ❌ ✅ 👉 💬 🎯 💥 ↗️ 🟡 🔹 ✔️ 💪 📌 🚨
Reglas:
- Máximo 1-2 por slide.
- SIEMPRE al principio o al final de un párrafo, nunca en mitad de una frase.
- El emoji ❌ es tu comodín para marcar errores en carruseles de tipo "errores".
- NO uses emojis "sonrientes" (😀 😊 😄 etc.) — no encajan.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUCTURA DEL CARRUSEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Decide TÚ el número de slides según el brief (rango típico: 6-10).
Todos los carruseles llevan:
- Slide 1: HOOK potente. Idealmente un titular corto y provocador o un statement que pare el scroll.
- Slide N-1 (penúltimo): remate del mensaje / cierre empoderador.
- Slide N (último): CTA. Suele pedir un comentario con una palabra clave en mayúsculas (p.ej. "escríbeme HOMBRO") o algún gesto concreto (guardar, compartir).

Entre medio, desarrolla el argumento según el tipo de carrusel:
- Errores enumerados: 5-7 errores marcados con ❌, cada uno con 3-6 líneas cortas.
- Caso clínico: antes → puente → después (típico 7 slides).
- Educativo con marco mental: problema → nuevo marco → aplicación práctica.
- Mito vs realidad: contraponer creencia común con lo que dice la evidencia/experiencia.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAMPOS POR SLIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cada slide DEBE ser un objeto JSON con:
- \`n\`: número (1-based)
- \`title\`: el titular gigante que ocupa el visual. Corto y potente. All caps NO — el diseñador lo pondrá en mayúsculas si aplica.
- \`subtitle\` (opcional): línea inmediatamente debajo del título, más pequeña. Aclara o matiza el titular.
- \`body\` (opcional): desarrollo del slide. Texto libre, respeta saltos de línea. Aquí es donde vive el argumento.
- \`note\` (opcional): pista para el diseñador sobre el visual (foto sugerida, icono, etc). NO es parte del contenido visible.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CAPTION (pie del post)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Escribe el CAPTION que va como descripción en Instagram. Longitud típica: 500-1500 caracteres. Estructura:
1. Frase-gancho que refuerce el hook del slide 1.
2. Desarrollo con la idea principal.
3. CTA con la palabra clave en mayúsculas si el CTA del último slide la lleva.
4. NO añadas hashtags automáticamente (los pone Ales a mano).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Devuelve EXCLUSIVAMENTE un JSON válido con este schema:

{
  "title": "etiqueta corta descriptiva para el listado interno",
  "slides": [ { "n": 1, "title": "...", "subtitle": "...", "body": "...", "note": "..." }, ... ],
  "caption": "..."
}

Sin texto adicional. Sin \\\`\\\`\\\`json. Solo el JSON.`;

// ────────────────────────────────────────────────────────────────────────────
// Retrieval simple por keyword scoring
// ────────────────────────────────────────────────────────────────────────────
const STOPWORDS = new Set([
  "a", "al", "algo", "algún", "alguna", "algunas", "alguno", "algunos",
  "ante", "antes", "aquí", "así", "aún", "cada", "cómo", "como", "con",
  "cuando", "de", "del", "desde", "donde", "durante", "e", "el", "él",
  "ella", "ellas", "ellos", "en", "entre", "era", "eres", "es", "esa",
  "esas", "ese", "eso", "esos", "esta", "está", "están", "estar", "estas",
  "este", "esto", "estos", "eu", "fue", "fueron", "ha", "hacer", "hacia",
  "han", "hasta", "hay", "la", "las", "le", "les", "lo", "los", "más",
  "me", "mi", "mis", "mucho", "muy", "nada", "ni", "no", "nos", "nosotros",
  "o", "os", "otra", "otras", "otro", "otros", "para", "pero", "por",
  "porque", "que", "qué", "quien", "quién", "se", "sí", "sin", "sobre",
  "son", "soy", "su", "sus", "también", "te", "ti", "tiene", "tienen",
  "todo", "todos", "tu", "tus", "un", "una", "unas", "uno", "unos", "y",
  "ya", "yo",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export type LibraryEntry = {
  id: string;
  topic: string;
  category: string | null;
  slidesJson: string;
  captionText: string | null;
};

function scoreEntry(entry: LibraryEntry, briefTokens: Set<string>): number {
  const text = [
    entry.topic,
    entry.category ?? "",
    entry.slidesJson,
    entry.captionText ?? "",
  ].join(" ");
  const tokens = tokenize(text);
  let hits = 0;
  const seen = new Set<string>();
  for (const t of tokens) {
    if (briefTokens.has(t) && !seen.has(t)) {
      hits++;
      seen.add(t);
    }
  }
  return hits;
}

/**
 * Elige los N carruseles más parecidos al brief como few-shot. Estrategia:
 *   - Si hay ≤ maxAll (default 5), usa todos.
 *   - Si hay más, usa top-3 por keyword-match + 1 aleatorio para no cerrarse.
 */
export function pickFewShot(entries: LibraryEntry[], brief: string, opts?: { topN?: number; maxAll?: number }): LibraryEntry[] {
  const topN = opts?.topN ?? 3;
  const maxAll = opts?.maxAll ?? 5;
  if (entries.length <= maxAll) return entries;
  const briefTokens = new Set(tokenize(brief));
  const scored = entries.map((e) => ({ e, s: scoreEntry(e, briefTokens) }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, topN).map((x) => x.e);
  const remaining = scored.slice(topN).map((x) => x.e);
  if (remaining.length > 0) {
    top.push(remaining[Math.floor(Math.random() * remaining.length)]);
  }
  return top;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt utilities
// ────────────────────────────────────────────────────────────────────────────
function formatEntryForPrompt(entry: LibraryEntry, i: number): string {
  const slides = parseSlides(entry.slidesJson);
  const lines: string[] = [];
  lines.push(`===== EJEMPLO ${i + 1} — tema: "${entry.topic}"${entry.category ? ` (${entry.category})` : ""} =====`);
  for (const s of slides) {
    lines.push(`Slide ${s.n}`);
    if (s.title) lines.push(`Titular: ${s.title}`);
    if (s.subtitle) lines.push(`Subtítulo: ${s.subtitle}`);
    if (s.body) lines.push(`Cuerpo: ${s.body}`);
    if (s.note) lines.push(`Visual sugerida: ${s.note}`);
    lines.push("");
  }
  if (entry.captionText) {
    lines.push("CAPTION:");
    lines.push(entry.captionText);
  }
  return lines.join("\n");
}

function buildUserPrompt(input: GenerateCarouselInput, examples: LibraryEntry[]): string {
  const parts: string[] = [];

  if (examples.length > 0) {
    parts.push("REFERENCIAS de mis carruseles publicados anteriormente. Estúdialos y copia SU TONO Y RITMO — no su contenido literal. Nadie debe notar que este carrusel lo escribió una IA:\n");
    parts.push(examples.map((e, i) => formatEntryForPrompt(e, i)).join("\n\n"));
    parts.push("\n\n" + "━".repeat(50) + "\n");
  }

  parts.push("BRIEF DEL CARRUSEL A ESCRIBIR:\n");
  parts.push(input.brief.trim());

  if (input.category) {
    parts.push(`\n\nEstructura sugerida: ${input.category}`);
  }
  if (input.targetSlides) {
    parts.push(`\n\nNúmero orientativo de slides: ${input.targetSlides} (puedes desviarte si el brief lo pide).`);
  }

  parts.push("\n\nDevuelve el JSON tal como te lo he especificado. Sin markdown, sin ```json.");
  return parts.join("");
}

// ────────────────────────────────────────────────────────────────────────────
// Generación
// ────────────────────────────────────────────────────────────────────────────
export type GenerateCarouselInput = {
  brief: string;
  category?: string | null;
  targetSlides?: number | null;
};

export type GeneratedCarousel = {
  title: string;
  slides: CarouselSlide[];
  caption: string | null;
};

function normalizeSlides(raw: unknown): CarouselSlide[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any, i: number): CarouselSlide => ({
      n: typeof s?.n === "number" ? s.n : i + 1,
      title: typeof s?.title === "string" && s.title.trim() ? s.title.trim() : undefined,
      subtitle: typeof s?.subtitle === "string" && s.subtitle.trim() ? s.subtitle.trim() : undefined,
      body: typeof s?.body === "string" && s.body.trim() ? s.body.trim() : undefined,
      note: typeof s?.note === "string" && s.note.trim() ? s.note.trim() : undefined,
    }))
    .sort((a, b) => a.n - b.n);
}

export async function generateCarousel(
  input: GenerateCarouselInput,
  library: LibraryEntry[],
): Promise<GeneratedCarousel> {
  const examples = pickFewShot(library, input.brief);
  const userPrompt = buildUserPrompt(input, examples);

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = msg.content.find((c) => c.type === "text");
  const text = textBlock?.type === "text" ? textBlock.text : "";
  if (!text) throw new Error("Respuesta vacía de la IA.");

  // Sonnet a veces mete el JSON entre ```json ... ```; lo limpiamos por si acaso.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`La IA devolvió algo que no es JSON válido: ${cleaned.slice(0, 200)}…`);
  }

  const slides = normalizeSlides(parsed?.slides);
  if (slides.length === 0) throw new Error("La IA no devolvió ningún slide válido.");

  return {
    title: typeof parsed?.title === "string" && parsed.title.trim()
      ? parsed.title.trim()
      : input.brief.slice(0, 60),
    slides,
    caption: typeof parsed?.caption === "string" && parsed.caption.trim() ? parsed.caption.trim() : null,
  };
}
