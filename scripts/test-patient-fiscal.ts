import assert from "node:assert/strict";
import Module from "node:module";
import { NextRequest } from "next/server";
let actor: any = { id: "legacy-patient" };
let saved: any;
const original = (Module as any)._load;
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request.endsWith("/lib/session") || request.endsWith("/lib/session.ts")) return { getActivePatient: async () => actor };
  return original.call(this, request, ...args);
};
(globalThis as any).prisma = { patient: { update: async (args: any) => { saved = args; return args.data; } } };
async function main() {
  const { PATCH } = await import("../app/api/patient/shipping/route");
  const send = (body: any) => PATCH(new NextRequest("https://example.test/api/patient/shipping", { method: "PATCH", body: JSON.stringify(body) }));
  for (const contractDNI of [undefined, null, "", "   ", 123, "X".repeat(31)]) {
    assert.equal((await send({ contractDNI, shippingStreet: "Prueba" })).status, 400);
    assert.equal(saved, undefined);
  }
  assert.equal((await send({ contractDNI: " 12345678z ", patientId: "other", contractSignedAt: "2026-01-01", shippingStreet: " Prueba " })).status, 200);
  assert.deepEqual(saved, { where: { id: "legacy-patient" }, data: { contractDNI: "12345678Z", shippingStreet: "Prueba" } });
  actor = null;
  assert.equal((await send({ contractDNI: "12345678Z" })).status, 403);
  console.log("PASS: required DNI, normalization, own patient only, no contract signature changes");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
