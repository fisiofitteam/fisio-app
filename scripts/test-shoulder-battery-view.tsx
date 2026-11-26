import assert from "node:assert/strict";
import Module from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PILOT_PROGRAM_ID, PILOT_TESTS } from "../lib/shoulder-pilot";
(globalThis as any).React = React;

const sessions = [...new Set(PILOT_TESTS.map(t => t.group))].map((group, i) => ({
  id: "s" + i, assignmentId: "a", weekNumber: 1, scheduledDate: new Date("2027-02-15"),
  assignment: { programId: PILOT_PROGRAM_ID }, completedAt: null, patientNotes: i === 2 ? "Nota conservada" : null,
  tasksSnapshot: JSON.stringify([{ id: "t" + i, type: "ASSESSMENT", title: group, assessment: { tests: PILOT_TESTS.filter(t => t.group === group) } }]),
  assessmentVideos: [{ id: "delivery" }],
}));
const videos = sessions.flatMap(s => JSON.parse(s.tasksSnapshot)[0].assessment.tests.map((t: any) => ({
  id: "v" + t.id, sessionId: s.id, taskId: JSON.parse(s.tasksSnapshot)[0].id, testId: t.id,
  url: "fixture", uploadedAt: new Date("2027-02-13"), assessedAt: s.scheduledDate, reviewedAt: null,
})));
let calls = 0;
const oldLoad = (Module as any)._load;
(Module as any)._load = function(id: string, ...args: any[]) {
  if (id.endsWith("/lib/prisma")) return { prisma: {
    programSession: { findMany: async ({ where }: any) => {
      calls++;
      // The bounded history query returns only one member; the sibling query
      // must restore the complete battery instead of truncating its tests.
      return where.AND ? calls === 1 ? [sessions[0]] : [] : sessions;
    } }, assessmentVideo: { findMany: async () => videos },
  } };
  if (id.endsWith("/components/AssessmentReview")) return { AssessmentReview: ({ row }: any) => <div data-video={row.id}>{row.testTitle}</div> };
  return oldLoad.call(this, id, ...args);
};
async function main() {
  const { PatientAssessments } = await import("../components/PatientAssessments");
  const html = renderToStaticMarkup(await PatientAssessments({ patientId: "p" }));
  assert.equal((html.match(/Abrir revisión y perfil/g) ?? []).length, 1);
  assert(html.includes('href="/fisio/valoraciones/s0"'));
  assert(html.includes("15/15 vídeos recibidos"));
  assert.equal((html.match(/data-video=/g) ?? []).length, 15);
  assert(html.includes("Nota conservada"));
  assert(!html.includes("Próximas valoraciones"), "Early deliveries are current even for a future scheduled day");
  for (const t of PILOT_TESTS) assert(html.includes(t.name.replace(/&/g, "&amp;")));
  console.log("PASS: one review entry, 15/15 videos, sibling pagination recovery, early delivery visibility and original patient notes");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { (Module as any)._load = oldLoad; });
