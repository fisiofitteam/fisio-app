import type { AdaptInput, Feedback, WodResult } from "./contracts";

export type LearningRecord = { input: AdaptInput; result: WodResult; feedback: Feedback | null };
export type LearningState = { level: number; streak: number; reason: string; hadWorsening: boolean };
// Conservative product defaults, not a validated clinical pain-monitoring protocol.
// Progression only returns to previously reported tolerance. It never prescribes kg/%.
export const LEARNING_POLICY = { highPain: 5, worseningDelta: 2, lowPain: 2, stableSessions: 3 } as const;

export function learnMovement(id: string, baseline: number, records: LearningRecord[]): LearningState {
  let level = baseline, streak = 0, reason = "", hadWorsening = false;
  for (const record of records) {
    const feedback = record.feedback;
    if (!feedback || feedback.response === "not-done" || feedback.painAfter === null) continue;
    const relevant = record.result.lines.filter(line => line.proposedMovementId === id &&
      feedback.exercises.some(e => e.key === line.key && e.performed === "as-proposed"));
    if (!relevant.length) continue;
    const before = record.input.painBefore;
    const hurt = relevant.some(line => feedback.exercises.some(e => e.key === line.key && e.hurt));
    const worse = hurt || feedback.response === "worse" || feedback.nextDay === "worse" || feedback.painAfter >= LEARNING_POLICY.highPain || feedback.painAfter - before >= LEARNING_POLICY.worseningDelta ||
      (feedback.painNextDay !== null && feedback.painNextDay - before >= LEARNING_POLICY.worseningDelta);
    if (worse) {
      level = Math.max(0, level - 1); streak = 0; hadWorsening = true;
      reason = hurt ? "Este ejercicio te molestó en un registro anterior; hemos reducido la exigencia de la propuesta." : "Registraste un empeoramiento en una sesión que incluía este ejercicio. Ajustamos por prudencia, sin atribuirle por sí solo la causa.";
      continue;
    }
    const stable = before <= LEARNING_POLICY.lowPain && feedback.painAfter <= LEARNING_POLICY.lowPain && feedback.painNextDay !== null && feedback.painNextDay <= LEARNING_POLICY.lowPain && ["same", "better"].includes(feedback.nextDay);
    streak = stable ? streak + 1 : 0;
    if (streak >= LEARNING_POLICY.stableSessions && level < baseline) {
      level++; streak = 0;
      reason = "Has registrado tres sesiones bien toleradas, incluida la respuesta al día siguiente. Recuperamos un paso, dentro de lo que ya habías indicado que tolerabas.";
    }
  }
  return { level, streak, reason, hadWorsening };
}
