// Exercise the actual calendar endpoint with synthetic sessions, no database.
import assert from "node:assert/strict";
import Module from "node:module";
import { PILOT_PROGRAM_ID, PILOT_TESTS } from "../lib/shoulder-pilot";
import { groupShoulderBatteries } from "../lib/shoulder-battery";

const blocks = [...new Set(PILOT_TESTS.map(t => t.group))].map((group, i) => ({
  id: "task-" + i, type: "ASSESSMENT", assessment: { tests: PILOT_TESTS.filter(t => t.group === group) },
}));
let sessions: any[] = [], transfers: any[] = [], standaloneCreates = 0;
let allowed = true, reviewed = false;
const db: any = {
  programSession: {
    findUnique: async ({ where }: any) => sessions.find(s => s.id === where.id),
    create: async ({ data }: any) => {
      const row = { ...data, id: "moved-" + sessions.length, assignment: sessions[0].assignment };
      sessions.push(row); return row;
    },
    update: async ({ where, data }: any) => Object.assign(sessions.find(s => s.id === where.id), data),
    delete: async ({ where }: any) => { sessions = sessions.filter(s => s.id !== where.id); },
  },
  program: { create: async () => { standaloneCreates++; return { id: "standalone" }; } },
  programWeek: { create: async () => ({ id: "week" }) },
  programDay: { create: async () => ({}) },
  programAssignment: { create: async () => ({ id: "standalone-assignment" }) },
  assessmentVideo: { updateMany: async (args: any) => { transfers.push(args); return { count: 1 }; } },
};
db.$transaction = (fn: any) => fn(db);
const oldLoad = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: any[]) {
  const mocks: Record<string, unknown> = {
    prisma: { prisma: db }, session: { getActiveProfessional: async () => ({ id: "staff" }) },
    "patient-evidence": { canAccessEvidencePatient: async () => allowed },
    "shoulder-battery-server": { groupedBatteryHasReview: async () => reviewed },
  };
  for (const [name, value] of Object.entries(mocks)) if (id.endsWith("/lib/" + name)) return value;
  return oldLoad.call(this, id, ...args);
};

async function main() {
  const { POST } = await import("../app/api/sessions/move-task/route");
  const move = (taskId: string, date = "2026-11-25T00:00:00Z") => POST({ json: async () => ({ sessionId: "original", taskId, targetDate: date }) } as any);
  for (const weekNumber of [1, 14]) {
    sessions = [{ id: "original", assignmentId: "assignment", weekNumber, scheduledDate: new Date("2026-11-25"),
      tasksSnapshot: JSON.stringify(blocks), assignment: { patientId: "patient", programId: PILOT_PROGRAM_ID } }];
    transfers = [];
    allowed = false;
    assert.equal((await move(blocks[0].id)).status, 403);
    allowed = true; reviewed = true;
    assert.equal((await move(blocks[0].id)).status, 409);
    reviewed = false;
    assert.equal((await move(blocks[0].id, "invalid")).status, 400);
    for (const block of blocks.slice(0, 3)) assert.equal((await move(block.id)).status, 200);
    assert.equal(standaloneCreates, 0, "Shoulder moves must not create new programs or assignments");
    assert.equal(sessions.length, 4);
    assert(sessions.every(s => s.assignmentId === "assignment" && s.weekNumber === weekNumber));
    const group = groupShoulderBatteries(sessions)[0];
    assert.equal(group.sources.size, 15);
    assert.equal(group.session.weekNumber, weekNumber);
    assert.equal(transfers.length, 3);
    for (const transfer of transfers) {
      assert.equal(transfer.where.sessionId, "original");
      assert(sessions.some(s => s.id === transfer.data.sessionId && JSON.parse(s.tasksSnapshot)[0].id === transfer.data.taskId));
    }
  }
  // Moving an unrelated activity keeps the existing standalone behavior.
  sessions[0].tasksSnapshot = JSON.stringify([{ id: "workout", type: "WORKOUT" }]);
  assert.equal((await move("workout")).status, 200);
  assert.equal(standaloneCreates, 1);
  assert.equal(sessions.at(-1).assignmentId, "standalone-assignment");
  console.log("PASS: initial/retest calendar moves preserve assignment, week and video links; authorization, review guard and unrelated moves retained");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { (Module as any)._load = oldLoad; });
