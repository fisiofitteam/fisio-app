import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
let actor: any = { id: "owner", role: "fisio", extraRoles: [], isManager: false };
let row: any = { id: "e1", patientId: null, createdById: "owner", status: "ready", bodyZone: null, kind: "whatsapp", textContent: "test" };
const original = (Module as any)._load;
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request.endsWith("/lib/session") || request.endsWith("/lib/session.ts")) return { getActiveProfessional: async () => actor };
  return original.call(this, request, ...args);
};
(globalThis as any).prisma = { patientEvidence: {
  findUnique: async () => ({ ...row }),
  updateMany: async ({ where, data }: any) => {
    if (!Object.entries(where).every(([key, value]) => row[key] === value)) return { count: 0 };
    row = { ...row, ...data }; return { count: 1 };
  },
} };
const params = { params: { id: "e1" } };
const req = (body: any, method = "PATCH") => new NextRequest("https://example.test/api/testimonials/e1", { method, body: JSON.stringify(body) });
async function main() {
  const api = await import("../app/api/testimonials/[id]/route");
  actor.id = "other";
  assert.equal((await api.DELETE(req({}, "DELETE"), params)).status, 403);
  assert.equal((await api.PATCH(req({ bodyZone: "hombro" }), params)).status, 403);
  actor.id = "owner";
  assert.equal((await api.PATCH(req({ bodyZone: "unknown" }), params)).status, 400);
  for (const bodyZone of ["hombro", "lumbar", "rodilla", "otro", null]) {
    assert.equal((await api.PATCH(req({ bodyZone }), params)).status, 200);
    assert.equal(row.bodyZone, bodyZone);
  }
  assert.equal((await api.DELETE(req({}, "DELETE"), params)).status, 200);
  assert.equal(row.status, "deleted");
  assert.equal((await api.GET(req({}), params)).status, 403);
  assert.equal((await api.PATCH(req({ url: "https://example.test/old-upload" }), params)).status, 403);
  assert.equal(row.status, "deleted", "upload confirmation cannot restore deleted evidence");
  console.log("PASS: testimonial zones, scoped deletion, deleted TXT access and no resurrection");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
