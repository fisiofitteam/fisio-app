/**
 * Preguntas, opciones, familias de movimiento y textos del Semáforo del
 * Hombro. Portado 1:1 del prototipo semaforo-hombro.html — cualquier
 * cambio de copy o de puntuación requiere confirmación del CEO.
 *
 * Este módulo es la ÚNICA fuente de verdad tanto para el cliente
 * (renderiza el test) como para el servidor (recalcula el color al
 * guardar). Nunca duplicar la lógica en otro sitio.
 */

// ═══════════ FAMILIAS DE MOVIMIENTO (matriz) ═══════════

export type FamilyId = "overhead" | "tirones" | "empujes";

export type Family = {
  id: FamilyId;
  name: string;
  ex: string;
};

export const FAMILIES: readonly Family[] = [
  { id: "overhead", name: "Por encima de la cabeza", ex: "Snatch, jerk, OHS, wall ball" },
  { id: "tirones", name: "Colgado y tirones", ex: "Dominadas, kipping, T2B, muscle up" },
  { id: "empujes", name: "Empujes", ex: "Press, flexiones, fondos, HSPU" },
] as const;

export type FamilyValue = "ok" | "leve" | "duele" | "na";

export type FamilyOption = {
  v: FamilyValue;
  label: string;
  score: number | null;
  c: "g" | "a" | "r" | "n";
};

export const FAM_OPTS: readonly FamilyOption[] = [
  { v: "ok", label: "Sin dolor", score: 0, c: "g" },
  { v: "leve", label: "Molesta, aguanto", score: 1, c: "a" },
  { v: "duele", label: "Duele o lo he quitado", score: 2, c: "r" },
  { v: "na", label: "No lo hago", score: null, c: "n" },
] as const;

// ═══════════ PREGUNTAS ═══════════

type BaseQ = {
  id: string;
  section: string;
  title: string;
  help?: string;
  howto?: readonly string[];
  warn?: string;
};

export type SingleOption = { v: string | number; label: string; score: number; c?: "g" | "a" | "r" };
export type MultiOption = { v: string; label: string; exclusive?: boolean };

export type SingleQ = BaseQ & { type: "single"; options: readonly SingleOption[] };
export type MultiQ = BaseQ & { type: "multi"; options: readonly MultiOption[] };
export type MatrixQ = BaseQ & { type: "matrix" };
export type TextQ = BaseQ & { type: "text" };

export type Question = SingleQ | MultiQ | MatrixQ | TextQ;

