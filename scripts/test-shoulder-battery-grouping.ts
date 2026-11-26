// Synthetic records only. Exercises the real grouping, access, save and publish services.
import assert from "node:assert/strict";
import Module from "node:module";
import { createHash } from "node:crypto";
import { groupShoulderBatteries } from "../lib/shoulder-battery";
import { PILOT_PROGRAM_ID, PILOT_TESTS, RUBRIC_VERSION, DEFAULT_PILOT_CONFIG } from "../lib/shoulder-pilot";

const blocks = [...new Set(PILOT_TESTS.map(t => t.group))].map((group, i) => ({
  id: "task-" + i, type: "ASSESSMENT", title: group, order: i,
  assessment: { tests: PILOT_TESTS.filter(t => t.group === group).map(t => ({ ...t, instructions: "", videoUrl: "" })) },
}));
const makeSession = (id: string, tasks: unknown[], changes = {}) => ({
  id, assignmentId: "assignment", scheduledDate: new Date("2026-11-16T00:00:00Z"), weekNumber: 1,
  tasksSnapshot: JSON.stringify(tasks), assignment: { id: "assignment", programId: PILOT_PROGRAM_ID, patientId: "patient", patient: { fullName: "Fixture" } },
  ...changes,
});
const split = blocks.map((block, i) => makeSession("session-" + i, [block], { scheduledDate: new Date(`2026-11-16T0${i}:00:00Z`) }));
const original = JSON.stringify(split);
const group = groupShoulderBatteries([...split].reverse())[0];
assert.equal(group.session.id, "session-0");
assert.equal(group.sources.size, 15);
assert.equal(group.sessions.length, 4);
for (const s of split) for (const t of JSON.parse(s.tasksSnapshot)[0].assessment.tests) assert.deepEqual(group.sources.get(t.id), { sessionId: s.id, taskId: JSON.parse(s.tasksSnapshot)[0].id });
assert.equal(JSON.stringify(split), original, "Do not mutate sessions, IDs or dates");
assert.equal(groupShoulderBatteries(split.slice(1)).length, 0, "No report for an incomplete battery");
assert.equal(groupShoulderBatteries([...split, makeSession("duplicate", [blocks[0]])]).length, 0, "Duplicate tests must not be picked arbitrarily");
for (const changes of [
  { assignmentId: "other-assignment" }, { scheduledDate: new Date("2026-11-17") }, { weekNumber: 14 },
  { assignment: { ...split[0].assignment, programId: "other-program" } },
]) assert.equal(groupShoulderBatteries([...split.slice(1), { ...split[0], ...changes }]).length, 0);
const complete = makeSession("complete", blocks);
assert.deepEqual(groupShoulderBatteries([...split, complete]).map(g => g.session.id), ["complete"], "Keep existing complete reports intact");
assert.equal(groupShoulderBatteries([...split, makeSession("workout", [{ id: "w", type: "WORKOUT" }])])[0].sessions.length, 4);

