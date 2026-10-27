import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "../lib/prisma";
import { PatientWodHistory } from "../components/PatientWodHistory";

// No database or patient records are touched by these rendering checks.
(globalThis as any).React = React;
async function main() {
  let count = 0;
  let records: any[] = [];
  let query: any;
  (prisma.wodLog as any).count = async (args: any) => {
    assert.equal(args.where.patientId, "patient-a");
    return count;
  };
  (prisma.wodLog as any).findMany = async (args: any) => {
    query = args;
    assert.equal(args.where.patientId, "patient-a");
    return records;
  };
  const render = async (pageParam?: string) => renderToStaticMarkup(await PatientWodHistory({ patientId: "patient-a", pageParam }));
  assert.match(await render(), /Todavía no has registrado/);
  count = 21;
  records = [{ id: "wod-a", submittedAt: new Date("2026-10-26T10:00:00Z"), completedAt: null,
    rawText: "Fran\n21-15-9", adaptedText: "Thruster 20 kg", notes: "8:30, buenas sensaciones <script>", rpe: 7, painScore: 0 }];
  const first = await render();
  assert.match(first, /Thruster 20 kg/);
  assert.match(first, /8:30, buenas sensaciones &lt;script&gt;/);
  assert.match(first, /Dolor: 0\/10/);
  assert.match(first, /Esfuerzo: 7\/10/);
  assert.match(first, /historyPage=2/);
  assert.equal(query.skip, 0);
  assert.equal(query.take, 10);
  assert.deepEqual(query.orderBy, [{ submittedAt: "desc" }, { id: "desc" }]);
  const last = await render("999");
  assert.equal(query.skip, 20);
  assert.doesNotMatch(last, /Anteriores/);
  await render("invalid");
  assert.equal(query.skip, 0);
  await render("-1");
  assert.equal(query.skip, 0);
  records[0].notes = null;
  records[0].rpe = null;
  records[0].painScore = null;
  const noNotes = await render();
  assert.match(noNotes, /No añadiste comentarios/);
  assert.doesNotMatch(noNotes, /Esfuerzo:|Dolor:/);
  console.log("PASS: empty history, own-patient queries, saved content, zero pain, escaping, pagination and missing feedback");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
