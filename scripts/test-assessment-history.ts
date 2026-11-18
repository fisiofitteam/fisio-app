import assert from "node:assert/strict";
import { isUpcomingAssessment, partitionAssessmentHistory } from "../lib/assessment-history";

const now = new Date("2026-11-17T18:00:00Z");
const initial = { id: "initial", date: new Date("2026-11-16T00:00:00Z"), completedAt: new Date("2026-11-14T11:34:00Z"), hasDelivery: true };
const retest = { id: "retest", date: new Date("2027-02-15T00:00:00Z"), hasDelivery: false };
const deliveredEarly = { id: "early", date: new Date("2026-11-20T00:00:00Z"), hasDelivery: true };
const completedEarly = { id: "completed", date: new Date("2026-11-19T00:00:00Z"), completedAt: now, hasDelivery: false };
const dueToday = { id: "today", date: new Date("2026-11-17T21:00:00Z"), hasDelivery: false };
const dueTomorrow = { id: "tomorrow", date: new Date("2026-11-18T00:00:00Z"), hasDelivery: false };

const items = [retest, initial, dueTomorrow, completedEarly, dueToday, deliveredEarly];
const { current, upcoming } = partitionAssessmentHistory(items, now);
assert.deepEqual(current.map(x => x.id), ["early", "completed", "today", "initial"]);
assert.deepEqual(upcoming.map(x => x.id), ["tomorrow", "retest"]);
assert.equal(items[0], retest, "Partitioning must not mutate the caller's groups");
assert.equal(isUpcomingAssessment(initial, now), false);
assert.equal(isUpcomingAssessment(deliveredEarly, now), false, "A future session with one received video is visible now");
assert.equal(isUpcomingAssessment(completedEarly, now), false, "A completed future session is visible without videos");

// Use the Madrid calendar day, including during summer time and after UTC midnight.
assert.equal(isUpcomingAssessment({ date: new Date("2026-11-18T12:00:00Z") }, new Date("2026-11-17T23:30:00Z")), false);
assert.equal(isUpcomingAssessment({ date: new Date("2026-07-18T12:00:00Z") }, new Date("2026-07-17T22:30:00Z")), false);
assert.equal(isUpcomingAssessment({ date: new Date("2026-11-18T00:00:00Z") }, new Date("2026-11-17T22:30:00Z")), true);

// Hundreds of untouched future groups cannot precede an initial delivery in the visible section.
const manyRetests = Array.from({ length: 150 }, (_, i) => ({ id: "future-" + i, date: new Date(Date.UTC(2027, 0, i + 1)) }));
const many = partitionAssessmentHistory([...manyRetests, initial], now);
assert.deepEqual(many.current.map(x => x.id), ["initial"]);
assert.equal(many.upcoming.length, 150);
console.log("PASS: initial deliveries, early uploads/completions, future retests and Madrid day boundaries");
