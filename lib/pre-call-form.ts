import { prisma } from "@/lib/prisma";

/**
 * Formulario que rellena el paciente antes de reservar una llamada
 * (optimización o graduación). Se materializa como un registro en
 * `FormLibrary` con `slug = "pre_call"` para que head coach y CEO puedan
 * editarlo desde `/fisio/biblioteca/formularios` como cualquier otro
 * formulario — así la app no impone el copy.
 *
 * Dos preguntas conservan un id estable (`q_satisfaction`, `q_nps`) porque
 * son las que alimentan las métricas de satisfacción y NPS del equipo.
 * Si el equipo las borra o cambia el id, las métricas de esa respuesta
 * caen a `null` y en el KPI aparecen como "—". El resto de preguntas se
 * pueden añadir/quitar libremente.
 */

export const PRE_CALL_FORM_SLUG = "pre_call";
export const SATISFACTION_QUESTION_ID = "q_satisfaction";
export const NPS_QUESTION_ID = "q_nps";

type QuestionType = "text" | "scale" | "yesno" | "choice" | "likert";

export type PreCallQuestion = {
  id: string;
  text: string;
  description?: string;
  type: QuestionType;
  min?: number;
  max?: number;
  options?: string[];
  scaleLabels?: string[];
};

const DEFAULT_NAME = "Formulario previo a la llamada";
const DEFAULT_DESCRIPTION =
  "Preguntas que rellena el paciente antes de reservar la llamada. Sirven al fisio para preparar la conversación y a la app para calcular satisfacción y NPS del equipo. Se puede editar sin romper nada, pero si borras las preguntas 'Satisfacción con el programa' o 'Recomendación de tu fisio' las métricas dejan de recibir datos nuevos.";

export const DEFAULT_PRE_CALL_QUESTIONS: PreCallQuestion[] = [
  {
    id: "q_progress",
    type: "text",
    text: "¿Cómo estás llevando el programa hasta ahora?",
    description: "Sensaciones generales, lo que va bien y lo que no.",
  },
  {
    id: "q_goals",
    type: "text",
    text: "¿Qué objetivos tienes para las próximas semanas?",
    description: "Lo que te gustaría conseguir a corto/medio plazo.",
  },
  {
    id: "q_comments",
    type: "text",
    text: "¿Hay algo que quieras comentarle a tu fisio antes de la llamada?",
    description: "Dudas, molestias, cambios en tu rutina, etc.",
  },
  {
    id: SATISFACTION_QUESTION_ID,
    type: "scale",
    text: "Del 1 al 10, ¿cómo valorarías tu satisfacción con el programa?",
    min: 1,
    max: 10,
  },
  {
    id: NPS_QUESTION_ID,
    type: "scale",
    text: "Del 0 al 10, ¿cuánto recomendarías a tu fisio a un amigo o familiar?",
    min: 0,
    max: 10,
  },
];

/**
 * Devuelve el formulario pre-call. Lo crea con las preguntas por defecto la
 * primera vez que se usa (lazy seed) — así no depende de una migración de
 * datos y es idempotente entre entornos.
 */
export async function ensurePreCallForm() {
  const existing = await prisma.formLibrary.findUnique({
    where: { slug: PRE_CALL_FORM_SLUG },
  });
  if (existing) return existing;
  return prisma.formLibrary.create({
    data: {
      slug: PRE_CALL_FORM_SLUG,
      name: DEFAULT_NAME,
      description: DEFAULT_DESCRIPTION,
      questions: JSON.stringify(DEFAULT_PRE_CALL_QUESTIONS),
    },
  });
}

export function parsePreCallQuestions(json: string): PreCallQuestion[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * A partir de las respuestas del paciente, extrae los dos valores que
 * alimentan las métricas. Devuelve `null` si la pregunta no existe o si el
 * valor no es un número dentro de rango.
 */
export function extractScores(
  questions: PreCallQuestion[],
  answers: Record<string, unknown>,
): { satisfactionScore: number | null; npsScore: number | null } {
  return {
    satisfactionScore: readScaleAnswer(questions, answers, SATISFACTION_QUESTION_ID, 1, 10),
    npsScore: readScaleAnswer(questions, answers, NPS_QUESTION_ID, 0, 10),
  };
}

function readScaleAnswer(
  questions: PreCallQuestion[],
  answers: Record<string, unknown>,
  questionId: string,
  fallbackMin: number,
  fallbackMax: number,
): number | null {
  const question = questions.find((q) => q.id === questionId);
  if (!question || question.type !== "scale") return null;
  const raw = answers[questionId];
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const min = question.min ?? fallbackMin;
  const max = question.max ?? fallbackMax;
  if (n < min || n > max) return null;
  return Math.round(n);
}
