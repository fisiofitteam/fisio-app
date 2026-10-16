import assert from "node:assert/strict";
import test from "node:test";
import {
  countLeadOutcomes, groupLeadOutcomes, reconstructIntervalHealth,
} from "../lib/kpi-dashboard-calculations";

const d = (value: string) => new Date(value + "T00:00:00.000Z");

test("commercial denominators exclude pending and cancelled calls", () => {
  const counts = countLeadOutcomes(["won", "lost", "no_show", "cancelled", "scheduled", "postponed"]);
  assert.deepEqual(counts, {
    scheduled: 6, done: 2, won: 1, lost: 1, noShow: 1, cancelled: 1,
    pending: 2, showRate: 66.7, closeRate: 50,
  });
  assert.equal(countLeadOutcomes([]).showRate, null);
  assert.equal(countLeadOutcomes(["no_show", "cancelled"]).closeRate, null);
});

test("source groups preserve identifiers and the unassigned cohort", () => {
  const rows = groupLeadOutcomes([
    { groupId: "via-a", groupLabel: "Instagram", status: "won" },
    { groupId: "via-b", groupLabel: "Instagram", status: "lost" },
    { groupId: "via-a", groupLabel: "Instagram", status: "no_show" },
    { groupId: "unassigned", groupLabel: "Sin vía asignada", status: "scheduled" },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, "via-a");
  assert.equal(rows[0].scheduled, 2);
  assert.equal(rows[0].showRate, 50);
  assert.equal(rows.find((row) => row.id === "via-b")?.won, 0);
  assert.equal(rows.find((row) => row.id === "unassigned")?.pending, 1);
  assert.equal(rows.reduce((total, row) => total + row.scheduled, 0), 4);
});

test("historical snapshots deduplicate overlapping renewals and retain adjacent periods", () => {
  const health = reconstructIntervalHealth([
    { patientId: "a", startDate: d("2025-12-01"), endDate: d("2026-01-15") },
    { patientId: "a", startDate: d("2025-12-15"), endDate: d("2026-01-05") },
    { patientId: "a", startDate: d("2026-01-15"), endDate: d("2026-02-01") },
    { patientId: "b", startDate: d("2025-12-01"), endDate: d("2026-01-10") },
    { patientId: "c", startDate: d("2026-01-10"), endDate: d("2026-02-10") },
    { patientId: "d", startDate: d("2026-01-10"), endDate: d("2026-01-20") },
    { patientId: "expired-at-start", startDate: d("2025-12-01"), endDate: d("2026-01-01") },
  ], d("2026-01-01"), d("2026-01-31"), d("2026-02-10"));
  assert.deepEqual(health, {
    activeAtStart: 2, activeAtEnd: 2, additions: 1, departures: 1,
    churnRate: 50, averageActive: 2, incompleteIntervals: 0,
  });
});

test("an incomplete current period stops at today and does not count planned starts", () => {
  const health = reconstructIntervalHealth([
    { patientId: "current", startDate: d("2026-09-01"), endDate: d("2026-10-17") },
    { patientId: "planned", startDate: d("2026-10-20"), endDate: d("2026-11-20") },
    { patientId: "unknown", startDate: null, endDate: d("2026-11-01") },
  ], d("2026-10-01"), d("2026-10-31"), d("2026-10-16"));
  assert.equal(health.activeAtStart, 1);
  assert.equal(health.activeAtEnd, 1);
  assert.equal(health.additions, 0);
  assert.equal(health.departures, 0);
  assert.equal(health.churnRate, 0);
  assert.equal(health.incompleteIntervals, 1);
});

test("missing history and wholly future periods return unknown metrics", () => {
  assert.equal(reconstructIntervalHealth([], d("2026-01-01"), d("2026-01-31"), d("2026-02-01")).activeAtEnd, null);
  assert.equal(reconstructIntervalHealth([{ patientId: "a", startDate: null, endDate: d("2026-02-01") }], d("2026-01-01"), d("2026-01-31"), d("2026-02-01")).activeAtEnd, null);
  const future = reconstructIntervalHealth([
    { patientId: "a", startDate: d("2026-11-01"), endDate: d("2026-12-01") },
  ], d("2026-11-01"), d("2026-11-30"), d("2026-10-16"));
  assert.equal(future.activeAtStart, null);
  assert.equal(future.churnRate, null);
});

import { currentKpiMonth, resolveKpiMonth, resolveKpiYear } from "../lib/kpi-period";

test("month navigation keeps complete leap-month boundaries and Madrid current month", () => {
  const feb = resolveKpiMonth("2024-02");
  assert.equal(feb.start.toISOString(), "2024-02-01T00:00:00.000Z");
  assert.equal(feb.end.toISOString(), "2024-02-29T23:59:59.999Z");
  assert.equal(resolveKpiMonth("2026-12").end.toISOString(), "2026-12-31T23:59:59.999Z");
  assert.equal(currentKpiMonth(new Date("2026-09-30T22:30:00Z")), "2026-10");
  assert.equal(resolveKpiMonth("2026-13", new Date("2026-10-16T12:00:00Z")).month, "2026-10");
  assert.equal(resolveKpiYear("invalid", 2026), 2026);
  assert.equal(resolveKpiYear("2024", 2026), 2024);
});