export const Q: readonly Question[] = [
  {
    id: "seguridad",
    section: "Antes de empezar",
    type: "multi",
    title: "¿Te pasa alguna de estas cosas?",
    help: "Marca todas las que apliquen. Nos ayuda a saber si esto es para ti o si antes te tiene que ver un médico.",
    options: [
      { v: "trauma", label: "Tuve un golpe o una caída y desde entonces no puedo levantar el brazo" },
      { v: "nervio", label: "Hormigueo, adormecimiento o dolor que baja por el brazo hasta la mano" },
      { v: "noche", label: "Dolor fuerte por la noche que no cambia aunque cambie de postura" },
      { v: "hinchazon", label: "Hinchazón, deformidad visible o fiebre" },
      { v: "ninguna", label: "Ninguna de estas", exclusive: true },
    ],
  },
  {
    id: "tiempo",
    section: "Tu historia",
    type: "single",
    title: "¿Cuánto tiempo llevas con molestias en el hombro?",
    options: [
      { v: "<2s", label: "Menos de 2 semanas", score: 0 },
      { v: "2-6s", label: "Entre 2 y 6 semanas", score: 0 },
      { v: "6s-3m", label: "Entre 6 semanas y 3 meses", score: 1 },
      { v: ">3m", label: "Más de 3 meses", score: 2 },
    ],
  },
  {
    id: "probado",
    section: "Tu historia",
    type: "multi",
    title: "¿Qué has probado hasta ahora?",
    help: "Marca todo lo que hayas hecho.",
    options: [
      { v: "descanso", label: "Descansar o dejar de entrenar unos días" },
      { v: "pasivo", label: "Fisio: masaje, punción, electro, ondas de choque…" },
      { v: "farmaco", label: "Antiinflamatorios o infiltración" },
      { v: "ejercicios", label: "Ejercicios por mi cuenta (gomas, movilidad, vídeos)" },
      { v: "nada", label: "Nada todavía", exclusive: true },
    ],
  },
  {
    id: "recurrencia",
    section: "Tu historia",
    type: "single",
    title: "¿Ha mejorado alguna vez y ha vuelto al entrenar?",
    options: [
      { v: "varias", label: "Sí, varias veces", score: 2 },
      { v: "una", label: "Sí, una vez", score: 1 },
      { v: "nunca-se-va", label: "No, nunca se ha llegado a ir del todo", score: 2 },
      { v: "primera", label: "Es la primera vez que me pasa", score: 0 },
    ],
  },
  {
    id: "dia-siguiente",
    section: "Cómo responde tu hombro",
    type: "single",
    title: "Al día siguiente de un entreno exigente, ¿cómo está tu hombro?",
    options: [
      { v: "igual", label: "Igual o mejor que antes de entrenar", score: 0, c: "g" },
      { v: "24h", label: "Algo peor, pero en 24 h vuelve a como estaba", score: 1, c: "a" },
      { v: "48h", label: "Peor, y tarda más de 24–48 h en volver", score: 2, c: "r" },
    ],
  },
  {
    id: "noche",
    section: "Cómo responde tu hombro",
    type: "single",
    title: "¿Y por la noche?",
    options: [
      { v: "no", label: "No me molesta", score: 0, c: "g" },
      { v: "encima", label: "Me molesta si duermo encima de ese lado", score: 1, c: "a" },
      { v: "despierta", label: "Me despierta a menudo", score: 2, c: "r" },
    ],
  },
  {
    id: "movimientos",
    section: "En el box",
    type: "matrix",
    title: "¿Cómo te sientan estos movimientos ahora mismo?",
    help: "Piensa en las últimas 2 semanas de entreno.",
  },
  {
    id: "t-pared",
    section: "Prueba 1 de 4",
    type: "single",
    title: "Brazos a la pared",
    howto: [
      "De pie, con talones a un palmo de la pared y espalda, cabeza y glúteos apoyados.",
      "Brazos estirados, pulgares hacia arriba. Súbelos por delante hasta intentar tocar la pared por encima de la cabeza.",
      "La zona lumbar no puede despegarse de la pared.",
    ],
    options: [
      { v: 0, label: "Toco la pared sin dolor", score: 0, c: "g" },
      { v: 1, label: "Me quedo a un palmo o arqueo la espalda para llegar", score: 1, c: "a" },
      { v: 2, label: "Me duele o me quedo lejos", score: 2, c: "r" },
    ],
  },
  {
    id: "t-colgado",
    section: "Prueba 2 de 4",
    type: "single",
    title: "Colgado de la barra",
    howto: [
      "Agárrate a la barra de dominadas con las palmas hacia delante, a la anchura de tus hombros.",
      "Cuélgate con los pies despegados (o apoyados detrás si no llegas) y los brazos relajados.",
      "Aguanta 20 segundos.",
    ],
    warn: "Si en la prueba anterior el dolor fue fuerte, sáltate esta.",
    options: [
      { v: 0, label: "Aguanto los 20 s sin dolor", score: 0, c: "g" },
      { v: 1, label: "Molestia tolerable, como mucho 3 sobre 10", score: 1, c: "a" },
      { v: 2, label: "Dolor claro o no llego a 20 s", score: 2, c: "r" },
      { v: "skip", label: "Me la salto", score: 1 },
    ],
  },
  {
    id: "t-rotacion",
    section: "Prueba 3 de 4",
    type: "single",
    title: "Empuje contra el marco",
    howto: [
      "De pie junto al marco de una puerta, codo pegado al cuerpo y doblado a 90°.",
      "Apoya el dorso de la muñeca en el marco y empuja hacia fuera, al 70 % de tu fuerza, durante 10 segundos.",
      "Repite con el otro brazo y compara.",
    ],
    options: [
      { v: 0, label: "Sin dolor y con la misma fuerza que el otro lado", score: 0, c: "g" },
      { v: 1, label: "Molestia leve o lo noto más débil", score: 1, c: "a" },
      { v: 2, label: "Dolor claro", score: 2, c: "r" },
    ],
  },
  {
    id: "t-espalda",
    section: "Prueba 4 de 4",
    type: "single",
    title: "Mano a la espalda",
    howto: [
      "Lleva la mano por detrás de la espalda y súbela todo lo que puedas, como para rascarte entre los omóplatos.",
      "Haz lo mismo con el otro brazo y compara hasta dónde llega cada pulgar.",
    ],
    options: [
      { v: 0, label: "Llego igual con los dos lados y sin dolor", score: 0, c: "g" },
      { v: 1, label: "1 o 2 dedos de diferencia", score: 1, c: "a" },
      { v: 2, label: "Mucha diferencia o me duele", score: 2, c: "r" },
    ],
  },
  {
    id: "nombre",
    section: "Último paso",
    type: "text",
    title: "¿Cómo te llamas?",
    help: "Para darte el resultado. Es opcional.",
  },
] as const;

