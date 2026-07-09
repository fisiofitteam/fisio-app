/**
 * 4 plantillas iniciales del Story Maker. Cada una define varios slides
 * con elementos posicionados y "huecos" (aiSlots) donde la IA rellena
 * texto según un prompt del CEO.
 *
 * Los slides tienen fondo negro por defecto (característica pedida) y
 * paleta FisioFit (amarillo #FCD34D + naranja #F59E0B).
 *
 * Estas plantillas son BUILTIN — no se pueden borrar. Aparecen SIEMPRE
 * en el selector del editor. Cuando el CEO las modifica y guarda como
 * plantilla, se crea una copia en `ContentStoryTemplate` (BD) que sí es
 * editable/borrable.
 */
import type { StoryTemplate } from "./types";
import { BRAND_YELLOW, BRAND_ORANGE, WHITE, BLACK } from "./types";

export const BUILTIN_TEMPLATES: StoryTemplate[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // PORTADA — 1 slide, título grande + subtítulo + CTA
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "builtin-portada",
    key: "portada",
    name: "Portada",
    description: "Título grande + subtítulo + CTA. Para arrancar una serie.",
    emoji: "🎯",
    isBuiltin: true,
    slides: [
      {
        bgColor: BLACK,
        bgOverlayOpacity: 0.4,
        elements: [
          {
            id: "e-title",
            type: "text",
            x: 50, y: 42, width: 85,
            content: "TÍTULO PRINCIPAL",
            font: "Antonio",
            size: 130,
            weight: 900,
            color: BRAND_YELLOW,
            bgColor: "transparent",
            align: "center",
            shadow: false,
            uppercase: true,
            letterSpacing: 0.02,
          },
          {
            id: "e-sub",
            type: "text",
            x: 50, y: 58, width: 80,
            content: "Subtítulo que contextualiza el título en una línea",
            font: "Manrope",
            size: 42,
            weight: 500,
            color: WHITE,
            bgColor: "transparent",
            align: "center",
            shadow: false,
          },
          {
            id: "e-cta",
            type: "text",
            x: 50, y: 90, width: 60,
            content: "Desliza para descubrirlas →",
            font: "Manrope",
            size: 32,
            weight: 700,
            color: BRAND_YELLOW,
            bgColor: "transparent",
            align: "center",
            shadow: false,
          },
        ],
      },
    ],
    aiSlots: [
      { slideIdx: 0, elementId: "e-title", hint: "Título hook impactante en mayúsculas, 2-4 palabras", maxWords: 4 },
      { slideIdx: 0, elementId: "e-sub", hint: "Subtítulo que amplía el hook en una línea, 6-12 palabras", maxWords: 12 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CITA — 1 slide, frase grande + autor
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "builtin-cita",
    key: "cita",
    name: "Cita",
    description: "Frase potente en italic serif + autor abajo. Testimonios y sentencias.",
    emoji: "💬",
    isBuiltin: true,
    slides: [
      {
        bgColor: BLACK,
        bgOverlayOpacity: 0.5,
        elements: [
          {
            id: "e-quote-mark",
            type: "text",
            x: 15, y: 24, width: 20,
            content: "“",
            font: "Cormorant Garamond",
            size: 260,
            weight: 700,
            color: BRAND_YELLOW,
            bgColor: "transparent",
            align: "left",
            shadow: false,
          },
          {
            id: "e-quote",
            type: "text",
            x: 50, y: 48, width: 80,
            content: "La cita va aquí. Frase que golpea en italic serif elegante.",
            font: "Cormorant Garamond",
            size: 90,
            weight: 500,
            color: WHITE,
            bgColor: "transparent",
            align: "center",
            shadow: false,
            italic: true,
          },
          {
            id: "e-author",
            type: "line",
            x: 15, y: 76, width: 10,
            height: 4,
            color: BRAND_YELLOW,
          },
          {
            id: "e-author-name",
            type: "text",
            x: 50, y: 82, width: 70,
            content: "AUTOR · CONTEXTO",
            font: "Manrope",
            size: 28,
            weight: 700,
            color: BRAND_YELLOW,
            bgColor: "transparent",
            align: "center",
            shadow: false,
            uppercase: true,
            letterSpacing: 0.14,
          },
        ],
      },
    ],
    aiSlots: [
      { slideIdx: 0, elementId: "e-quote", hint: "Cita/frase potente en primera persona, 8-20 palabras", maxWords: 20 },
      { slideIdx: 0, elementId: "e-author-name", hint: "Autor y contexto separado por ·, en mayúsculas", maxWords: 6 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // LISTA — 1 slide, número gigante + explicación
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "builtin-lista",
    key: "lista",
    name: "Lista",
    description: "Número grande + explicación. Para pasos, causas, errores…",
    emoji: "1️⃣",
    isBuiltin: true,
    slides: [
      {
        bgColor: BLACK,
        bgOverlayOpacity: 0.4,
        elements: [
          {
            id: "e-tag",
            type: "text",
            x: 50, y: 12, width: 60,
            content: "TAG · CATEGORÍA",
            font: "Manrope",
            size: 26,
            weight: 800,
            color: BRAND_YELLOW,
            bgColor: "transparent",
            align: "center",
            shadow: false,
            uppercase: true,
            letterSpacing: 0.2,
          },
          {
            id: "e-num",
            type: "text",
            x: 50, y: 32, width: 90,
            content: "1",
            font: "Antonio",
            size: 380,
            weight: 900,
            color: BRAND_YELLOW,
            bgColor: "transparent",
            align: "center",
            shadow: false,
          },
          {
            id: "e-title",
            type: "text",
            x: 50, y: 62, width: 82,
            content: "TÍTULO DEL PUNTO",
            font: "Antonio",
            size: 80,
            weight: 900,
            color: WHITE,
            bgColor: "transparent",
            align: "center",
            shadow: false,
            uppercase: true,
          },
          {
            id: "e-body",
            type: "text",
            x: 50, y: 80, width: 80,
            content: "Explicación breve de este punto, con un ejemplo si aplica.",
            font: "Manrope",
            size: 38,
            weight: 500,
            color: "#D4D4D4",
            bgColor: "transparent",
            align: "center",
            shadow: false,
          },
        ],
      },
    ],
    aiSlots: [
      { slideIdx: 0, elementId: "e-tag", hint: "Etiqueta corta de categoría, en mayúsculas, 1-3 palabras", maxWords: 3 },
      { slideIdx: 0, elementId: "e-num", hint: "Número del punto en dígitos (1, 2, 3…)", maxWords: 1 },
      { slideIdx: 0, elementId: "e-title", hint: "Título breve del punto en mayúsculas", maxWords: 5 },
      { slideIdx: 0, elementId: "e-body", hint: "Explicación en 1-2 líneas cortas", maxWords: 25 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // PREGUNTA — 1 slide, icono ? + pregunta central
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: "builtin-pregunta",
    key: "pregunta",
    name: "Pregunta",
    description: "Interrogación en grande. Para hooks tipo pregunta abierta.",
    emoji: "❓",
    isBuiltin: true,
    slides: [
      {
        bgColor: BLACK,
        bgOverlayOpacity: 0.4,
        elements: [
          {
            id: "e-tag",
            type: "text",
            x: 50, y: 20, width: 60,
            content: "PREGUNTA DEL DÍA",
            font: "Manrope",
            size: 26,
            weight: 800,
            color: BRAND_YELLOW,
            bgColor: "transparent",
            align: "center",
            shadow: false,
            uppercase: true,
            letterSpacing: 0.2,
          },
          {
            id: "e-qmark",
            type: "text",
            x: 50, y: 38, width: 30,
            content: "?",
            font: "Antonio",
            size: 340,
            weight: 900,
            color: BRAND_ORANGE,
            bgColor: "transparent",
            align: "center",
            shadow: false,
          },
          {
            id: "e-question",
            type: "text",
            x: 50, y: 68, width: 82,
            content: "¿Aquí va la pregunta que quieres lanzarles?",
            font: "Antonio",
            size: 95,
            weight: 800,
            color: WHITE,
            bgColor: "transparent",
            align: "center",
            shadow: false,
          },
          {
            id: "e-hint",
            type: "text",
            x: 50, y: 88, width: 70,
            content: "Respóndenos por DM 💬",
            font: "Manrope",
            size: 32,
            weight: 600,
            color: BRAND_YELLOW,
            bgColor: "transparent",
            align: "center",
            shadow: false,
          },
        ],
      },
    ],
    aiSlots: [
      { slideIdx: 0, elementId: "e-question", hint: "Pregunta abierta que enganche, 5-12 palabras, con signos ¿?", maxWords: 12 },
    ],
  },
];

export function getBuiltinTemplate(key: string): StoryTemplate | null {
  return BUILTIN_TEMPLATES.find((t) => t.key === key) ?? null;
}
