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