export const TESTS: readonly { id: string; name: string }[] = [
  { id: "t-pared", name: "brazos a la pared" },
  { id: "t-colgado", name: "colgado de la barra" },
  { id: "t-rotacion", name: "empuje contra el marco" },
  { id: "t-espalda", name: "mano a la espalda" },
] as const;

// ═══════════ COPY POR COLOR ═══════════

export type ColorKey = "verde" | "ambar" | "rojo";

export type ColorCopy = {
  c: "g" | "a" | "r";
  verdict: string;
  title: string;
  tips: readonly string[];
  ctaTitle: string;
  ctaText: string;
  ctaBtn: string;
  waLine: string;
};

export const COPY: Record<ColorKey, ColorCopy> = {
  verde: {
    c: "g",
    verdict: "Verde",
    title: "Tu hombro está listo para progresar",
    tips: [
      "Cambia una sola variable cada vez: carga, volumen o complejidad del movimiento. Nunca las tres a la vez.",
      "Usa la regla de las 24 h: si al día siguiente el hombro está igual o mejor, vas bien. Si está peor, has ido demasiado rápido.",
      "Que ahora no duela no significa que esté preparado para todo. La pregunta ya no es si puedes entrenar, sino cómo cargarlo para que no vuelva.",
    ],
    ctaTitle: "¿Sabes cómo progresar sin que vuelva?",
    ctaText: "Te decimos por dónde empezar según tu resultado.",
    ctaBtn: "Quiero saber cómo progresar",
    waLine: "Quiero saber cómo progresar sin que vuelva la molestia.",
  },
  ambar: {
    c: "a",
    verdict: "Ámbar",
    title: "Puedes entrenar, pero tu hombro está al límite",
    tips: [
      "No quites movimientos a ciegas: adáptalos. Reduce la carga o el rango hasta que la molestia no pase de 3 sobre 10 durante el ejercicio.",
      "Vigila el día siguiente: si el hombro está peor 24 h después, ese día te pasaste aunque durante el WOD fuera bien.",
      "El ámbar es donde más se estanca la gente: entrena a medio gas meses sin saber qué capacidad concreta le falta al hombro.",
    ],
    ctaTitle: "¿Qué le falta a tu hombro para pasar a verde?",
    ctaText: "Te decimos qué está limitando a tu hombro según tu resultado.",
    ctaBtn: "Quiero saber qué me falta",
    waLine: "Quiero saber qué me haría falta para poder progresar.",
  },
  rojo: {
    c: "r",
    verdict: "Rojo",
    title: "Tu hombro está estancado y más descanso no lo va a arreglar",
    tips: [
      "Saca del WOD lo que duela, pero no pares del todo. El reposo total calma, pero le quita al hombro la tolerancia que necesita.",
      "Quédate con lo que no te duela o no pase de 3 sobre 10, y respeta la regla de las 24 h a rajatabla.",
      "Si el dolor vuelve cada vez que retomas la carga, el problema no es la zona dolorida, es que nadie ha reconstruido la capacidad del hombro para el box.",
    ],
    ctaTitle: "¿Cómo salir del estancamiento?",
    ctaText: "Te decimos cuál sería tu primer paso para volver a progresar.",
    ctaBtn: "Quiero salir del estancamiento",
    waLine: "Quiero saber cómo salir del estancamiento para volver a progresar.",
  },
};

export const FAM_ADVICE: Record<FamilyValue, { c: "g" | "a" | "r" | "n"; t: string }> = {
  ok: { c: "g", t: "Sigue haciéndolo. Es tu base para progresar." },
  leve: {
    c: "a",
    t: "Mantenlo, pero baja carga o rango hasta que la molestia no pase de 3 sobre 10 ni empeore al día siguiente.",
  },
  duele: { c: "r", t: "Sácalo del WOD por ahora y cámbialo por una variante que no duela." },
  na: { c: "n", t: "No lo practicas ahora mismo." },
};

export const COLOR_NAME: Record<"g" | "a" | "r" | "n", string> = {
  g: "verde",
  a: "ámbar",
  r: "rojo",
  n: "no lo hago",
};

// ═══════════ HELPERS DE ETIQUETAS (para pintar en el panel interno) ═══════════

/** Devuelve el label legible de una opción dada su pregunta y valor. */
export function labelForOption(questionId: string, value: unknown): string {
  const q = Q.find((x) => x.id === questionId);
  if (!q) return String(value);
  if (q.type === "single") {
    const opt = q.options.find((o) => o.v === value);
    return opt?.label ?? String(value);
  }
  if (q.type === "multi") {
    const opt = q.options.find((o) => o.v === value);
    return opt?.label ?? String(value);
  }
  return String(value);
}

/** Título humano de una pregunta por id. */
export function titleForQuestion(questionId: string): string {
  return Q.find((x) => x.id === questionId)?.title ?? questionId;
}
