/**
 * Story Maker · IA con Claude.
 *
 * Dada una plantilla (con sus aiSlots) y un prompt del CEO, generamos
 * el contenido de N slides. Cada slide es una copia de los slides
 * base de la plantilla con los textos de los aiSlots rellenos por Claude.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AiSlot, Slide, StoryTemplate, TextElement } from "./types";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 4000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en Vercel.");
  _client = new Anthropic({ apiKey });
  return _client;
}

export type GenerateInput = {
  template: StoryTemplate;
  prompt: string;
  count: number;         // nº de slides a producir
};

export type GeneratedSlide = {
  fills: Record<string, string>; // elementId -> nuevo contenido
};

const SYSTEM_BRAND = `Eres el editor de contenido de FisioFit Team.
Nicho: atletas de CrossFit y Hyrox con dolor que quieren volver a entrenar sin miedo.
Tono: directo, sin humo, empático. Habla de tú. Sin promesas mágicas.
Regla estricta: nunca uses "cliente" o "paciente" — siempre "atleta".`;

function slotsPrompt(slots: AiSlot[]): string {
  return slots
    .map(
      (s, i) =>
        `  ${i + 1}. slideIdx=${s.slideIdx}, elementId="${s.elementId}" — ${s.hint}${s.maxWords ? ` (máx ${s.maxWords} palabras)` : ""}`,
    )
    .join("\n");
}

export async function generateStoryContent(input: GenerateInput): Promise<GeneratedSlide[]> {
  const { template, prompt, count } = input;

  const system = `${SYSTEM_BRAND}

Vas a rellenar los textos de una serie de Instagram Stories (formato 9:16). La plantilla usa la estructura "${template.name}": ${template.description}.

Genera EXACTAMENTE ${count} slides. Cada slide debe rellenar los siguientes huecos:
${slotsPrompt(template.aiSlots)}

RESPUESTA: JSON válido con esta forma exacta (sin markdown, sin fences, sin explicaciones):
{
  "slides": [
    { "fills": { "elementId1": "texto1", "elementId2": "texto2", ... } },
    ...
  ]
}

Nº exacto de slides: ${count}. Cada elemento con el id que aparece en la lista. Sin campos extra.`;

  const userMsg = `IDEA DEL EDITOR:
${prompt.trim()}

Genera ${count} slides siguiendo esa idea. Respeta el número de palabras de cada hueco.`;

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
  const parsed = JSON.parse(jsonMatch[0]) as { slides?: GeneratedSlide[] };

  if (!Array.isArray(parsed.slides)) throw new Error("Respuesta sin campo `slides`.");
  return parsed.slides.map((s) => ({
    fills: s.fills && typeof s.fills === "object" ? s.fills : {},
  }));
}

/**
 * Aplica los fills generados al slide base de la plantilla, produciendo
 * un slide nuevo listo para insertar. Reusamos el primer slide de la
 * plantilla como base porque las plantillas iniciales solo tienen 1.
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