let sessions: any[] = split.map(s => ({ ...s }));
const videos = split.flatMap(s => JSON.parse(s.tasksSnapshot)[0].assessment.tests.map((t: any) => ({
  id: "video-" + t.id, patientId: "patient", sessionId: s.id, taskId: JSON.parse(s.tasksSnapshot)[0].id, testId: t.id,
  url: "https://fixture.private.blob.vercel-storage.com/video.mp4", uploadedAt: new Date("2026-11-14T10:00:00Z"), reviewedAt: null,
})));
const videoIds = videos.map(v => v.id);
const rows: Record<string, any> = {};
let actor: any = { kind: "professional", pro: { id: "staff" } };
let mutateDuringTransaction = false;
let shared: any = null;
const protocol = { rubricVersion: RUBRIC_VERSION, configJson: JSON.stringify(DEFAULT_PILOT_CONFIG) };
const db: any = {
  programSession: {
    findUnique: async ({ where }: any) => sessions.find(s => s.id === where.id) ?? null,
    findMany: async ({ where }: any) => sessions.filter(s => s.assignmentId === where.assignmentId &&
      (typeof where.weekNumber !== "number" || s.weekNumber === where.weekNumber) &&
      (!where.scheduledDate || s.scheduledDate >= where.scheduledDate.gte && s.scheduledDate < where.scheduledDate.lt))
      .map(s => ({ ...s, shoulderPilotReview: rows[s.id] ?? null })),
  },
  shoulderPilotProtocol: { findUnique: async () => protocol, upsert: async () => protocol },
  shoulderPilotReview: {
    findUnique: async ({ where }: any) => rows[where.sessionId] ?? null,
    findFirst: async ({ where }: any) => {
      const prior = sessions.find(s => s.assignmentId === where.session.assignmentId && s.weekNumber === 1 &&
        s.scheduledDate <= where.session.scheduledDate.lte && rows[s.id]?.publishedAt);
      return prior ? { ...rows[prior.id], session: prior } : null;
    },
    upsert: async ({ where }: any) => rows[where.sessionId] ??= { sessionId: where.sessionId, version: 0 },
    updateMany: async ({ where, data }: any) => {
      const row = rows[where.sessionId];
      if (row?.version !== where.version) return { count: 0 };
      Object.assign(row, data, { version: row.version + data.version.increment });
      return { count: 1 };
    },
  },
  assessmentVideo: {
    findMany: async ({ where }: any) => [...videos, { ...videos[0], id: "wrong-source", sessionId: "session-3" }].filter(v =>
      v.patientId === where.patientId && (typeof where.sessionId === "string" ? v.sessionId === where.sessionId : where.sessionId.in.includes(v.sessionId))),
    updateMany: async ({ where, data }: any) => {
      const chosen = videos.filter(v => where.id.in.includes(v.id) && where.sessionId.in.includes(v.sessionId));
      for (const v of chosen) Object.assign(v, data);
      return { count: chosen.length };
    },
  },
  $executeRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
    if(strings.join("").startsWith('INSERT INTO')){
      const [sessionId,patientId,assignmentId,tokenHash,issuedAt,publishedAt,baselinePublishedAt,expiresAt,reportJson]=values;
      shared={sessionId,patientId,assignmentId,tokenHash,reportJson,publishedAt:new Date(publishedAt+"Z"),expiresAt:new Date(expiresAt+"Z")};
    } else shared=null;
    return 1;
  },
  $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
    if(!shared)return [];
    if(strings.join("").includes('SELECT sh.')) {
      if(shared.tokenHash!==values[0])return [];
      return [{reportJson:shared.reportJson,sessionId:shared.sessionId,tasksSnapshot:sessions.find(s=>s.id===shared.sessionId).tasksSnapshot}];
    }
    return [shared];
  },
  patient: { findUnique: async () => ({ anamnesisData: null }) },
  $transaction: async (fn: any) => {
    if (mutateDuringTransaction) sessions[3] = { ...sessions[3], scheduledDate: new Date("2026-11-17") };
    return fn(db);
  },
};
const oldLoad = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: any[]) {
  const mocks: Record<string, unknown> = {
    prisma: { prisma: db }, session: { getSessionUser: async () => actor },
    "patient-evidence": { canAccessEvidencePatient: async (patientId: string, pro: any) => patientId === "patient" && pro.id === "staff" },
    "onboarding-config": { getOnboardingConfig: async () => ({ anamnesisSteps: [] }) },
  };
  for (const [suffix, value] of Object.entries(mocks)) if (id.endsWith("/lib/" + suffix) || id.endsWith("/lib/" + suffix + ".ts")) return value;
  return oldLoad.call(this, id, ...args);
};

