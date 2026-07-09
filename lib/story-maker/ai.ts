/**
 * Story Maker · IA con Claude.
 *
 * La IA recibe la biblioteca de plantillas disponibles y, para cada slide
 * que genera, ELIGE QUÉ PLANTILLA USAR además de rellenar sus huecos.
 * Así puedes escribir "5 stories sobre dolor de hombro con cta final" y
 * el carrusel salga con Portada + Cita + Lista + Lista + Portada
 * automáticamente — sin tener que decírselo.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AiSlot, Slide, StoryTemplate, TextElement } from "./types";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 6000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en Vercel.");
  _client = new Anthropic({ apiKey });
  return _client;
}

export type GenerateInput = {
  templates: StoryTemplate[]; // Todas las plantillas disponibles (con aiSlots)
  prompt: string;
  count: number;
};

export type GeneratedSlide = {
  templateKey: string;                 // qué plantilla usó
  fills: Record<string, string>;       // elementId -> nuevo contenido
};

const SYSTEM_BRAND = `Eres el editor de contenido de FisioFit Team.
Nicho: atletas de CrossFit y Hyrox con dolor que quieren volver a entrenar sin miedo.
Tono: directo, sin humo, empático. Habla de tú. Sin promesas mágicas.
Regla estricta: nunca uses "cliente" o "paciente" — siempre "atleta".`;

function slotsPrompt(slots: AiSlot[]): string {
  if (!slots?.length) return "  (sin huecos definidos)";
  return slots
    .map(
      (s, i) =>
        `    ${i + 1}. elementId="${s.elementId}" — ${s.hint}${s.maxWords ? ` (máx ${s.maxWords} palabras)` : ""}`,
    )
    .join("\n");
}

function templateCatalog(templates: StoryTemplate[]): string {
  return templates
    .map(
      (t, i) =>
        `${i + 1}. templateKey="${t.key}" · ${t.name}
   Uso: ${t.description || "(sin descripción)"}
   Huecos:
${slotsPrompt(t.aiSlots ?? [])}`,
    )
    .join("\n\n");
}

export async function generateStoryContent(input: GenerateInput): Promise<GeneratedSlide[]> {
  const { templates, prompt, count } = input;
  if (!templates.length) throw new Error("Sin plantillas disponibles");

  const system = `${SYSTEM_BRAND}

Vas a diseñar un carrusel de ${count} Instagram Stories (formato 9:16). Tienes esta biblioteca de plantillas visuales — cada una tiene un uso concreto y unos huecos donde metes texto:

${templateCatalog(templates)}

TU TRABAJO:
1. Decide qué plantilla usar en CADA slide. Puedes repetir plantillas.
2. Elige plantillas variadas si aporta ritmo narrativo (arranque con impacto, contenido con estructura, cierre con CTA).
3. Rellena los huecos de cada plantilla elegida con contenido concreto y tuyo (no genérico).
4. Respeta los límites de palabras de cada hueco.

RESPUESTA: JSON válido con esta forma exacta (sin markdown, sin fences, sin explicaciones):
{
  "slides": [
    { "templateKey": "clave-plantilla", "fills": { "elementId1": "texto1", "elementId2": "texto2" } },
    ...
  ]
}

Nº exacto de slides: ${count}. templateKey debe ser una de las claves de la biblioteca. Cada fill usa el elementId exacto de esa plantilla. Sin campos extra.`;

  const userMsg = `IDEA DEL EDITOR:
${prompt.trim()}

Diseña ${count} slides siguiendo esa idea, eligiendo la mejor plantilla para cada uno.`;

  const res = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("La respuesta de Claude no contiene JSON parseable.");
  const parsed = JSON.parse(jsonMatch[0]) as { slides?: Array<{ templateKey?: string; fills?: Record<string, string> }> };

  if (!Array.isArray(parsed.slides)) throw new Error("Respuesta sin campo `slides`.");

  const validKeys = new Set(templates.map((t) => t.key));
  return parsed.slides.map((s) => {
    const key = typeof s.templateKey === "string" && validKeys.has(s.templateKey)
      ? s.templateKey
      : templates[0].key; // fallback si Claude devuelve una key desconocida
    return {
      templateKey: key,
      fills: s.fills && typeof s.fills === "object" ? s.fills : {},
    };
  });
}

/**
 * Aplica los fills al slide base de una plantilla concreta. El caller
 * debe resolver la plantilla por su key y pasar la que corresponde a
 * cada slide generado.
 */
export function materializeSlide(template: StoryTemplate, fills: Record<string, string>): Slide {
  const base = template.slides[0];
  return {
    ...base,
    elements: base.elements.map((el) => {
      if (el.type === "text" && fills[el.id]) {
        return { ...el, content: fills[el.id] } as TextElement;
      }
      return el;
    }),
  };
}
