import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
import { validateAssessment, assessmentTestFromSnapshot, MAX_ASSESSMENT_BYTES } from "../lib/assessments";
const assessment = { instructions: "Graba de lado", tests: [{ id: "test-1", name: "Flexión", instructions: "Tres repeticiones", videoUrl: "https://example.test/demo" }] };
const task = { id: "task-1", title: "Inicial", type: "ASSESSMENT", assessment };
let actor: any = { kind: "patient", patient: { id: "p1" } };
let row: any = null;
let blob: any = null;
const session = { id: "s1", tasksSnapshot: JSON.stringify([task]), scheduledDate: new Date("2026-10-22"), assignment: { patientId: "p1" } };
const originalLoad = (Module as any)._load;
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request.endsWith("/lib/session") || request.endsWith("/lib/session.ts")) return {
    getSessionUser: async () => actor,
    getActiveProfessional: async () => actor?.kind === "professional" ? actor.pro : null,
  };
  if (request === "@vercel/blob") return { head: async (path: string) => { assert.equal(path, blob.pathname); return blob; } };
  return originalLoad.call(this, request, ...args);
};
function matches(where: any) {
  if (!row) return false;
  return Object.entries(where).every(([k, v]) => v instanceof Date ? row[k]?.getTime() === v.getTime() : row[k] === v);
}
const db: any = {
  programSession: { findUnique: async (q: any) => q.where.id === "s1" ? session : null },
  patient: { findUnique: async () => ({ assignedProfessionalId: "physio" }) },
  patientDerivation: { findFirst: async () => null },
  assessmentVideo: {
    findUnique: async () => row ? { ...row } : null,
    findMany: async (q: any) => row ? [Object.fromEntries(Object.keys(q.select).map(k => [k, row[k]]))] : [],
    upsert: async (q: any) => {
      if (!row) row = { ...q.create, id: "v1", reviewedAt: null, uploadedAt: null, url: null, updatedAt: new Date(), coachNotes: "" };
      return { ...row };
    },
    updateMany: async (q: any) => {
      if (!matches(q.where)) return { count: 0 };
      row = { ...row, ...q.data, updatedAt: new Date(Date.now() + 1) };
      return { count: 1 };
    },
  },
};
(globalThis as any).prisma = db;
process.env.ASSESSMENT_BLOB_READ_WRITE_TOKEN = "test-only";
function req(body: any, method = "POST") { return new NextRequest("https://example.test/api/assessments", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function main() {
  assert.deepEqual(validateAssessment(assessment), assessment);
  assert.throws(() => validateAssessment({ ...assessment, tests: [...assessment.tests, ...assessment.tests] }), /Identificador/);
  assert.throws(() => validateAssessment({ tests: [{ ...assessment.tests[0], videoUrl: "javascript:alert(1)" }] }), /HTTPS/);
  assert.throws(() => assessmentTestFromSnapshot(JSON.stringify([{ ...task, type: "WORKOUT" }]), task.id, "test-1"), /solo/);
  assert.throws(() => assessmentTestFromSnapshot(session.tasksSnapshot, task.id, "unknown"), /asignado/);
  const api = await import("../app/api/assessments/route");
  const { finishAssessmentUpload } = await import("../lib/assessment-access");
  const payload = { sessionId: "s1", taskId: task.id, testId: "test-1", size: MAX_ASSESSMENT_BYTES, mimeType: "video/quicktime" };
  actor = null;
  assert.equal((await api.POST(req(payload))).status, 400, "unauthenticated cannot upload");
  actor = { kind: "patient", patient: { id: "p2" } };
  assert.equal((await api.POST(req(payload))).status, 400, "other patient cannot upload");
  actor = { kind: "patient", patient: { id: "p1" } };
  assert.equal((await api.POST(req({ ...payload, size: MAX_ASSESSMENT_BYTES + 1 }))).status, 400);
  assert.equal((await api.POST(req({ ...payload, mimeType: "image/png" }))).status, 400);
  assert.equal((await api.POST(req({ ...payload, testId: "unassigned" }))).status, 400);
  const result = await api.POST(req(payload)); assert.equal(result.status, 200, "1GB is accepted");
  const pending = await result.json();
  blob = { pathname: pending.pathname, url: "https://test.private.blob.vercel-storage.com/" + pending.pathname, size: payload.size, contentType: payload.mimeType };
  assert.equal(await finishAssessmentUpload("v1", "forged-path"), false);
  blob.size = payload.size - 1;
  await assert.rejects(finishAssessmentUpload("v1", pending.pathname), /coincide/);
  assert.equal(row.url, null, "unverified uploads are not visible");
  blob.size = payload.size;
  assert.equal(await finishAssessmentUpload("v1", pending.pathname), true);
  assert.equal(await finishAssessmentUpload("v1", pending.pathname), false, "callback is idempotent");
  assert.equal((await api.PATCH(req({ ...pending, action: "confirm" }, "PATCH"))).status, 200, "confirmation after callback succeeds");
  const previousUrl = row.url;
  const second = await (await api.POST(req({ ...payload, size: 100 }))).json();
  assert.equal(row.url, previousUrl, "replacement preserves old video until upload succeeds");
  blob = { ...blob, pathname: second.pathname, url: "https://test.private.blob.vercel-storage.com/" + second.pathname, size: 100 };
  assert.equal(await finishAssessmentUpload("v1", second.pathname), true);
  assert.notEqual(row.url, previousUrl);
  const delivered = await (await api.GET(new NextRequest("https://example.test/api/assessments?sessionId=s1"))).json();
  assert.match(delivered[0].url, /^\/api\/assessments\/media/);
  assert.equal(delivered[0].pendingPath, undefined, "internal upload data is not returned by Prisma select");
  actor = { kind: "professional", pro: { id: "other", role: "fisio", extraRoles: [], isManager: false } };
  const review = { id: "v1", action: "review", version: row.uploadedAt.toISOString(), coachNotes: "Mejor control" };
  assert.equal((await api.PATCH(req(review, "PATCH"))).status, 403);
  actor = { kind: "professional", pro: { id: "physio", role: "fisio", extraRoles: [], isManager: false } };
  assert.equal((await api.PATCH(req({ ...review, version: "2020-01-01" }, "PATCH"))).status, 409, "stale review cannot lock a replacement");
  assert.equal((await api.PATCH(req(review, "PATCH"))).status, 200);
  actor = { kind: "patient", patient: { id: "p1" } };
  assert.equal((await api.POST(req(payload))).status, 409, "reviewed deliveries are locked");
  const sessionsApi = await import("../app/api/sessions/route");
  assert.equal((await sessionsApi.POST(req({ patientId: "p1", tasksSnapshot: [task] }))).status, 403, "patient cannot prescribe their own upload slots");
  assert.equal((await sessionsApi.PATCH(req({ id: "s1", tasksSnapshot: [task] }, "PATCH"))).status, 403);
  const media = await import("../app/api/assessments/media/route");
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async (_input: any, options: any) => {
    fetches++;
    assert.equal(options.headers.Range, "bytes=0-9");
    assert.equal(options.redirect, "error");
    return new Response("0123456789", { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-9/100", "content-length": "10" } });
  };
  try {
    actor = { kind: "patient", patient: { id: "p2" } };
    assert.equal((await media.GET(new NextRequest("https://example.test/api/assessments/media?id=v1"))).status, 403);
    assert.equal(fetches, 0);
    actor = { kind: "patient", patient: { id: "p1" } };
    const stream = await media.GET(new NextRequest("https://example.test/api/assessments/media?id=v1", { headers: { range: "bytes=0-9" } }));
    assert.equal(stream.status, 206);
    assert.equal(stream.headers.get("cache-control"), "private, no-store");
    assert.equal(stream.headers.get("content-range"), "bytes 0-9/100");
    assert.equal(await stream.text(), "0123456789");
  } finally { globalThis.fetch = originalFetch; }
  console.log("PASS: assigned-test-only upload, patient isolation, 1GB boundary, MIME validation, verified completion, replacement, stale review, review lock and self-prescription denied.");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { (Module as any)._load = originalLoad; });
