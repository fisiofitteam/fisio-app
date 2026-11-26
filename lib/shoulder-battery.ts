import { PILOT_PROGRAM_ID, PILOT_TESTS } from "./shoulder-pilot";
import { pilotSnapshotRefs } from "./shoulder-pilot-snapshot";
import { parseAndSortTasksSnapshot } from "./task-order";

export type BatterySession = {
  id: string;
  assignmentId: string;
  weekNumber: number;
  scheduledDate: Date;
  tasksSnapshot: string;
  assignment: { programId: string; patientId: string; program?: { isStandalone: boolean } };
};
export type BatterySource = { sessionId: string; taskId: string };
const tasksIn = (raw: string) => parseAndSortTasksSnapshot(typeof raw === "string" ? raw : JSON.stringify(raw));
const testIds = new Set(PILOT_TESTS.map(t => t.id));

// ProgramSession dates are calendar dates stored as UTC wall-clock values,
// as in CalendarView. Upload/completion dates never determine membership.
export function shoulderBatteryKey(s: BatterySession) {
  return s.assignment.programId === PILOT_PROGRAM_ID && [1, 14].includes(s.weekNumber)
    ? JSON.stringify([s.assignment.patientId, s.assignmentId, s.weekNumber, s.scheduledDate.toISOString().slice(0, 10)]) : null;
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

export function shoulderBatteryDayKey(s: BatterySession) {
  return (shoulderBatteryKey(s) || s.assignment.program?.isStandalone) && hasProtocolTest(s)
    ? JSON.stringify([s.assignment.patientId, s.scheduledDate.toISOString().slice(0, 10)]) : null;
}

function battery<T extends BatterySession>(members: T[], anchors = members) {
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
  // Legacy calendar moves created new standalone assignments. Keep the report
  // on the original program so its protocol, week and retest baseline survive.
  const session = [...anchors].sort((a, b) => a.id.localeCompare(b.id))[0];
  return { session, sessions, refs, sources, tasksSnapshot: JSON.stringify(tasks) };
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
  const anchorsPerDay = new Map<string, number>();
  for (const members of buckets.values()) {
    const day = shoulderBatteryDayKey(members[0])!;
    anchorsPerDay.set(day, (anchorsPerDay.get(day) ?? 0) + 1);
  }
  for (const members of buckets.values()) {
    const complete = members.filter(s => pilotSnapshotRefs(s.tasksSnapshot));
    if (complete.length) {
      for (const session of complete) groups.push(battery([session])!);
    } else {
      let group = battery(members);
      const day = shoulderBatteryDayKey(members[0])!;
      // Recover the old move-task representation only when exactly one original
      // battery can own these blocks. Never guess between programs/weeks, use
      // names as identifiers, or borrow another patient's deliveries.
      if (!group && anchorsPerDay.get(day) === 1 && members[0].assignment.patientId) {
        const detached = sessions.filter(s => s.assignment.program?.isStandalone &&
          !shoulderBatteryKey(s) && shoulderBatteryDayKey(s) === day);
        if (detached.length) group = battery([...members, ...detached], members);
      }
      if (group) groups.push(group);
    }
  }
  return groups;
}
