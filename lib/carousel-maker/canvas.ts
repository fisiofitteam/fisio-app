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
  /**
   * Ancla vertical del bloque. `center` (default) posiciona el CENTRO del
   * texto en (x,y). `top` posiciona la esquina superior; `bottom` la
   * esquina inferior. Ojo: esto solo cambia dónde se dibuja el texto
   * respecto de `y`; ideal para presets donde queremos flow top-down y
   * evitar que dos elementos con contenido variable se solapen.
   */
  anchor?: "center" | "top" | "bottom";
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

/**
 * Todos los presets siguen el mismo principio: los textos se posicionan
 * con `anchor: "top"` y una Y explícita — así el titular puede crecer
 * hacia abajo sin invadir el cuerpo. La zona útil vertical es 15%..90%
 * (arriba dejamos el header FISIOF/T CROSS y numeración).
 */

const SAFE_TOP = 16;
const SAFE_BOTTOM = 90;

export function presetHook(slide: CarouselSlide): SlideDoc {
  const title = (slide.title ?? "").trim() || "TITULAR";
  const body = (slide.body ?? "").trim();
  const subtitle = (slide.subtitle ?? "").trim();
  const hasSecondary = !!(subtitle || body);
  // En hook el titular DOMINA aunque haya body — es el gancho del carrusel.
  // Le dejamos más margen que en text_body (cap 130 en vez de 96) para que
  // se lea gigante como en los carruseles reales de FisioFit Cross.
  const size = pickTitleSize(title, hasSecondary, /* heroCap */ hasSecondary ? 130 : 200);
  const els: SlideElement[] = [];
  // Titular anclado arriba de la zona útil
  els.push(
    defaultTextElement({
      x: 50, y: SAFE_TOP, width: 84,
      content: title.toUpperCase(),
      size,
      align: "left",
      uppercase: true,
      lineHeight: 0.98,
      anchor: "top",
      yellowWords: suggestYellowWords(title.toUpperCase()),
    }),
  );
  // Estimación de altura del titular en % del canvas para colocar el body debajo.
  const titleHeightPct = estimateTextHeightPct(title, size, 84, 0.98);
  const gap = 5;
  let nextY = SAFE_TOP + titleHeightPct + gap;
  if (subtitle) {
    els.push(
      defaultTextElement({
        x: 50, y: nextY, width: 84,
        content: subtitle,
        font: "Geist",
        size: 34,
        weight: 500,
        color: PALETTE.white,
        align: "left",
        uppercase: false,
        letterSpacing: 0,
        lineHeight: 1.3,
        shadow: false,
        anchor: "top",
      }),
    );
    nextY += estimateTextHeightPct(subtitle, 34, 84, 1.3) + gap;
  }
  if (body) {
    els.push(
      defaultTextElement({
        x: 50, y: nextY, width: 84,
        content: body,
        font: "Geist",
        size: 30,
        weight: 400,
        color: PALETTE.chalkWhite,
        align: "left",
        uppercase: false,
        letterSpacing: 0,
        lineHeight: 1.4,
        shadow: false,
        anchor: "top",
      }),
    );
  }
  // Adorno de líneas amarillas al fondo del slide.
  els.push(defaultLineElement({ x: 10, y: SAFE_BOTTOM - 2, width: 6, height: 5 }));
  els.push(defaultLineElement({ x: 18, y: SAFE_BOTTOM - 2, width: 2, height: 5 }));
  return { ...emptySlideDoc(), elements: els };
}

