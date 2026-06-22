/**
 * Estructura semanal de stories de Instagram para FisioFit.
 *
 * Una idea/intención por día (Lun→Dom). La IA usa esta plantilla como esqueleto
 * y la rellena con el tema central de la semana + body zone. Si en el futuro
 * queremos hacerlo editable desde la Biblioteca, basta con mover este array a
 * un singleton en BD (al estilo AiContentBrief) y leer de ahí.
 */

export type WeekStoryDay = {
  dow: number;             // 1=Lunes ... 7=Domingo
  label: string;           // Nombre del día
  type: string;            // Tipo de story (etiqueta corta para la UI)
  purpose: string;         // Qué buscamos conseguir ese día
  framework: string;       // Estructura/instrucciones para la IA en formato libre
};

export const WEEK_STORY_STRUCTURE: WeekStoryDay[] = [
  {
    dow: 1,
    label: "Lunes",
    type: "Pregunta abierta",
    purpose: "Engagement temprano + sembrar el tema de la semana",
    framework:
      "1 story con texto + caja de preguntas o encuesta. La pregunta debe abrir el tema de la semana de forma personal ('¿Te ha pasado…?', '¿Qué harías si…?'). 1-2 frames como máximo. Sin tecnicismos.",
  },
  {
    dow: 2,
    label: "Martes",
    type: "Mito que rompemos",
    purpose: "Educar rompiendo una creencia común; posicionarnos como referencia",
    framework:
      "Secuencia 3-4 stories: (1) Mito tal cual lo dirían en un box ('Te han dicho X'); (2) por qué eso es media verdad; (3) qué dice la evidencia o nuestra experiencia clínica; (4) micro-CTA suave a guardar/responder. Tono directo, sin pelearse con el lector.",
  },
  {
    dow: 3,
    label: "Miércoles",
    type: "Caso real / testimonio",
    purpose: "Prueba social. Genera credibilidad antes del fin de semana.",
    framework:
      "2-3 stories contando un caso real (anonimizado). Estructura: situación inicial → qué probamos antes y no funcionó → qué hicimos diferente → estado actual. Si tenemos foto/vídeo del paciente (consent), indicarlo como nota visual. Cero promesas absolutas.",
  },
  {
    dow: 4,
    label: "Jueves",
    type: "Tip práctico de 1 minuto",
    purpose: "Valor accionable que pueda hacer hoy mismo",
    framework:
      "1 story principal con vídeo en formato selfie o demo de 1 ejercicio/test/concepto súper concreto y aplicable. Estructura: hook ('Si X, prueba esto') → demostración → ojo con esto (error común) → para quién NO sirve (honestidad). Máx 60s.",
  },
  {
    dow: 5,
    label: "Viernes",
    type: "Behind the scenes",
    purpose: "Humanizar la marca antes del finde, generar conexión",
    framework:
      "2-3 stories desenfadadas mostrando el día a día: una sesión, una conversación con un paciente, equipo grabando, algo que pase de verdad esa semana en la clínica/box. Texto corto, espontáneo, no producido. Sin CTA.",
  },
  {
    dow: 6,
    label: "Sábado",
    type: "Interacción directa",
    purpose: "Movernos en el algoritmo de finde apoyándonos en la audiencia",
    framework:
      "1 story con caja de preguntas o cuestionario tipo trivia sobre el tema de la semana. La pregunta debe ser fácil para que mucha gente conteste. Después haremos repost de las mejores respuestas (mencionar en el texto que vamos a contestar las respuestas).",
  },
  {
    dow: 7,
    label: "Domingo",
    type: "Recap + cierre",
    purpose: "Cerrar el bucle de la semana y preparar la siguiente",
    framework:
      "2 stories: (1) resumen muy corto de lo que hemos visto esta semana (3 bullets máx); (2) qué viene la próxima semana / CTA suave (videoconsulta, contestar DM, guardar perfil…). Tono reflexivo, sin urgencia.",
  },
];

export function dayStructureFor(dayIndex: number): WeekStoryDay {
  // dayIndex 0..6 (Lun..Dom) — devolvemos el correspondiente
  const safe = ((dayIndex % 7) + 7) % 7;
  return WEEK_STORY_STRUCTURE[safe];
}
