import { PILOT_PROGRAM_ID, PILOT_TESTS } from "./shoulder-pilot";
import { pilotSnapshotRefs } from "./shoulder-pilot-snapshot";
import { parseAndSortTasksSnapshot } from "./task-order";

export type BatterySession = {
  id: string;
  assignmentId: string;
  weekNumber: number;
  scheduledDate: Date;
  tasksSnapshot: string;
  assignment: { programId: string };
};
export type BatterySource = { sessionId: string; taskId: string };
const tasksIn = (raw: string) => parseAndSortTasksSnapshot(typeof raw === "string" ? raw : JSON.stringify(raw));
const testIds = new Set(PILOT_TESTS.map(t => t.id));

// ProgramSession dates are calendar dates stored as UTC wall-clock values,
// as in CalendarView. Upload/completion dates never determine membership.
export function shoulderBatteryKey(s: BatterySession) {
  return s.assignment.programId === PILOT_PROGRAM_ID && [1, 14].includes(s.weekNumber)
    ? JSON.stringify([s.assignmentId, s.weekNumber, s.scheduledDate.toISOString().slice(0, 10)]) : null;
}

function hasProtocolTest(s: BatterySession) {
  return tasksIn(s.tasksSnapshot).some(t => {
    if (t?.type !== "ASSESSMENT") return false;
    try {
      const def = typeof t.assessment === "string" ? JSON.parse(t.assessment) : t.assessment;
      return Array.isArray(def?.tests) && def.tests.some((test: { id: string }) => testIds.has(test?.id));
    } catch { return false; }
  });
}

function battery<T extends BatterySession>(members: T[]) {
  // Stable across query order and calendar drag order. Never move stored records.
  const sessions = [...members].sort((a, b) => a.id.localeCompare(b.id));
  const tasks = sessions.flatMap(s => tasksIn(s.tasksSnapshot));
  const refs = pilotSnapshotRefs(tasks);
  if (!refs) return null; // Missing or duplicate tests are not an unambiguous battery.
  const sources = new Map<string, BatterySource>();
  for (const s of sessions) for (const task of tasksIn(s.tasksSnapshot)) {
    if (task.type !== "ASSESSMENT") continue;
    for (const [testId, taskId] of refs) if (taskId === task.id) {
      const def = typeof task.assessment === "string" ? JSON.parse(task.assessment) : task.assessment;
      if (def?.tests?.some((t: { id: string }) => t.id === testId)) sources.set(testId, { sessionId: s.id, taskId });
    }
  }
  return { session: sessions[0], sessions, refs, sources, tasksSnapshot: JSON.stringify(tasks) };
}

/** Keep existing complete reports intact; combine only complementary partial sessions. */
export function groupShoulderBatteries<T extends BatterySession>(sessions: T[]) {
  const buckets = new Map<string, T[]>();
  for (const session of sessions) {
    const key = shoulderBatteryKey(session);
    if (!key || !hasProtocolTest(session)) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(session);
    buckets.set(key, bucket);
  }
  const groups: NonNullable<ReturnType<typeof battery<T>>>[] = [];
  for (const members of buckets.values()) {
    const complete = members.filter(s => pilotSnapshotRefs(s.tasksSnapshot));
    if (complete.length) {
      for (const session of complete) groups.push(battery([session])!);
    } else {
      const group = battery(members);
      if (group) groups.push(group);
    }
  }
  return groups;
}
