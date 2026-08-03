/**
 * Modelo de datos del editor visual del Carrusel Maker (v2, estilo Canva).
 *
 * Cada slide es un `SlideDoc` con:
 *   - fondo (color + opcional imagen + overlay + grano/header/numeración)
 *   - un array de `elements` posicionados en % del canvas 1080×1350
 *
 * Cada elemento tiene id + posición + tipo + estilo. Es serializable JSON
 * y se guarda en `Carousel.visualJson`. Cuando se carga un draft antiguo
 * (formato v1 con `layout` + `yellowWords` + …) lo migramos a este modelo
 * con `migrateOldVisual()`.
 */

import type { CarouselSlide } from "./types";

// ─── Constantes ─────────────────────────────────────────────────────────

export const CANVAS_W = 1080;
export const CANVAS_H = 1350;

export const PALETTE = {
  bg: "#0A0A0A",
  chalkWhite: "#F5F5EF",
  yellow: "#F4C03D",
  yellowDeep: "#D4A424",
  white: "#FFFFFF",
  muted: "#A3A3A3",
} as const;

/**
 * Fuentes disponibles. Anton y Bebas Neue las cargamos desde Google Fonts
 * en el editor visual. Geist e Inter ya están en la app; Impact es fallback.
 */
export const FONT_STACK = {
  Anton: "'Anton', 'Bebas Neue', Impact, sans-serif",
  "Bebas Neue": "'Bebas Neue', Impact, sans-serif",
  Impact: "Impact, 'Anton', sans-serif",
  Geist: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
  Inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
} as const;

export type FontKey = keyof typeof FONT_STACK;

// ─── Elementos ──────────────────────────────────────────────────────────

export type BaseElement = {
  id: string;
  /** posición del CENTRO del elemento (en % del canvas 0..100). */
  x: number;
  y: number;
};

export type TextElement = BaseElement & {
  type: "text";
  content: string;
  font: FontKey;
  /** tamaño en px sobre canvas 1080×1350 (ej. 120 = 120px reales). */
  size: number;
  weight: 400 | 500 | 600 | 700 | 800 | 900;
  color: string;
  /** anchura de la caja en % (el alto se ajusta al contenido). */
  width: number;
  align: "left" | "center" | "right";
  italic?: boolean;
  uppercase?: boolean;
  letterSpacing?: number; // em, ej 0.03
  lineHeight?: number;    // 1.0 - 1.6 típico
  shadow?: boolean;
  /**
   * Palabras a resaltar en amarillo dentro del `content`. Se hace por
   * match case-insensitive. Vacío = todo el texto usa `color`.
   */
  yellowWords?: string[];
};

export type LineElement = BaseElement & {
  type: "line";
  width: number;   // % del canvas
  height: number;  // px reales (grosor)
  color: string;
};

export type ChipElement = BaseElement & {
  type: "chip";
  width: number;         // % del canvas
  icon: string;          // emoji o letra
  label: string;
  fill: string;          // color de relleno del rectángulo
  borderColor: string;   // color del borde
  labelColor: string;
  iconBg: string;        // color del círculo del icono
  iconColor: string;
  fontSize: number;      // tamaño del texto del label
};

export type ImageElement = BaseElement & {
  type: "image";
  url: string;
  width: number;   // % del canvas
  height: number;  // % del canvas (permite ratio libre)
  objectFit?: "cover" | "contain";
  borderRadius?: number; // px
  opacity?: number; // 0..1
};

export type SlideElement = TextElement | LineElement | ChipElement | ImageElement;

// ─── Slide + Doc ────────────────────────────────────────────────────────

export type SlideDoc = {
  bgColor: string;
  bgImageUrl?: string;
  bgOverlayColor?: string;
  bgOverlayOpacity?: number;
  showHeader?: boolean;   // FISIOF/T CROSS arriba
  showNumber?: boolean;   // "1/N" arriba derecha
  showGrain?: boolean;    // overlay de grano
  elements: SlideElement[];
};

