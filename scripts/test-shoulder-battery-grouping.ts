// Synthetic records only. Exercises the real grouping, access, save and publish services.
import assert from "node:assert/strict";
import Module from "node:module";
import { createHash } from "node:crypto";
import { groupShoulderBatteries } from "../lib/shoulder-battery";
import { pendingSources } from "../lib/shoulder-analysis-queue";
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

// Reproduce calendar moves: one original block + three distinct standalone
// assignments, all on the same day. No real patient data is used.
const detached = split.map((s, i) => i === 0 ? s : ({ ...s, assignmentId: "detached-" + i,
  assignment: { ...s.assignment, id: "detached-" + i, programId: "standalone-" + i, program: { isStandalone: true } } }));
const recovered = groupShoulderBatteries(detached)[0];
assert.equal(recovered.session.id, "session-0");
assert.equal(recovered.sources.size, 15);
assert.equal(groupShoulderBatteries(detached.map(s => s.id === "session-1" ? { ...s, id: "aaa-earlier" } : s))[0].session.id, "session-0", "Anchor is the original program, not the earliest standalone ID");
assert.equal(groupShoulderBatteries(detached.map(s => s.id === "session-1" ? { ...s, assignment: { ...s.assignment, patientId: "other" } } : s)).length, 0);
assert.equal(groupShoulderBatteries([...detached, { ...split[0], id: "other-initial", assignmentId: "other" }]).length, 0, "Two potential parent assignments are ambiguous");
assert.equal(groupShoulderBatteries([...detached, { ...split[0], id: "same-day-retest", weekNumber: 14 }]).length, 0, "Never guess initial versus retest");
assert.equal(groupShoulderBatteries([...detached, { ...detached[1], id: "duplicate" }]).length, 0);
assert.equal(groupShoulderBatteries(detached.slice(1)).length, 0, "Standalone tests need an original program anchor");
assert.deepEqual(groupShoulderBatteries([...detached, complete]).map(g => g.session.id), ["complete"]);
const unrelated = makeSession("ankle", [{ id: "ankle-task", type: "ASSESSMENT", assessment: { tests: [{ id: "ankle-test" }] } }],
  { assignmentId: "ankle", assignment: { ...split[0].assignment, programId: "ankle-program" } });
assert.equal(groupShoulderBatteries([...detached, unrelated])[0].sources.size, 15);
const fixture = process.env.SPLIT_STANDALONE === "1" ? detached : split;
let sessions: any[] = fixture.map(s => ({ ...s }));
const videos = fixture.flatMap(s => JSON.parse(s.tasksSnapshot)[0].assessment.tests.map((t: any) => ({
  id: "video-" + t.id, patientId: "patient", sessionId: s.id, taskId: JSON.parse(s.tasksSnapshot)[0].id, testId: t.id,
  url: `https://fixture.private.blob.vercel-storage.com/assessments/video-${t.id}/504587d4-c0f6-4f5b-a8e5-c54c7396fdca.mp4`, uploadedAt: new Date("2026-11-14T10:00:00Z"), reviewedAt: null,
})));
const videoIds = videos.map(v => v.id);
const rows: Record<string, any> = {};
let actor: any = { kind: "professional", pro: { id: "staff" } };
let mutateDuringTransaction = false;
let shared: any = null;
const protocol = { rubricVersion: RUBRIC_VERSION, configJson: JSON.stringify(DEFAULT_PILOT_CONFIG) };
function matchesSession(s: any, where: any): boolean {
  if (where.OR && !where.OR.some((w: any) => matchesSession(s, w))) return false;
  if (where.assignmentId && s.assignmentId !== where.assignmentId) return false;
  if (where.assignment?.patientId && s.assignment.patientId !== where.assignment.patientId) return false;
  if (where.assignment?.OR && !where.assignment.OR.some((w: any) => (w.programId && w.programId === s.assignment.programId) || (w.program && w.program.isStandalone === s.assignment.program?.isStandalone))) return false;
  if (typeof where.weekNumber === "number" && s.weekNumber !== where.weekNumber) return false;
  return !where.scheduledDate || s.scheduledDate >= where.scheduledDate.gte && s.scheduledDate < where.scheduledDate.lt;
}
const db: any = {
  programSession: {
    findUnique: async ({ where }: any) => sessions.find(s => s.id === where.id) ?? null,
    findMany: async ({ where }: any) => sessions.filter(s => matchesSession(s, where))
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
    assert.equal(pendingSources(view.videos, view.sessionId, [], {}, {}, false).length, 15,
      "The client analysis queue must see every grouped delivery, not just the anchor's videos");
    for (const test of PILOT_TESTS) {
      // This is also the editor's source lookup for each video player.
      const source = view.videos.find((v: any) => v.sessionId === view.sessionId && v.testId === test.id);
      assert(source, "Every test must have a playable source in the report scope");
      assert.equal(source.sourceSessionId, videos.find(v => v.id === source.id)!.sessionId,
        "Retain the original stored source independently of the report scope");
    }
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
  for (const assignmentId of new Set(fixture.map(s => s.assignmentId)))
    assert.deepEqual(await guards.reviewedBatterySessionIds(assignmentId), fixture.filter(s => s.assignmentId === assignmentId).map(s => s.id));
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
  const retest=fixture.map(s=>({...s,id:"retest-"+s.id,weekNumber:s.assignmentId==="assignment"?14:1,scheduledDate:new Date("2027-02-15")}));
  sessions.push(...retest);
  const followup:any=await service.getPilotView(retest[3].id);
  assert.equal(followup.weekNumber,14,"Standalone week 1 still resolves to the original week-14 retest");
  assert.equal(followup.baselineSessionId,"session-0");
  assert.equal(followup.baselineVideos.length,15,"Retest retrieves the complete split baseline");
  assert(followup.baselineVideos.every((v:any)=>v.sessionId==="session-0"&&v.sourceSessionId),"Baseline players keep their own report scope and original source");
  assert.equal(followup.baseline.testFeedback[testId].pain,3);
  mutateDuringTransaction = true;
  await assert.rejects(service.updatePilot("session-2", { ...save, version: rows["session-0"].version }), denied(409));
  console.log(process.env.SPLIT_STANDALONE === "1" ? "LEGACY STANDALONE" : "SAME ASSIGNMENT");
  console.log("PASS: split battery, same-day grouping, all source videos, patient/assignment isolation, one draft, optimistic concurrency, publication and calendar protection");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { (Module as any)._load = oldLoad; });
