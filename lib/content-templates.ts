// Plantillas maestras de los 7 formatos de pieza.
// Se cargan al crear una semana nueva, generando los 7 ContentPiece.
// Cada formato define: label, goal, ctaType, dmKeyword default, y los bloques iniciales.
// El bloque "label" es el título del bloque en el guion (ej "0–3s Hook visual")
// El bloque "content" arranca vacío, se rellena durante la producción.

export type FormatKey =
  | "belief_carousel"
  | "case_reel"
  | "value_carousel"
  | "value_reel"
  | "exercises_carousel"
  | "infographic"
  | "closing_reel";

export type BlockTemplate = {
  id: string;
  label: string;
  content: string;
  order: number;
};

export type FormatTemplate = {
  key: FormatKey;
  label: string;
  goal: string;
  ctaType: string;
  defaultDmKeyword: string;
  blocks: BlockTemplate[];
  storyChecklist: string[];
};

export const WEEKLY_PLAN: Record<number, FormatKey> = {
  1: "belief_carousel",      // Lunes
  2: "case_reel",            // Martes
  3: "value_carousel",       // Miércoles
  4: "value_reel",           // Jueves
  5: "exercises_carousel",   // Viernes
  6: "infographic",          // Sábado
  7: "closing_reel",         // Domingo
};

export const DAY_LABELS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function block(id: string, label: string, order: number): BlockTemplate {
  return { id, label, content: "", order };
}

export const FORMAT_TEMPLATES: Record<FormatKey, FormatTemplate> = {
  belief_carousel: {
    key: "belief_carousel",
    label: "Carrusel creencia",
    goal: "Desmontar una creencia limitante de la audiencia",
    ctaType: "Suave (guardar / seguir)",
    defaultDmKeyword: "",
    blocks: [
      block("hook", "Slide 1 · Hook", 0),
      block("validation", "Slide 2 · Validación", 1),
      block("desmonte1", "Slide 3 · Desmonte", 2),
      block("desmonte2", "Slide 4 · Desmonte (continúa)", 3),
      block("desmonte3", "Slide 5 · Desmonte (cierre)", 4),
      block("que_hacer1", "Slide 6 · Qué hacer en su lugar", 5),
      block("que_hacer2", "Slide 7 · Qué hacer (detalle)", 6),
      block("expert_nuance", "Slide 8 · Matiz experto", 7),
      block("recap", "Slide 9 · Recap", 8),
      block("cta", "Slide 10 · CTA suave", 9),
    ],
    storyChecklist: [
      "Caja de preguntas sobre el tema",
      "Encuesta: ¿lo creías tú también?",
      "Story con cita del carrusel",
    ],
  },

  case_reel: {
    key: "case_reel",
    label: "Reel caso éxito",
    goal: "Mostrar transformación real de un atleta",
    ctaType: "DM con palabra clave",
    defaultDmKeyword: "CASO",
    blocks: [
      block("t0_3", "0–3s · Hook visual + dolor inicial", 0),
      block("t3_10", "3–10s · Contexto del atleta", 1),
      block("t10_35", "10–35s · Proceso (qué hicimos)", 2),
      block("t35_50", "35–50s · Resultado tangible", 3),
      block("t50_60", "50–60s · CTA: DM con palabra clave", 4),
    ],
    storyChecklist: [
      "Story del atleta entrenando hoy",
      "Caja de preguntas: ¿quieres este resultado?",
    ],
  },

  value_carousel: {
    key: "value_carousel",
    label: "Carrusel valor",
    goal: "Educar profundamente sobre un tema clínico",
    ctaType: "Guardar + comentar",
    defaultDmKeyword: "",
    blocks: [
      block("cover", "Slide 1 · Portada (promesa clara)", 0),
      block("point1", "Slide 2 · Punto 1", 1),
      block("point2", "Slide 3 · Punto 2", 2),
      block("point3", "Slide 4 · Punto 3", 3),
      block("point4", "Slide 5 · Punto 4", 4),
      block("point5", "Slide 6 · Punto 5", 5),
      block("expert_nuance", "Slide 7 · Matiz experto", 6),
      block("cta", "Slide 8 · CTA: guarda y comenta", 7),
    ],
    storyChecklist: [
      "Story con un punto clave del carrusel",
      "Caja de preguntas para resolver dudas",
    ],
  },

  value_reel: {
    key: "value_reel",
    label: "Reel valor",
    goal: "Idea potente en menos de 45s",
    ctaType: "Comentar palabra clave",
    defaultDmKeyword: "INFO",
    blocks: [
      block("t0_3", "0–3s · Hook directo", 0),
      block("t3_25", "3–25s · Idea principal", 1),
      block("t25_40", "25–40s · Ejemplo / aplicación", 2),
      block("t40_45", "40–45s · CTA cierre", 3),
      block("bonus_stories", "Bonus · Idea para stories", 4),
    ],
    storyChecklist: [
      "Story con el reel anclado arriba",
      "Caja de preguntas para profundizar",
    ],
  },

  exercises_carousel: {
    key: "exercises_carousel",
    label: "Carrusel ejercicios",
    goal: "Mostrar ejercicios concretos para un objetivo",
    ctaType: "DM lead magnet",
    defaultDmKeyword: "PLAN",
    blocks: [
      block("cover", "Slide 1 · Portada", 0),
      block("ex1", "Slide 2 · Ejercicio 1 (nombre / series-reps / detalle)", 1),
      block("ex2", "Slide 3 · Ejercicio 2", 2),
      block("ex3", "Slide 4 · Ejercicio 3", 3),
      block("ex4", "Slide 5 · Ejercicio 4", 4),
      block("ex5", "Slide 6 · Ejercicio 5", 5),
      block("cta", "Slide 7 · CTA lead magnet", 6),
    ],
    storyChecklist: [
      "Story demo de uno de los ejercicios",
      "Story con el lead magnet en encuesta",
    ],
  },

  infographic: {
    key: "infographic",
    label: "Infografía",
    goal: "Resumir info denso en imagen visual",
    ctaType: "Guardar",
    defaultDmKeyword: "",
    blocks: [
      block("format", "Formato (tabla / esquema / diagrama / lista)", 0),
      block("title", "Título", 1),
      block("block1", "Bloque 1", 2),
      block("block2", "Bloque 2", 3),
      block("block3", "Bloque 3", 4),
      block("block4", "Bloque 4", 5),
      block("caption", "Caption con CTA", 6),
    ],
    storyChecklist: [
      "Story con un trozo zoom de la infografía",
    ],
  },

  closing_reel: {
    key: "closing_reel",
    label: "Reel cierre",
    goal: "Cierre semanal con CTA fuerte",
    ctaType: "DM palabra clave (alta intención)",
    defaultDmKeyword: "EMPEZAR",
    blocks: [
      block("t0_5", "0–5s · Hook de urgencia", 0),
      block("t5_40", "5–40s · Argumento principal", 1),
      block("t40_55", "40–55s · Prueba / caso breve", 2),
      block("t55_60", "55–60s · CTA fuerte (DM palabra clave)", 3),
    ],
    storyChecklist: [
      "Story con el reel anclado",
      "Caja de preguntas: ¿quieres empezar?",
      "Encuesta cierre de semana",
    ],
  },
};