export type CarouselDoc = {
  version: 2;
  slides: SlideDoc[];
};

// ─── IDs ────────────────────────────────────────────────────────────────

let COUNTER = 1;
export function newId(prefix: string = "el"): string {
  return `${prefix}-${Date.now().toString(36)}-${(COUNTER++).toString(36)}`;
}

// ─── Defaults / helpers de creación ─────────────────────────────────────

export function emptySlideDoc(): SlideDoc {
  return {
    bgColor: PALETTE.bg,
    showHeader: true,
    showNumber: true,
    showGrain: true,
    elements: [],
  };
}

export function defaultTextElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    id: newId("text"),
    type: "text",
    x: 50,
    y: 50,
    width: 82,
    content: "Nuevo texto",
    font: "Anton",
    size: 120,
    weight: 700,
    color: PALETTE.chalkWhite,
    align: "left",
    uppercase: true,
    letterSpacing: 0.01,
    lineHeight: 1.0,
    shadow: true,
    yellowWords: [],
    ...overrides,
  };
}

export function defaultLineElement(overrides: Partial<LineElement> = {}): LineElement {
  return {
    id: newId("line"),
    type: "line",
    x: 20,
    y: 60,
    width: 8,
    height: 4,
    color: PALETTE.yellow,
    ...overrides,
  };
}

export function defaultChipElement(overrides: Partial<ChipElement> = {}): ChipElement {
  return {
    id: newId("chip"),
    type: "chip",
    x: 25,
    y: 70,
    width: 35,
    icon: "⚡",
    label: "Etiqueta",
    fill: PALETTE.bg,
    borderColor: PALETTE.yellow,
    labelColor: PALETTE.white,
    iconBg: PALETTE.yellow,
    iconColor: PALETTE.bg,
    fontSize: 30,
    ...overrides,
  };
}

export function defaultImageElement(url: string, overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    id: newId("img"),
    type: "image",
    x: 75,
    y: 55,
    width: 40,
    height: 60,
    url,
    objectFit: "cover",
    borderRadius: 20,
    opacity: 1,
    ...overrides,
  };
}

// ─── Presets: "insertar plantilla" para un slide ────────────────────────
// Cuando el user pincha "Aplicar plantilla" en un slide vacío o quiere
// reemplazar el contenido, elegimos entre estos presets. Están diseñados
// para coincidir con el look FisioFit Cross de los ejemplos reales.

export function presetHook(slide: CarouselSlide): SlideDoc {
  const title = (slide.title ?? "").trim() || "TITULAR";
  const subtitle = slide.subtitle ?? slide.body ?? "";
  const size = pickTitleSize(title);
  const els: SlideElement[] = [
    defaultTextElement({
      x: 50, y: subtitle ? 42 : 50, width: 82,
      content: title.toUpperCase(),
      size,
      align: "left",
      uppercase: true,
      yellowWords: suggestYellowWords(title.toUpperCase()),
    }),
  ];
  if (subtitle) {
    els.push(
      defaultTextElement({
        x: 50, y: 60, width: 82,
        content: subtitle,
        font: "Geist",
        size: 34,
        weight: 500,
        color: PALETTE.white,
        align: "left",
        uppercase: false,
        letterSpacing: 0,
        shadow: false,
      }),
    );
  }
  els.push(defaultLineElement({ x: 10, y: 78, width: 6, height: 5 }));
  els.push(defaultLineElement({ x: 18, y: 78, width: 2, height: 5 }));
  return { ...emptySlideDoc(), elements: els };
}

