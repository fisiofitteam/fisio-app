import assert from "node:assert/strict";
import { patientDisplayedTasks, patientShoulderWeek } from "../lib/patient-shoulder-session";
import { PILOT_PROGRAM_ID, PILOT_TESTS } from "../lib/shoulder-pilot";

const groups = [...new Set(PILOT_TESTS.map(t => t.group))];
const tasks = groups.map((group, order) => ({
  id: "task-" + order, type: "ASSESSMENT", title: group, order,
  assessment: { instructions: "", tests: PILOT_TESTS.filter(t => t.group === group).map(t => ({ id: t.id, name: t.name, instructions: "", videoUrl: "" })) },
}));
const raw = JSON.stringify(tasks);
assert.equal(tasks.length, 4);
assert.equal(patientShoulderWeek(PILOT_PROGRAM_ID, 1, raw), 1);
assert.equal(patientShoulderWeek(PILOT_PROGRAM_ID, 14, raw), 14);
assert.equal(patientDisplayedTasks(PILOT_PROGRAM_ID, 1, raw).length, 1, "All four blocks become one valuation without requiring a test-account flag");
assert.equal(patientDisplayedTasks(PILOT_PROGRAM_ID, 1, raw)[0].title, "Valoración inicial de hombro");
assert.equal(patientDisplayedTasks(PILOT_PROGRAM_ID, 14, raw)[0].title, "Revaloración de hombro");
assert.equal(patientDisplayedTasks("other-program", 1, raw).length, 4, "Other protocols keep their normal view");
assert.equal(patientShoulderWeek(PILOT_PROGRAM_ID, 2, raw), undefined);
assert.equal(patientShoulderWeek("other-program", 1, raw), undefined);
const partial = JSON.stringify(tasks.slice(1));
assert.equal(patientShoulderWeek(PILOT_PROGRAM_ID, 1, partial), undefined, "Do not enable a report for an incomplete battery");
assert.equal(patientShoulderWeek(PILOT_PROGRAM_ID, 1, JSON.stringify([...tasks, tasks[0]])), undefined, "Duplicate protocol tests cannot produce an ambiguous report");
const extra = { id: "extra", type: "VIDEO", title: "Instrucciones", order: 8 };
const combined = patientDisplayedTasks(PILOT_PROGRAM_ID, 1, JSON.stringify([...tasks, extra]));
assert.equal(combined.length, 2);
assert.equal(combined[1].id, extra.id, "Unrelated activities in the session remain visible");
assert.equal(JSON.parse(raw).length, 4, "Grouping never changes stored task or test IDs");
console.log("PASS: unified initial/retest for ordinary patients, complete protocol matching and unrelated activities preserved");
