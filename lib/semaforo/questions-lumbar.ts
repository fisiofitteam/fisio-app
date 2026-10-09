/**
 * Preguntas, familias de movimiento y textos del Semáforo del Lumbar.
 * Portado del Semáforo del Hombro adaptando preguntas y matriz a la
 * zona lumbar. Mantiene los MISMOS IDs que el hombro siempre que la
 * pregunta cumple el mismo rol en el algoritmo de evaluate():
 *
 *   · `seguridad`           → banderas rojas (cola de caballo, etc.)
 *   · `tiempo`              → cuánto llevas con molestias
 *   · `probado`             → qué has probado hasta ahora
 *   · `recurrencia`         → ¿ha mejorado y vuelto?
 *   · `eva`                 → EVA 0-10 entrenando
 *   · `dia-siguiente`       → cómo responde al día siguiente
 *   · `noche`               → cómo responde al dormir / levantarte
 *   · `overhead-subjetivo`  → en lumbar lo reutilizamos como "atarse
 *                             cordones" (subjetivo del movimiento clave
 *                             de flexión). Mismo peso en evaluate().
 *   · `asimetria`           → en lumbar lo reutilizamos como "estar
 *                             sentado 1h" (discriminador funcional).
 *   · `movimientos`         → matrix por familias
 *   · `nombre`              → identificación
 *
 * Reutilizar los IDs mantiene `evaluate()` sin cambios estructurales
 * — paga el "coste conceptual" de que los nombres internos sean del
 * hombro, pero evita duplicar el algoritmo de scoring.
 */

import type {
  Question,
  Family,
  FamilyGroupInfo,
  FamilyValue,
  ColorKey,
  ColorCopy,
} from "@/lib/semaforo/questions";

// ═══════════ FAMILIAS LUMBARES (matriz) ═══════════

export const FAMILY_GROUPS_LUMBAR: readonly FamilyGroupInfo[] = [
  { id: "overhead", label: "Bisagra · levantar peso del suelo" },
  { id: "colgado",  label: "Sentadillas y techo" },
  { id: "empujes",  label: "Impacto y core" },
] as const;

export const FAMILIES_LUMBAR: readonly Family[] = [
  // ─── Bisagra (6) — donde más sufre el lumbar ──────────────
  { id: "deadlift-conv",  name: "Peso muerto convencional", group: "overhead" },
  { id: "deadlift-sumo",  name: "Peso muerto sumo",         group: "overhead" },
  { id: "clean",          name: "Clean",                    group: "overhead" },
  { id: "snatch-lumbar",  name: "Snatch",                   group: "overhead" },
  { id: "kb-swing",       name: "Kettlebell swing",         group: "overhead" },
  { id: "good-morning",   name: "Good morning",             group: "overhead" },
  // ─── Sentadillas y techo (6) ─────────────────────────────
  { id: "air-squat",      name: "Air squat",                group: "colgado" },
  { id: "back-squat",     name: "Back squat",               group: "colgado" },
  { id: "front-squat",    name: "Front squat",              group: "colgado" },
  { id: "ohs-lumbar",     name: "Overhead squat",           group: "colgado" },
  { id: "thruster-l",     name: "Thruster",                 group: "colgado" },
  { id: "wallball-l",     name: "Wall ball",                group: "colgado" },
  // ─── Impacto y core (8) ──────────────────────────────────
  { id: "burpees",        name: "Burpees",                  group: "empujes" },
  { id: "running",        name: "Running",                  group: "empujes" },
  { id: "rowing",         name: "Rowing",                   group: "empujes" },
  { id: "box-jumps",      name: "Box jumps",                group: "empujes" },
  { id: "double-unders",  name: "Double unders",            group: "empujes" },
  { id: "t2b-lumbar",     name: "Toes to bar",              group: "empujes" },
  { id: "ghd",            name: "GHD sit-up",               group: "empujes" },
  { id: "hollow",         name: "Hollow hold",              group: "empujes" },
] as const;

// ═══════════ PREGUNTAS ═══════════