export function presetChips(slide: CarouselSlide): SlideDoc {
  const title = (slide.title ?? "").trim() || "TITULAR";
  const subtitle = slide.subtitle ?? "";
  const chips = autoExtractChips(slide.body ?? "");
  const els: SlideElement[] = [
    defaultTextElement({
      x: 50, y: 22, width: 82,
      content: title.toUpperCase(),
      size: 96,
      align: "left",
      uppercase: true,
      yellowWords: suggestYellowWords(title.toUpperCase()),
    }),
  ];
  if (subtitle) {
    els.push(
      defaultTextElement({
        x: 50, y: 32, width: 82,
        content: subtitle,
        font: "Geist",
        size: 32,
        weight: 500,
        color: PALETTE.white,
        align: "left",
        uppercase: false,
        letterSpacing: 0,
        shadow: false,
      }),
    );
  }
  // Rejilla 2 columnas
  const cols = 2;
  const startY = 48;
  const rowGap = 10;
  chips.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    els.push(
      defaultChipElement({
        x: col === 0 ? 27 : 73,
        y: startY + row * rowGap,
        width: 42,
        icon: c.icon,
        label: c.label,
      }),
    );
  });
  return { ...emptySlideDoc(), elements: els };
}

export function presetTextBody(slide: CarouselSlide): SlideDoc {
  const title = (slide.title ?? "").trim();
  const body = (slide.body ?? "").trim();
  const els: SlideElement[] = [];
  if (title) {
    els.push(
      defaultTextElement({
        x: 50, y: 22, width: 82,
        content: title.toUpperCase(),
        size: 76,
        align: "left",
        uppercase: true,
        yellowWords: suggestYellowWords(title.toUpperCase()),
      }),
    );
  }
  if (body) {
    els.push(
      defaultTextElement({
        x: 50, y: 60, width: 82,
        content: body,
        font: "Geist",
        size: 34,
        weight: 400,
        color: PALETTE.chalkWhite,
        align: "left",
        uppercase: false,
        letterSpacing: 0,
        lineHeight: 1.4,
        shadow: false,
      }),
    );
  }
  return { ...emptySlideDoc(), elements: els };
}

export function presetCta(slide: CarouselSlide): SlideDoc {
  const keyword = (extractCtaKeyword(slide.title ?? "") ?? "HOMBRO").toUpperCase();
  const els: SlideElement[] = [
    defaultTextElement({
      x: 50, y: 32, width: 70,
      content: "ESCRÍBEME",
      size: 60,
      weight: 700,
      align: "center",
      uppercase: true,
      letterSpacing: 0.05,
      shadow: false,
    }),
    defaultTextElement({
      x: 50, y: 52, width: 82,
      content: `"${keyword}"`,
      size: 160,
      weight: 900,
      color: PALETTE.bg,
      align: "center",
      uppercase: true,
    }),
  ];
  if (slide.subtitle || slide.body) {
    els.push(
      defaultTextElement({
        x: 50, y: 72, width: 76,
        content: (slide.subtitle ?? slide.body ?? "").trim(),
        font: "Geist",
        size: 32,
        weight: 500,
        color: PALETTE.chalkWhite,
        align: "center",
        uppercase: false,
        letterSpacing: 0,
        shadow: false,
      }),
    );
  }
  return { ...emptySlideDoc(), elements: els };
}

// ─── Migración v1 → v2 ──────────────────────────────────────────────────
/**
 * Convierte el visualJson viejo `{[n]: {layout, yellowWords, chips, ...}}`
 * a un CarouselDoc con elementos posicionados. Es 1-way (no volvemos a v1).
 */
export function buildInitialDoc(slides: CarouselSlide[], v1: any): CarouselDoc {
  const out: SlideDoc[] = slides.map((s, i) => {
    const v1Slide = v1?.[s.n] ?? null;
    const layout: string | undefined = v1Slide?.layout;
    const isFirst = i === 0;
    const isLast = i === slides.length - 1;

    // Escoger preset. Si venía de v1 usamos su layout; si no, heurística.
    const chosen =
      layout ??
      pickPresetHeuristic(s, isFirst, isLast);
    let doc: SlideDoc;
    switch (chosen) {
      case "hook":
      case "hook_photo":
        doc = presetHook(s);
        break;
      case "chips_list":
        doc = presetChips(s);
        break;
      case "text_body":
        doc = presetTextBody(s);
        break;
      case "cta_ribbon":
        doc = presetCta(s);
        break;
      default:
        doc = presetHook(s);
    }
    // Si v1 traía yellowWords personalizadas, las aplicamos al primer text.
    if (Array.isArray(v1Slide?.yellowWords) && v1Slide.yellowWords.length > 0) {
      const firstText = doc.elements.find((e) => e.type === "text") as TextElement | undefined;
      if (firstText) firstText.yellowWords = v1Slide.yellowWords;
    }
    return doc;
  });
  return { version: 2, slides: out };
}

