/**
 * Story Maker · IA con Claude Opus 4.7.
 *
 * Claude diseña Y escribe cada slide desde 0: posiciones, tipografías,
 * tamaños, colores, contenido. No hay concepto de "plantilla + huecos" —
 * cada slide es un JSON completo de Slide que el frontend inserta tal cual.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Slide, SlideElement } from "./types";

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 8000;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada en Vercel.");
  _client = new Anthropic({ apiKey });
  return _client;
}

export type GenerateInput = {
  prompt: string;
  count: number;
};

const SYSTEM_BRAND = `Eres el editor y DISEÑADOR de contenido de FisioFit Team.
Nicho: atletas de CrossFit y Hyrox con dolor que quieren volver a entrenar sin miedo.
Tono: directo, sin humo, empático. Habla de tú. Sin promesas mágicas.
Regla estricta: nunca uses "cliente" o "paciente" — siempre "atleta".`;

const DESIGN_GUIDE = `Formato: Instagram Stories 9:16 sobre canvas 1080×1920. Todas las posiciones en % (0-100). Coordenadas x/y son el CENTRO del elemento.

SCHEMA JSON de cada slide:
{
  "bgColor": "#0A0A0A",                   // color de fondo (hex)
  "bgGradient": "none" | "top-dark" | "bottom-dark" | "both-dark" | "top-bright" | "bottom-bright" | "center-bright",
  "elements": [
    {
      "type": "text",
      "x": 50, "y": 50,                   // % (centro del elemento)
      "width": 80,                        // ancho de la caja de texto en %
      "content": "TEXTO REAL",
      "font": "Antonio" | "Futura" | "Manrope" | "Playfair Display" | "Cormorant Garamond" | "Archivo Black" | "Bebas Neue" | "Inter",
      "size": 130,                        // px sobre canvas 1080×1920
      "weight": 400 | 500 | 600 | 700 | 800 | 900,
      "italic": false,
      "color": "#FCD34D",
      "bgColor": "transparent" | "#hex",  // caja resalte alrededor del texto (opcional)
      "align": "center" | "left" | "right",
      "shadow": false,                    // true si hay foto de fondo compleja
      "uppercase": false,
      "letterSpacing": 0                  // em (0 a 0.2)
    },
    { "type": "line", "x": 50, "y": 70, "width": 20, "height": 4, "color": "#FCD34D" }
  ]
}

PALETA FisioFit (usa SIEMPRE estos colores):
- Fondo: "#0A0A0A" (negro)
- Amarillo hero: "#FCD34D"
- Naranja acento: "#F59E0B"
- Blanco texto: "#FAFAFA"
- Gris texto secundario: "#D4D4D4"

TIPOGRAFÍAS (elige la que encaja):
- "Antonio" → titulares gigantes en uppercase, tipografía IMPACT.
- "Bebas Neue" → alternativa a Antonio, más condensada.
- "Archivo Black" → titulares brutalistas, blocky.
- "Cormorant Garamond" → citas serif italic elegantes, testimonios.
- "Playfair Display" → titulares serif con clase editorial.
- "Manrope" → subtítulos, textos de apoyo, tags cortos, cuerpos.
- "Futura" → cuerpos geométricos.
- "Inter" → cuerpos neutros.

REGLAS DE DISEÑO (críticas):

0. MINIMALISMO ESTRICTO (regla principal, prevalece sobre todo lo demás):
   - MÁXIMO 2 elementos de tipo "text" por slide. Nunca 3 ni más.
   - Preferible 1 solo elemento por slide cuando sea posible (portadas, cierres, momentos de silencio visual).
   - PROHIBIDO combinar tag + hero + subtítulo. Elige DOS de esos, nunca los tres.
   - PROHIBIDO usar elementos "line" (líneas decorativas) salvo casos excepcionales.
   - PROHIBIDO comillas gigantes decorativas en citas — el italic ya destaca lo suficiente.
   - PROHIBIDO subtítulos que "explican" el hero — si el hero necesita explicación, reescribe el hero.
   - El espacio negativo es tu principal recurso de diseño. Menos siempre gana.

1. JERARQUÍA: cada slide tiene UN elemento hero (grande, impacto) + como MÁXIMO 1 elemento de apoyo (subtítulo O tag, no ambos).
2. TAMAÑOS de referencia sobre canvas 1080×1920:
   - Hero Antonio/Bebas uppercase: 120–200 px (2–4 palabras máx).
   - Título mediano Antonio: 70–100 px.
   - Cita Cormorant italic: 80–110 px.
   - Subtítulo Manrope: 36–48 px.
   - Tag/etiqueta Manrope uppercase con letterSpacing 0.15-0.2: 22–30 px.
   - Números gigantes (Antonio): 300–400 px.
3. CONTRASTE cromático: amarillo hero + blanco apoyo, o blanco hero + amarillo apoyo. Nunca dos amarillos igual de grandes.
4. RESPIRACIÓN: no pegues elementos a los bordes. y=8-12 arriba, y=88-92 abajo. Deja siempre grandes zonas vacías.
5. VARIEDAD por slide en un mismo carrusel (mantén la restricción de 2 elementos siempre):
   - Slide 1 = HOOK (hero enorme centrado, 1 elemento a poder ser).
   - Slides intermedios = contenido (número gigante + concepto corto, o cita italic sola, o titular + apoyo mínimo).
   - Slide final = CTA o pregunta abierta, idealmente 1 elemento.
6. Si usas caja de fondo en un texto (bgColor no transparent), pon un color fuerte (amarillo o naranja) y color de texto negro o blanco. Y entonces evita el segundo elemento.
7. Los "gradientes" solo si aportan: usa "bottom-dark" cuando quieres apoyar legibilidad de texto en la parte inferior.

EJEMPLOS DE COMPOSICIÓN (referencia — nota que TODOS tienen 1 o 2 elementos, nunca más):

Portada (1 solo elemento — máximo impacto):
{
  "bgColor": "#0A0A0A",
  "bgGradient": "none",
  "elements": [
    { "type": "text", "x": 50, "y": 50, "width": 85, "content": "NO ES EL PRESS", "font": "Antonio", "size": 200, "weight": 900, "color": "#FCD34D", "bgColor": "transparent", "align": "center", "shadow": false, "uppercase": true }
  ]
}

Portada con subtítulo (2 elementos, límite):
{
  "bgColor": "#0A0A0A",
  "bgGradient": "none",
  "elements": [
    { "type": "text", "x": 50, "y": 42, "width": 85, "content": "NO ES EL PRESS", "font": "Antonio", "size": 180, "weight": 900, "color": "#FCD34D", "bgColor": "transparent", "align": "center", "shadow": false, "uppercase": true },
    { "type": "text", "x": 50, "y": 58, "width": 80, "content": "Es que ni siquiera activas el manguito antes.", "font": "Manrope", "size": 42, "weight": 500, "color": "#FAFAFA", "bgColor": "transparent", "align": "center", "shadow": false }
  ]
}

Cita (2 elementos — cita + firma, sin comillas decorativas ni líneas):
{
  "bgColor": "#0A0A0A",
  "bgGradient": "none",
  "elements": [
    { "type": "text", "x": 50, "y": 45, "width": 82, "content": "Volví a hacer overhead squat sin miedo después de 8 meses parado.", "font": "Cormorant Garamond", "size": 96, "weight": 500, "italic": true, "color": "#FAFAFA", "bgColor": "transparent", "align": "center", "shadow": false },
    { "type": "text", "x": 50, "y": 78, "width": 70, "content": "PABLO · CROSSFIT SANTS", "font": "Manrope", "size": 28, "weight": 700, "color": "#FCD34D", "bgColor": "transparent", "align": "center", "shadow": false, "uppercase": true, "letterSpacing": 0.18 }
  ]
}

Número gigante + concepto (2 elementos):
{
  "bgColor": "#0A0A0A",
  "bgGradient": "none",
  "elements": [
    { "type": "text", "x": 50, "y": 38, "width": 90, "content": "1", "font": "Antonio", "size": 400, "weight": 900, "color": "#FCD34D", "bgColor": "transparent", "align": "center", "shadow": false },
    { "type": "text", "x": 50, "y": 72, "width": 78, "content": "FALTA DE MOVILIDAD TORÁCICA", "font": "Antonio", "size": 82, "weight": 900, "color": "#FAFAFA", "bgColor": "transparent", "align": "center", "shadow": false, "uppercase": true }
  ]
}

Pregunta CTA (1 elemento):
{
  "bgColor": "#0A0A0A",
  "bgGradient": "none",
  "elements": [
    { "type": "text", "x": 50, "y": 50, "width": 80, "content": "¿Y tú cuántos meses llevas evitándolo?", "font": "Cormorant Garamond", "size": 96, "weight": 500, "italic": true, "color": "#FCD34D", "bgColor": "transparent", "align": "center", "shadow": false }
  ]
}
`;

export async function generateStoryContent(input: GenerateInput): Promise<Slide[]> {
  const { prompt, count } = input;

  const system = `${SYSTEM_BRAND}

${DESIGN_GUIDE}

TU TRABAJO:
Diseña ${count} slides únicos que funcionen como un CARRUSEL con narrativa (arranque con impacto → desarrollo con estructura → cierre con CTA o pregunta).
Cada slide debe ser visualmente distinto del anterior (varía composición, tipografía dominante, uso del color).
El contenido es tuyo — escribe frases concretas, no genéricas.

MENOS ES MÁS: aplica el minimalismo estricto de la Regla 0 a rajatabla. Máximo 2 elementos "text" por slide. Cero elementos "line". Cero decoración redundante. Prefiere el silencio visual a llenar espacio. Si dudas entre añadir un tercer elemento o dejar respirar, deja respirar SIEMPRE.

RESPUESTA: JSON válido con esta forma exacta (SIN markdown, SIN fences \`\`\`, SIN explicaciones):
{
  "slides": [
    { "bgColor": "#0A0A0A", "bgGradient": "none", "elements": [ ... ] },
    ...
  ]
}

Nº exacto de slides: ${count}. Empieza el JSON con "{" directamente.`;

  const userMsg = `IDEA DEL EDITOR:
${prompt.trim()}

Diseña ${count} slides completos siguiendo esa idea, aplicando la paleta y guía de diseño.`;

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
  const parsed = JSON.parse(jsonMatch[0]) as { slides?: Slide[] };

  if (!Array.isArray(parsed.slides) || !parsed.slides.length) {
    throw new Error("Respuesta sin campo `slides` o vacío.");
  }
  return parsed.slides.map((s) => sanitizeSlide(s));
}

function sanitizeSlide(s: any): Slide {
  const bgColor = typeof s?.bgColor === "string" ? s.bgColor : "#0A0A0A";
  const bgGradient = typeof s?.bgGradient === "string" ? s.bgGradient : "none";
  const elements: SlideElement[] = Array.isArray(s?.elements)
    ? s.elements.filter((e: any) => e && typeof e === "object" && typeof e.type === "string")
    : [];
  return {
    bgColor,
    bgGradient: bgGradient as Slide["bgGradient"],
    bgOverlayOpacity: 0.4,
    elements,
  };
}