export const WEEK_TYPES = [
  { value: "educativa", label: "Educativa" },
  { value: "objeciones", label: "Objeciones / Persuasión" },
  { value: "lanzamiento", label: "Lanzamiento" },
  { value: "recuperacion", label: "Recuperación de leads" },
];

export const BODY_ZONES = [
  { value: "hombro", label: "Hombro" },
  { value: "rodilla", label: "Rodilla" },
  { value: "lumbar", label: "Lumbar" },
  { value: "mixta", label: "Mixta" },
];

export const WEEK_STATUS = [
  { value: "planning", label: "Planificación", color: "neutral" },
  { value: "production", label: "Producción", color: "amber" },
  { value: "publishing", label: "Publicando", color: "blue" },
  { value: "closed", label: "Cerrada", color: "emerald" },
];

export const PIECE_STATUS = [
  { value: "idea", label: "Idea", color: "neutral" },
  { value: "script", label: "Guion", color: "amber" },
  { value: "recorded", label: "Grabado / Diseñado", color: "blue" },
  { value: "edited", label: "Editado", color: "purple" },
  { value: "scheduled", label: "Programado", color: "indigo" },
  { value: "published", label: "Publicado", color: "emerald" },
];

// Util: para mostrar el lunes y domingo de una semana ISO dado año + número
export function isoWeekRange(year: number, weekNumber: number): { start: Date; end: Date } {
  // ISO week: el lunes de la semana 1 contiene el 4 de enero (o el primer jueves del año)
  const simple = new Date(Date.UTC(year, 0, 1 + (weekNumber - 1) * 7));
  const dow = simple.getUTCDay();
  const monday = new Date(simple);
  if (dow <= 4) {
    monday.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  } else {
    monday.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  }
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday, end: sunday };
}

// Util: a partir de una fecha, devuelve { year, weekNumber } ISO
export function isoWeekFromDate(date: Date): { year: number; weekNumber: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), weekNumber };
}