function pickPresetHeuristic(slide: CarouselSlide, isFirst: boolean, isLast: boolean): string {
  const title = slide.title ?? "";
  const body = slide.body ?? "";
  if (isLast && (/^escr[íi]beme/i.test(title.trim()) || /\b[A-ZÁÉÍÓÚÑ]{4,}\b/.test(title))) {
    return "cta_ribbon";
  }
  if (isFirst) return "hook";
  const bullets = (body.match(/^\s*(?:[•\-–—✔️✅🔹🟡🟠🟢]|👉|\d+\.)/gm) ?? []).length;
  if (bullets >= 4 && body.length < 300) return "chips_list";
  if (body.length > 250) return "text_body";
  return "hook";
}

// ─── Utilidades usadas por presets ──────────────────────────────────────

function pickTitleSize(title: string): number {
  const len = title.replace(/\s+/g, "").length;
  if (len <= 18) return 180;
  if (len <= 30) return 150;
  if (len <= 50) return 120;
  if (len <= 80) return 96;
  return 76;
}

function suggestYellowWords(title: string): string[] {
  const matches = title.match(/\b[A-ZÁÉÍÓÚÑ]{3,}\b/g) ?? [];
  return Array.from(new Set(matches)).slice(0, 3);
}

function autoExtractChips(body: string): Array<{ icon: string; label: string }> {
  if (!body) return [];
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const chips: Array<{ icon: string; label: string }> = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[•\-–—✔️✅❌🔹🟡🟠🟢👉]+\s*/, "").trim();
    if (!cleaned) continue;
    if (cleaned.length > 40) continue;
    chips.push({ icon: cleaned[0].toUpperCase(), label: cleaned });
    if (chips.length >= 6) break;
  }
  return chips;
}

function extractCtaKeyword(title: string): string | null {
  const quoted = title.match(/["'“”]([A-ZÁÉÍÓÚÑ]{3,})["'“”]/);
  if (quoted) return quoted[1];
  const shouts = title.match(/\b[A-ZÁÉÍÓÚÑ]{3,}\b/g);
  if (shouts && shouts.length > 0) return shouts[shouts.length - 1];
  return null;
}

// ─── Parser/serializer del visualJson en DB ─────────────────────────────

export function parseCarouselDoc(raw: string | null | undefined): CarouselDoc | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj?.version === 2 && Array.isArray(obj?.slides)) return obj as CarouselDoc;
    return null; // formato v1 antiguo → dejar que buildInitialDoc lo migre
  } catch {
    return null;
  }
}

/**
 * Tokeniza un texto en spans para pintar palabras en amarillo. Preserva
 * espacios y saltos de línea. Case-insensitive contra `yellowWords`.
 */
export function tokenizeYellow(content: string, yellowWords: string[] = []): Array<{ text: string; yellow: boolean; break?: boolean }> {
  const yellowSet = new Set(yellowWords.map((w) => w.toLowerCase()));
  const out: Array<{ text: string; yellow: boolean; break?: boolean }> = [];
  const lines = content.split(/\n/);
  lines.forEach((line, li) => {
    const tokens = line.split(/(\s+)/);
    for (const t of tokens) {
      if (!t) continue;
      if (/^\s+$/.test(t)) {
        out.push({ text: t, yellow: false });
      } else {
        const stripped = t.replace(/[.,;:!?¿¡"'"“”]/g, "").toLowerCase();
        out.push({ text: t, yellow: yellowSet.has(stripped) });
      }
    }
    if (li < lines.length - 1) out.push({ text: "", yellow: false, break: true });
  });
  return out;
}
