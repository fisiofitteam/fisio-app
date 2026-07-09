// Tipos compartidos por los componentes del Story Maker. Los mantengo aparte
// para no crear ciclos de import y para que los estilos individuales solo
// dependan de tipos, no de lógica.

export const STORY_STYLE_KEYS = [
  "marca-base",
  "luxury",
  "bento",
  "magazine",
  "flashcard",
] as const;

export type StoryStyleKey = (typeof STORY_STYLE_KEYS)[number];

// ─── Formato de la serie ───────────────────────────────────────────────────
// Instagram tiene 3 aspectos publicables:
//   - Story 9:16 → 1080×1920 (vídeo/imagen efímera, 24h)
//   - Carrusel feed 4:5 → 1080×1350 (post permanente, hasta 10 slides)
// Reels 9:16 sería el mismo canvas que Story pero para publicación
// permanente — no lo tratamos aparte por ahora.

export type StoryFormat = "story-9x16" | "carousel-4x5";

export const FORMAT_DIMS: Record<StoryFormat, { w: number; h: number; label: string }> = {
  "story-9x16": { w: 1080, h: 1920, label: "Story 9:16" },
  "carousel-4x5": { w: 1080, h: 1350, label: "Carrusel 4:5" },
};

export type Slide = {
  styleKey: StoryStyleKey;
  title: string;
  subtitle: string;
  body: string;
  cta: string;
  bgUrl: string;
  attribution: string;
};

export type StoryTemplate = {
  id: string;
  name: string;
  description: string | null;
  slides: Slide[];
  updatedAt: string;
};

export const EMPTY_SLIDE: Slide = {
  styleKey: "marca-base",
  title: "",
  subtitle: "",
  body: "",
  cta: "",
  bgUrl: "",
  attribution: "",
};

// Paleta oficial FisioFit (misma que agenda / prevention / emails).
export const BRAND = {
  primary: "#FCD34D",       // amarillo
  primaryDark: "#F59E0B",   // naranja
  primarySoft: "#78350F",   // ámbar oscuro (labels sobre amarillo)
  ink: "#FAFAFA",
  inkDim: "#A3A3A3",
  inkFaint: "#525252",
  bg: "#0A0A0A",
  surface: "rgba(20, 20, 20, 0.85)",
  border: "#262626",
} as const;
