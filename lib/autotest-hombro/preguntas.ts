/**
 * Preguntas del Autotest Funcional del Hombro para CrossFit.
 *
 * Dos bloques:
 *   A) 5 preguntas rápidas sin vídeo — identificables, el atleta se
 *      ve en ellas al leerlas.
 *   B) 3 tests con vídeo del propio Ales, cada uno con 3 opciones
 *      (bien / regular / mal). Los vídeos los pega el CEO desde el
 *      panel admin — IDs test1..test3 → URL en AutotestHombroConfig.
 *
 * Cada opción define `deltas: Record<AreaId, number>` — se suman al
 * baseline 50 y se clampan a [0, 100] en evaluate.ts. Mantener sumas
 * razonables (±40 por opción máx) para no romper el rango.
 */

import type { AreaId } from "./areas";

export type QuestionId =
  // Bloque A — sin vídeo
  | "snatch_fallo"
  | "gymnastics"
  | "zona_dia_siguiente"
  | "strict_hspu"
  | "strict_pullups"
  // Bloque B — con vídeo
  | "test_wall_slide"
  | "test_thoracic_rotation"
  | "test_flexion_iso"
  // Final — captura
  | "nombre";

export type Option = {
  v: string;
  label: string;
  deltas?: Partial<Record<AreaId, number>>;
};

export type BaseQ = {
  id: QuestionId;
  section: string;
  title: string;
  help?: string;
};

export type SingleQ = BaseQ & {
  type: "single";
  options: readonly Option[];
  /** videoKey=1|2|3 → URL de YouTube en AutotestHombroConfig.videoUrlTestN. */
  videoKey?: 1 | 2 | 3;
  /** Guía corta "cómo se hace" para los tests con vídeo. */
  howto?: readonly string[];
};

export type TextQ = BaseQ & { type: "text" };

export type Question = SingleQ | TextQ;