async function main() {
  const service = await import("../lib/shoulder-pilot-server");
  const guards = await import("../lib/shoulder-battery-server");
  const denied = (status: number) => (e: any) => e instanceof service.PilotHttpError && e.status === status;
  for (const s of split) {
    const view: any = await service.getPilotView(s.id);
    assert.equal(view.sessionId, "session-0");
    assert.equal(view.videos.length, 15, "All 15 existing uploads, including Saturday deliveries for Monday");
    assert(!view.videos.some((v: any) => v.id === "wrong-source"));
  }
  actor = { kind: "patient", patient: { id: "someone-else" } };
  await assert.rejects(service.getPilotView("session-3"), denied(404));
  actor = { kind: "patient", patient: { id: "patient" } };
  const testId = PILOT_TESTS[0].id;
  await service.updatePilot("session-3", { action: "patient", version: 0, testFeedback: { [testId]: { pain: 3, comment: "Registro de prueba" } } });
  assert.deepEqual(Object.keys(rows), ["session-0"], "Every entry writes the same canonical draft");
  assert.equal((await service.getPilotView("session-1")).testFeedback[testId].pain, 3);
  assert.equal((await service.getPilotView("session-1") as any).observations, undefined);
  actor = { kind: "professional", pro: { id: "staff" } };
  assert(await guards.groupedBatteryHasReview("session-3"));
  assert.deepEqual(await guards.reviewedBatterySessionIds("assignment"), split.map(s => s.id));
  const view: any = await service.getPilotView("session-2");
  const videoVersions = Object.fromEntries(view.videos.map((v: any) => [v.testId, v.id + "@" + v.uploadedAt]));
  const observations = { [testId]: { leftProgress: 50, rightProgress: 60 } };
  const notAssessable = Object.fromEntries(PILOT_TESTS.slice(1).map(t => [t.id, "Revisión manual pendiente de otra toma"]));
  const save = { action: "save", version: view.version, observations, notAssessable, reviewedTestIds: PILOT_TESTS.map(t => t.id), videoVersions };
  await service.updatePilot("session-2", save);
  await assert.rejects(service.updatePilot("session-1", save), denied(409));
  await service.updatePilot("session-3", { action: "publish", version: rows["session-0"].version });
  assert.equal(videos.filter(v => v.reviewedAt).length, 15, "Publication locks sources in every session");
  assert.deepEqual(videos.map(v => v.id), videoIds, "Existing upload IDs survive unchanged");
  assert.equal(Object.keys(JSON.parse(rows["session-0"].publishedJson).videoVersions).length, 15);
  actor = { kind: "patient", patient: { id: "patient" } };
  assert.equal((await service.getPilotView("session-3")).published?.testFeedback?.[testId].pain, 3);
  actor = { kind: "professional", pro: { id: "staff" } };
  const sharing=await import("../lib/shoulder-share-server");
  assert.equal(Object.keys((await sharing.getPublishedShoulderReports("session-2")).report.observations).length,1);
  const issued=await sharing.issueShoulderShare("session-3",rows["session-0"].publishedAt.toISOString());
  const token=issued.path.split("/").pop()!;
  assert.equal(shared.sessionId,"session-0");
  assert.equal(shared.tokenHash,createHash("sha256").update(token).digest("hex"));
  assert.equal((await sharing.getSharedShoulderReports(token))?.report.testFeedback?.[testId].pain,3);
  await sharing.revokeShoulderShare("session-1");
  assert.equal(await sharing.getSharedShoulderReports(token),null);
  const retest=split.map(s=>({...s,id:"retest-"+s.id,weekNumber:14,scheduledDate:new Date("2027-02-15")}));
  sessions.push(...retest);
  const followup:any=await service.getPilotView(retest[3].id);
  assert.equal(followup.baselineSessionId,"session-0");
  assert.equal(followup.baselineVideos.length,15,"Retest retrieves the complete split baseline");
  assert.equal(followup.baseline.testFeedback[testId].pain,3);
  mutateDuringTransaction = true;
  await assert.rejects(service.updatePilot("session-2", { ...save, version: rows["session-0"].version }), denied(409));
  console.log("PASS: split battery, same-day grouping, all source videos, patient/assignment isolation, one draft, optimistic concurrency, publication and calendar protection");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { (Module as any)._load = oldLoad; });