export const Q_LUMBAR: readonly Question[] = [
  {
    id: "seguridad",
    section: "Antes de empezar",
    type: "multi",
    title: "¿Te pasa alguna de estas cosas?",
    help: "Marca todas las que apliquen. Nos ayuda a saber si esto es para ti o si antes te tiene que ver un médico.",
    options: [
      { v: "fuerza", label: "Pérdida de fuerza en una pierna o en el pie" },
      { v: "nervio", label: "Hormigueo o entumecimiento que baja hasta el pie" },
      { v: "esfinter", label: "Cambios en el control de orina o heces" },
      { v: "noche", label: "Dolor nocturno intenso que me despierta y no mejora al cambiar de postura" },
      { v: "fiebre", label: "Dolor + fiebre o pérdida de peso sin motivo" },
      { v: "trauma", label: "Golpe o caída fuerte sobre la espalda y desde entonces no se me va" },
      { v: "ninguna", label: "Ninguna de estas", exclusive: true },
    ],
  },
  {
    id: "tiempo",
    section: "Tu historia",
    type: "single",
    title: "¿Cuánto tiempo llevas con molestias lumbares?",
    options: [
      { v: "<2s", label: "Menos de 2 semanas", score: 0 },
      { v: "2-6s", label: "Entre 2 y 6 semanas", score: 0 },
      { v: "6s-6m", label: "Entre 6 semanas y 6 meses", score: 1 },
      { v: ">6m", label: "Más de 6 meses", score: 2 },
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
      { v: "farmaco", label: "Antiinflamatorios" },
      { v: "imagen", label: "Resonancia o radiografía" },
      { v: "infiltracion", label: "Infiltración" },
      { v: "ejercicios", label: "Ejercicios por mi cuenta (gomas, movilidad, vídeos)" },
      { v: "nada", label: "Nada todavía", exclusive: true },
    ],
  },
  {
    id: "recurrencia",
    section: "Tu historia",
    type: "single",
    title: "¿Ha mejorado alguna vez y has vuelto a entrenar normal?",
    options: [
      { v: "si-no-vuelve", label: "Sí, ya no me duele nunca", score: 0 },
      { v: "si-vuelve", label: "Sí, pero vuelve", score: 2 },
      { v: "siempre-algo", label: "Siempre me duele algo", score: 2 },
      { v: "primera", label: "Es la primera vez que me pasa", score: 0 },
    ],
  },
  {
    id: "eva",
    section: "Tu dolor ahora",
    type: "single",
    title: "En una escala del 0 al 10, ¿cuánto te duele la lumbar entrenando?",
    help: "0 = nada, no lo noto. 10 = el peor dolor que puedas imaginar.",
    options: [
      { v: "0-1", label: "0-1 · Nada o casi nada", score: 0, c: "g" },
      { v: "2-3", label: "2-3 · Molesta pero puedo con todo", score: 1, c: "a" },
      { v: "4-6", label: "4-6 · Duele y me obliga a bajar carga o cambiar movimientos", score: 2, c: "r" },
      { v: "7-10", label: "7-10 · Muy fuerte, no puedo entrenar con eso", score: 2, c: "r" },
    ],
  },
  {
    id: "dia-siguiente",
    section: "Cómo responde tu lumbar",
    type: "single",
    title: "Al día siguiente de un entreno exigente, ¿cómo está tu lumbar?",
    options: [
      { v: "igual", label: "Igual o mejor que antes de entrenar", score: 0, c: "g" },
      { v: "24h", label: "Algo peor, pero en 24 h vuelve a como estaba", score: 1, c: "a" },
      { v: "48h", label: "Peor, y tarda más de 24-48 h en volver", score: 2, c: "r" },
    ],
  },
  {
    id: "noche",
    section: "Cómo responde tu lumbar",
    type: "single",
    title: "¿Y por la noche / al levantarte de la cama?",
    options: [
      { v: "no", label: "Sin dolor, me levanto normal", score: 0, c: "g" },
      { v: "rigidez", label: "Rigidez que mejora en 10 min moviéndome", score: 1, c: "a" },
      { v: "hora", label: "Me cuesta más de 1 h quitarme la rigidez", score: 2, c: "r" },
    ],
  },
  {
    // En el hombro este ID era "¿puedes levantar los brazos sin dolor?".
    // En lumbar lo reutilizamos como subjetivo del movimiento clave de
    // flexión: atarse los cordones. Mismo rol en evaluate().
    id: "overhead-subjetivo",
    section: "Cómo lo notas tú",
    type: "single",
    title: "¿Puedes agacharte a atarte los cordones sin dolor?",
    help: "Piensa en el gesto cotidiano, no en una sentadilla profunda.",
    options: [
      { v: "si", label: "Sí, sin problema", score: 0, c: "g" },
      { v: "cuidado", label: "Puedo, pero con cuidado o algo de molestia", score: 1, c: "a" },
      { v: "rodillas", label: "Solo doblando mucho las rodillas", score: 2, c: "r" },
      { v: "imposible", label: "Me resulta imposible", score: 2, c: "r" },
    ],
  },
  {
    // En el hombro era "¿lo notas distinto al otro?". En lumbar lo
    // reutilizamos como discriminador funcional de carga sostenida:
    // estar sentado 1h.
    id: "asimetria",
    section: "Cómo lo notas tú",
    type: "single",
    title: "¿Estar 1 h sentado trabajando te lo empeora?",
    options: [
      { v: "no", label: "No me afecta", score: 0, c: "g" },
      { v: "rigidez", label: "Se me pone rígida pero sigo", score: 1, c: "a" },
      { v: "dolor", label: "Dolor claro, me cuesta aguantar", score: 2, c: "r" },
      { v: "levantar", label: "Tengo que levantarme cada 15 min", score: 2, c: "r" },
    ],
  },
  {
    id: "evolucion",
    section: "Cómo lo notas tú",
    type: "single",
    title: "Comparado con antes de que empezara, ¿cómo lo notas?",
    options: [
      { v: "peor", label: "Peor", score: 2, c: "r" },
      { v: "igual", label: "Igual", score: 1, c: "a" },
      { v: "mejor", label: "Mejor", score: 0, c: "g" },
      { v: "temporadas", label: "Va por temporadas", score: 1, c: "a" },
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
    id: "nombre",
    section: "Último paso",
    type: "text",
    title: "¿Cómo te llamas?",
    help: "Para darte el resultado. Es opcional.",
  },
] as const;

// ═══════════ COPY POR COLOR ═══════════

export const COPY_LUMBAR: Record<ColorKey, ColorCopy> = {
  verde: {
    c: "g",
    verdict: "Verde",
    title: "Tu lumbar está lista para progresar",
    tips: [
      "Cambia una sola variable cada vez: carga, volumen o complejidad del movimiento. Nunca las tres a la vez.",
      "Usa la regla de las 24 h: si al día siguiente la lumbar está igual o mejor, vas bien. Si está peor, has ido demasiado rápido.",
      "Que ahora no duela no significa que esté preparada para todo. La pregunta ya no es si puedes entrenar, sino cómo cargar la bisagra para que no vuelva.",
    ],
    ctaTitle: "¿Sabes cómo progresar sin que vuelva?",
    ctaText: "Te decimos por dónde empezar según tu resultado.",
    ctaBtn: "Quiero saber cómo progresar",
    waLine: "Quiero saber cómo progresar sin que vuelva la molestia lumbar.",
  },
  ambar: {
    c: "a",
    verdict: "Ámbar",
    title: "Puedes entrenar, pero tu lumbar está al límite",
    tips: [
      "No quites movimientos a ciegas: adáptalos. Reduce la carga o el rango hasta que la molestia no pase de 3 sobre 10 durante el ejercicio.",
      "Vigila el día siguiente: si la lumbar está peor 24 h después, ese día te pasaste aunque durante el WOD fuera bien.",
      "El ámbar es donde más se estanca la gente: entrena a medio gas meses sin saber qué capacidad concreta le falta a la lumbar.",
    ],
    ctaTitle: "¿Qué le falta a tu lumbar para pasar a verde?",
    ctaText: "Te decimos qué está limitando a tu lumbar según tu resultado.",
    ctaBtn: "Quiero saber qué me falta",
    waLine: "Quiero saber qué me haría falta para poder progresar sin dolor lumbar.",
  },
  rojo: {
    c: "r",
    verdict: "Rojo",
    title: "Tu lumbar está estancada y más descanso no lo va a arreglar",
    tips: [
      "Saca del WOD lo que duela, pero no pares del todo. El reposo total calma, pero le quita a la lumbar la tolerancia que necesita.",
      "Quédate con lo que no te duela o no pase de 3 sobre 10, y respeta la regla de las 24 h a rajatabla.",
      "Si el dolor vuelve cada vez que retomas la carga, el problema no es la zona dolorida, es que nadie ha reconstruido la capacidad de la lumbar para el box.",
    ],
    ctaTitle: "¿Cómo salir del estancamiento?",
    ctaText: "Te decimos cuál sería tu primer paso para volver a progresar.",
    ctaBtn: "Quiero salir del estancamiento",
    waLine: "Quiero saber cómo salir del estancamiento para volver a progresar.",
  },
};

// ═══════════ FAM_ADVICE (consejo por valor en la matrix) ═══════════
// Textos adaptados a lumbar — mismo esquema que el hombro.

export const FAM_ADVICE_LUMBAR: Record<FamilyValue, { c: "g" | "a" | "r" | "n"; t: string }> = {
  ok: { c: "g", t: "Sigue haciéndolo. Es tu base para progresar." },
  leve: {
    c: "a",
    t: "Mantenlo, pero baja carga o rango hasta que la molestia no pase de 3 sobre 10 ni empeore al día siguiente.",
  },
  duele: { c: "r", t: "Sácalo del WOD por ahora y cámbialo por una variante que no cargue la bisagra lumbar." },
  na: { c: "n", t: "No lo practicas ahora mismo." },
};
