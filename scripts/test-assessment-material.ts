import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
let actor: any = { kind: "patient", patient: { id: "p1" } };
let query: any;
const original = (Module as any)._load;
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request.endsWith("/lib/session") || request.endsWith("/lib/session.ts")) return { getSessionUser: async () => actor };
  return original.call(this, request, ...args);
};
(globalThis as any).prisma = { assessmentVideo: {
  findMany: async (q: any) => { query = q; return [{ id: "v1", url: "https://secret.private.blob.vercel-storage.com/assessments/v1/video.mp4", uploadedAt: new Date("2026-10-22"), testTitle: "Test" }]; },
  count: async (q: any) => { assert.deepEqual(q.where, query.where); return 31; },
}};
async function main() {
  const { GET } = await import("../app/api/assessments/route");
  const request = () => new NextRequest("https://example.test/api/assessments?patientId=p1&material=1&page=1");
  const response = await GET(request());
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.total, 31);
  assert.equal(query.skip, 30); assert.equal(query.take, 30);
  assert.deepEqual(query.where.url, { not: null });
  assert.deepEqual(query.where.uploadedAt, { not: null });
  assert.match(data.items[0].url, /^\/api\/assessments\/media\?id=v1/);
  assert.ok(!JSON.stringify(data).includes("blob.vercel-storage.com"));
  actor = { kind: "patient", patient: { id: "p2" } };
  assert.equal((await GET(request())).status, 403);
  actor = null;
  assert.equal((await GET(request())).status, 403);
  console.log("PASS: uploaded-only material, pagination, private media URLs and patient isolation");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