export function presetChips(slide: CarouselSlide): SlideDoc {
  const title = (slide.title ?? "").trim() || "TITULAR";
  const subtitle = (slide.subtitle ?? "").trim();
  const chips = autoExtractChips(slide.body ?? "");
  const els: SlideElement[] = [];
  const titleSize = pickTitleSize(title, true);
  els.push(
    defaultTextElement({
      x: 50, y: SAFE_TOP, width: 84,
      content: title.toUpperCase(),
      size: titleSize,
      align: "left",
      uppercase: true,
      lineHeight: 0.98,
      anchor: "top",
      yellowWords: suggestYellowWords(title.toUpperCase()),
    }),
  );
  const titleH = estimateTextHeightPct(title, titleSize, 84, 0.98);
  let nextY = SAFE_TOP + titleH + 3;
  if (subtitle) {
    els.push(
      defaultTextElement({
        x: 50, y: nextY, width: 84,
        content: subtitle,
        font: "Geist",
        size: 32,
        weight: 500,
        color: PALETTE.white,
        align: "left",
        uppercase: false,
        lineHeight: 1.3,
        shadow: false,
        anchor: "top",
      }),
    );
    nextY += estimateTextHeightPct(subtitle, 32, 84, 1.3) + 4;
  }
  // Rejilla de chips: filas de 2, altura de chip ~7% del canvas, gap 2%
  const cols = 2;
  const chipH = 7;
  const rowGap = 2.5;
  chips.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    els.push(
      defaultChipElement({
        x: col === 0 ? 27 : 73,
        y: nextY + row * (chipH + rowGap) + chipH / 2, // los chips van center-anchored, así centro = top + h/2
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
  let nextY = SAFE_TOP;
  if (title) {
    const size = pickTitleSize(title, true);
    els.push(
      defaultTextElement({
        x: 50, y: nextY, width: 84,
        content: title.toUpperCase(),
        size,
        align: "left",
        uppercase: true,
        lineHeight: 0.98,
        anchor: "top",
        yellowWords: suggestYellowWords(title.toUpperCase()),
      }),
    );
    nextY += estimateTextHeightPct(title, size, 84, 0.98) + 4;
  }
  if (body) {
    els.push(
      defaultTextElement({
        x: 50, y: nextY, width: 84,
        content: body,
        font: "Geist",
        size: 32,
        weight: 400,
        color: PALETTE.chalkWhite,
        align: "left",
        uppercase: false,
        letterSpacing: 0,
        lineHeight: 1.4,
        shadow: false,
        anchor: "top",
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
  // CTA claro: último slide con "escríbeme X" o palabra en mayúsculas gritada.
  if (isLast && (/^escr[íi]beme/i.test(title.trim()) || /\b[A-ZÁÉÍÓÚÑ]{4,}\b/.test(title))) {
    return "cta_ribbon";
  }
  // Chips: bullets cortos y sin body largo detrás.
  const bullets = (body.match(/^\s*(?:[•\-–—✔️✅🔹🟡🟠🟢]|👉|\d+\.)/gm) ?? []).length;
  if (bullets >= 4 && body.length < 300) return "chips_list";
  // Primer slide: SIEMPRE hook. Es el gancho del carrusel — el titular
  // manda, aunque haya body — el preset hook v2 apila título arriba y
  // subtítulo/body debajo sin solaparse gracias al anchor top.
  if (isFirst) return "hook";
  // El resto — cualquier slide con body sustancial — va a text_body, que
  // usa titular más pequeño arriba + cuerpo grande debajo.
  if (body.length > 60) return "text_body";
  return "hook";
}

// ─── Utilidades usadas por presets ──────────────────────────────────────

/**
 * Elegir tamaño del titular. Si el slide tiene contenido secundario
 * (subtítulo o body), reducimos el máximo para dejar sitio y no invadir.
 * `heroCap` sobrescribe el tope habitual — el preset hook lo sube porque
 * ahí el titular tiene que dominar (gancho gigante estilo FisioFit Cross).
 */
function pickTitleSize(title: string, hasSecondary = false, heroCap?: number): number {
  const len = title.replace(/\s+/g, "").length;
  const cap = heroCap ?? (hasSecondary ? 96 : 180);
  if (len <= 18) return Math.min(200, cap);
  if (len <= 30) return Math.min(160, cap);
  if (len <= 50) return Math.min(120, cap);
  if (len <= 80) return Math.min(88, cap);
  return Math.min(66, cap);
}

/**
 * Estima la altura (en % del canvas 1350px) que va a ocupar un texto según
 * su tamaño en px y el ancho disponible. Usamos una regla aproximada:
 * caracteres por línea ≈ (widthPct/100 * canvas_w) / (px * 0.55), luego
 * altura = líneas * px * lineHeight. Con esto colocamos elementos en
 * cascada sin necesidad de medir DOM real (importante para presets que
 * se aplican en cliente en el mismo tick).
 */
function estimateTextHeightPct(text: string, sizePx: number, widthPct: number, lineHeight: number): number {
  const canvasWpx = 1080;
  const canvasHpx = 1350;
  const boxWidthPx = (widthPct / 100) * canvasWpx;
  // Ancho aproximado por carácter en fuentes tipo Anton ~ 0.5-0.6em.
  const avgCharWidth = sizePx * 0.55;
  const charsPerLine = Math.max(4, Math.floor(boxWidthPx / avgCharWidth));
  // Contamos líneas por saltos explícitos y wraps aproximados.
  const explicitLines = text.split(/\n/);
  let totalLines = 0;
  for (const line of explicitLines) {
    if (!line.trim()) { totalLines += 1; continue; }
    totalLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  const heightPx = totalLines * sizePx * lineHeight;
  return (heightPx / canvasHpx) * 100;
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