export const Q: readonly Question[] = [
  // ─── BLOQUE A: preguntas identificables ─────────────────────────────
  {
    id: "snatch_fallo",
    section: "Reconócete",
    title: "Cuando fallas el snatch, ¿cómo lo fallas normalmente?",
    help: "Elige lo que más veces te pasa, no el fallo \"ideal\".",
    type: "single",
    options: [
      {
        v: "delante",
        label: "Por delante — la barra se me va al frente",
        deltas: { rotacionExterna: -25, movilidadOverhead: -15 },
      },
      {
        v: "detras",
        label: "Por detrás — no la aguanto encima y cae atrás",
        deltas: { estabilidadEscapular: -25, fuerzaEmpuje: -10 },
      },
      {
        v: "fuerza",
        label: "Por fuerza — me pesa, no la aguanto arriba",
        deltas: { fuerzaEmpuje: -25, estabilidadEscapular: -15 },
      },
      {
        v: "velocidad",
        label: "Por velocidad — no llego a tiempo debajo",
        deltas: { controlDinamico: -10, confianza: -5 },
      },
      {
        v: "no_fallo",
        label: "No lo fallo apenas",
        deltas: { confianza: 15, estabilidadEscapular: 5 },
      },
      {
        v: "no_hago",
        label: "No lo hago / no tengo snatch todavía",
        deltas: {},
      },
    ],
  },
  {
    id: "gymnastics",
    section: "Reconócete",
    title: "Cuando haces gymnastics (pull-ups, T2B, muscle-up), ¿cómo te sientes?",
    type: "single",
    options: [
      {
        v: "rigido",
        label: "Rígido — me cuesta moverme con soltura",
        deltas: { movilidadOverhead: -20, rotacionExterna: -15 },
      },
      {
        v: "inestable",
        label: "Inestable — no controlo bien el kipping",
        deltas: { controlDinamico: -30, estabilidadEscapular: -15 },
      },
      {
        v: "fuerte_duro",
        label: "Fuerte pero duro — me quemo pronto",
        deltas: { confianza: -10, movilidadOverhead: -10 },
      },
      {
        v: "fluido_debil",
        label: "Fluido pero débil — me falta fuerza para aguantar",
        deltas: { fuerzaEmpuje: -20, controlDinamico: -5 },
      },
      {
        v: "bien",
        label: "Me siento bien, los disfruto",
        deltas: { confianza: 15, controlDinamico: 10 },
      },
    ],
  },
  {
    id: "zona_dia_siguiente",
    section: "Reconócete",
    title: "Después de un WOD con mucho hombro, ¿dónde lo notas al día siguiente?",
    help: "Esto nos da pistas de qué parte del hombro trabaja de más.",
    type: "single",
    options: [
      {
        v: "delantera",
        label: "Parte delantera (deltoides / pecho)",
        deltas: { estabilidadEscapular: -20, rotacionExterna: -10 },
      },
      {
        v: "posterior",
        label: "Parte posterior (manguito / trapecio)",
        deltas: { estabilidadEscapular: -25 },
      },
      {
        v: "escapula",
        label: "Entre o debajo de las escápulas",
        deltas: { estabilidadEscapular: -15, controlDinamico: -10 },
      },
      {
        v: "brazo",
        label: "Brazo entero (bíceps / tríceps)",
        deltas: { fuerzaEmpuje: -15 },
      },
      {
        v: "nada",
        label: "No lo noto / se recupera rápido",
        deltas: { confianza: 15, estabilidadEscapular: 10 },
      },
    ],
  },
  {
    id: "strict_hspu",
    section: "Tus números",
    title: "¿Cuántas strict HSPU seguidas te salen (sin kipping)?",
    type: "single",
    options: [
      { v: "0", label: "0 — todavía no me sale ninguna", deltas: { fuerzaEmpuje: -35, estabilidadEscapular: -10 } },
      { v: "1_3", label: "1 a 3", deltas: { fuerzaEmpuje: -15, estabilidadEscapular: -5 } },
      { v: "4_7", label: "4 a 7", deltas: { fuerzaEmpuje: 10 } },
      { v: "8_mas", label: "8 o más", deltas: { fuerzaEmpuje: 25, estabilidadEscapular: 5 } },
    ],
  },
  {
    id: "strict_pullups",
    section: "Tus números",
    title: "¿Cuántas strict pull-ups seguidas haces?",
    type: "single",
    options: [
      { v: "0", label: "0 — todavía no", deltas: { controlDinamico: -25, estabilidadEscapular: -15 } },
      { v: "1_5", label: "1 a 5", deltas: { controlDinamico: -10 } },
      { v: "6_12", label: "6 a 12", deltas: { controlDinamico: 15 } },
      { v: "13_mas", label: "13 o más", deltas: { controlDinamico: 25, fuerzaEmpuje: 10 } },
    ],
  },

  // ─── BLOQUE B: tests con vídeo (sin material, en casa) ─────────────
  {
    id: "test_wall_slide",
    section: "Test 1 de 3 · Wall slide",
    title: "¿Con cuál te identificas al hacer el wall slide?",
    help: "Mira el vídeo. Lo haces una vez, pegado a la pared, y marcas lo que te pasa.",
    type: "single",
    videoKey: 1,
    howto: [
      "Pegado de culo, espalda media y cabeza contra la pared.",
      "Brazos en \"W\" (codos a la altura del hombro, dorso de la mano contra la pared).",
      "Sube deslizando los brazos hasta la \"Y\" — intenta no despegar nada.",
    ],
    options: [
      {
        v: "ok",
        label: "Llego arriba sin despegar la lumbar ni los antebrazos",
        deltas: { movilidadOverhead: 25, estabilidadEscapular: 15 },
      },
      {
        v: "regular",
        label: "Llego, pero despego la lumbar o los antebrazos",
        deltas: { movilidadOverhead: -10, estabilidadEscapular: -5 },
      },
      {
        v: "mal",
        label: "No llego arriba o me duele intentarlo",
        deltas: { movilidadOverhead: -30, estabilidadEscapular: -15, confianza: -10 },
      },
    ],
  },
  {
    id: "test_thoracic_rotation",
    section: "Test 2 de 3 · Rotación torácica",
    title: "¿Qué pasa cuando giras el codo hacia el techo?",
    help: "A cuatro patas, mano en la nuca, giras el codo buscando el techo. 5 reps cada lado.",
    type: "single",
    videoKey: 2,
    howto: [
      "A cuatro patas, caderas sobre rodillas y manos bajo hombros.",
      "Una mano en la nuca, codo apuntando al suelo.",
      "Gira el torso para llevar el codo al techo manteniendo las caderas quietas.",
    ],
    options: [
      {
        v: "ok",
        label: "El codo apunta al techo sin esfuerzo, igual los dos lados",
        deltas: { rotacionExterna: 25, movilidadOverhead: 10 },
      },
      {
        v: "regular",
        label: "Llego, pero un lado me cuesta más que el otro",
        deltas: { rotacionExterna: -10 },
      },
      {
        v: "mal",
        label: "Me quedo lejos del techo o la zona cruje",
        deltas: { rotacionExterna: -30, confianza: -10 },
      },
    ],
  },
  {
    id: "test_flexion_iso",
    section: "Test 3 de 3 · Flexión isométrica a 90°",
    title: "¿Cuánto aguantas la flexión a 90° sin perder la forma?",
    help: "En posición de plancha, baja hasta tener los codos a 90° y aguanta ahí. Cronométrate.",
    type: "single",
    videoKey: 3,
    howto: [
      "Plancha alta, cuerpo en línea.",
      "Baja hasta que los codos estén a 90° (brazo paralelo al suelo).",
      "Aguanta sin que la cadera se caiga ni se dispare arriba.",
    ],
    options: [
      {
        v: "ok",
        label: "Aguanto 20 s o más firme, sin que me baje la cadera",
        deltas: { fuerzaEmpuje: 25, estabilidadEscapular: 15, confianza: 10 },
      },
      {
        v: "regular",
        label: "Aguanto 10-20 s, pero empiezo a temblar o se me cae la cadera",
        deltas: { fuerzaEmpuje: -10 },
      },
      {
        v: "mal",
        label: "Aguanto menos de 10 s o no llego a 90° sin apoyar las rodillas",
        deltas: { fuerzaEmpuje: -30, estabilidadEscapular: -15, confianza: -10 },
      },
    ],
  },

  // ─── Captura final ─────────────────────────────────────────────────
  {
    id: "nombre",
    section: "Casi está",
    title: "¿Cómo te llamas?",
    help: "Lo usamos para personalizar tu resultado y hablar contigo por WhatsApp si quieres.",
    type: "text",
  },
];

/** Label legible por id de opción (para el drawer del panel admin). */
export function labelForOption(questionId: string, value: unknown): string {
  const q = Q.find((x) => x.id === questionId);
  if (!q || q.type !== "single") return String(value ?? "");
  const o = q.options.find((o) => o.v === value);
  return o?.label ?? String(value ?? "");
}

export function titleForQuestion(questionId: string): string {
  return Q.find((q) => q.id === questionId)?.title ?? questionId;
}
