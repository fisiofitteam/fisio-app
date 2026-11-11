import { PILOT_TESTS, PILOT_PROGRAM_ID } from "@/lib/shoulder-pilot";
export { PILOT_PROGRAM_ID };
// One ProgramSession contains the day's ordered tasks. Match immutable test IDs;
// unrelated tasks in the same session keep their normal behavior.
export function pilotSnapshotRefs(raw: unknown): Map<string, string> | null {
  try {
    const tasks: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(tasks)) return null;
    const eligible = new Set<string>(PILOT_TESTS.map(t => t.id));
    const refs = new Map<string, string>();
    for (const task of tasks) {
      if (task?.type !== "ASSESSMENT" || typeof task.id !== "string") continue;
      const def = typeof task.assessment === "string" ? JSON.parse(task.assessment) : task.assessment;
      for (const t of def?.tests || []) {
        if (!eligible.has(t?.id)) continue;
        if (refs.has(t.id)) return null;
        refs.set(t.id, task.id);
      }
    }
    return refs.size === eligible.size ? refs : null;
  } catch { return null; }
}
export const matchesPilotSnapshot = (raw: unknown) => pilotSnapshotRefs(raw) !== null;
