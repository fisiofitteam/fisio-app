import { PILOT_PROGRAM_ID, matchesPilotSnapshot } from "./shoulder-pilot-snapshot";
import { PILOT_TESTS } from "./shoulder-pilot";
import { parseAssessment } from "./assessments";
import { parseAndSortTasksSnapshot } from "./task-order";

const ids = new Set<string>(PILOT_TESTS.map(t => t.id));
export function isShoulderPilotTask(t: {type:string;assessment?:unknown}) {
  return t.type === "ASSESSMENT" && parseAssessment(t.assessment).tests.some(x => ids.has(x.id));
}
export function patientShoulderWeek(isTest: boolean, programId: string, week: number, raw: string): 1 | 14 | undefined {
  if (isTest && programId === PILOT_PROGRAM_ID && (week === 1 || week === 14) && matchesPilotSnapshot(raw)) return week;
}
export const patientShoulderTitle = (week: number) => week === 14 ? "Revaloración de hombro" : "Valoración inicial de hombro";

export function patientDisplayedTasks(isTest: boolean, programId: string, week: number, raw: string) {
  const tasks = parseAndSortTasksSnapshot(raw);
  if (!patientShoulderWeek(isTest, programId, week, raw)) return tasks;
  const first = tasks.find(isShoulderPilotTask);
  return tasks.flatMap(t => !isShoulderPilotTask(t) ? [t] : t === first ? [{ ...t, title: patientShoulderTitle(week) }] : []);
}
