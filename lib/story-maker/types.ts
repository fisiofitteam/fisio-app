/**
 * Story Maker — modelo de datos.
 *
 * Slide 1080×1920 con elementos posicionados en porcentaje del canvas
 * (x, y = 0..100). Así los slides se escalan bien en cualquier preview
 * sin cálculos raros.
 */

export type FontKey =
  | "Futura"
  | "Antonio"
  | "Manrope"
  | "Playfair Display"
  | "Cormorant Garamond"
  | "Archivo Black"
  | "Bebas Neue"
  | "Inter";

export const FONT_STACK: Record<FontKey, string> = {
  "Futura": "'Antonio', 'Futura', 'Futura PT', 'Trebuchet MS', sans-serif",
  "Antonio": "'Antonio', 'Bebas Neue', Impact, sans-serif",
  "Manrope": "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
  "Playfair Display": "'Playfair Display', Georgia, serif",
  "Cormorant Garamond": "'Cormorant Garamond', Georgia, serif",
  "Archivo Black": "'Archivo Black', Impact, sans-serif",
  "Bebas Neue": "'Bebas Neue', Impact, sans-serif",
  "Inter": "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
};

// ─── Elementos posicionables dentro de un slide ─────────────────────────

export type TextElement = {
  id: string;
  type: "text";
  x: number;           // % del canvas (0..100). Centrado del elemento en (x,y).
  y: number;
  width: number;       // % del canvas (0..100). Alto se ajusta al contenido.
  content: string;
  font: FontKey;
  size: number;        // px sobre el canvas 1080×1920. 60 = 60px reales.
  weight: 400 | 500 | 600 | 700 | 800 | 900;
  color: string;
  bgColor: string;     // fondo del texto (transparent si vacío)
  align: "left" | "center" | "right";
  shadow: boolean;
  italic?: boolean;
  uppercase?: boolean;
  letterSpacing?: number; // em, ej. 0 o 0.05
};

export type LogoElement = {
  id: string;
  type: "logo";
  x: number;
  y: number;
  size: number;        // px real de ancho
  url: string;
};

export type LineElement = {
  id: string;
  type: "line";
  x: number;
  y: number;
  width: number;       // % del canvas
  height: number;      // px de grosor real
  color: string;
};

export type SlideElement = TextElement | LogoElement | LineElement;

export type Slide = {
  bgColor: string;
  bgImageUrl?: string;      // opcional. Se pinta bajo un overlay controlable.
  bgOverlayOpacity?: number;// 0..1. Default 0.4 (para que el texto se lea).
  elements: SlideElement[];
};

// ─── Plantillas ─────────────────────────────────────────────────────────

export type StoryTemplate = {
  id: string;
  key: string;            // slug único
  name: string;
  description: string;
  emoji?: string;
  slides: Slide[];        // slides "muestra" que se pegan al elegir la plantilla
  aiSlots: AiSlot[];      // qué campos rellena la IA por slide
  // Solo las plantillas builtin tienen isBuiltin=true. Las guardadas por el
  // CEO no lo son y se pueden borrar.
  isBuiltin?: boolean;
};

// Un "hueco" que la IA puede rellenar en un slide. Se refiere por el id
// del elemento en el slide.
export type AiSlot = {
  slideIdx: number;
  elementId: string;
  hint: string;      // qué debe generar la IA en ese hueco
  maxWords?: number;
};

// ─── Constantes útiles ──────────────────────────────────────────────────

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

export const BRAND_YELLOW = "#FCD34D";
export const BRAND_ORANGE = "#F59E0B";
export const BLACK = "#0A0A0A";
export const WHITE = "#FAFAFA";
