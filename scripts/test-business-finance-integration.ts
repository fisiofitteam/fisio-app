import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "../lib/prisma";
import { computeBusinessMetrics, computeMonthlyBusinessMetrics } from "../lib/business-metrics";
import { calculateFinanceSummary, parseSpecificMonth, getPeriodRange } from "../lib/finance";
import { calculateSalesMetrics } from "../lib/sales";
import type { FinanceLedgerSources, LedgerPeriod } from "../lib/finance-ledger";

// Run with: node --import tsx scripts/test-business-finance-integration.ts
// All Prisma reads are mocked and fetch is forbidden. No DB/provider is called.
type FixtureRow = Record<string, any>;
type Fixture = Omit<FinanceLedgerSources, "renewals"> & {
  renewals: readonly (LedgerPeriod & { endDate?: Date; status?: string })[];
  inputs?: FixtureRow[];
  leads?: FixtureRow[];
  professionals?: FixtureRow[];
  patients?: FixtureRow[];
};
const date = (value: string) => new Date(value);
const monthRange = (year: number, month: number) => [
  new Date(Date.UTC(year, month, 1)), new Date(Date.UTC(year, month + 1, 1) - 1),
] as const;
const yearRange = (year: number) => [
  new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1) - 1),
] as const;

function matches(row: FixtureRow, where: FixtureRow | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return (condition as FixtureRow[]).some((clause) => matches(row, clause));
    if (key === "AND") return (condition as FixtureRow[]).every((clause) => matches(row, clause));
    const actual = row[key];
    if (condition == null || typeof condition !== "object" || condition instanceof Date) {
      return actual === condition;
    }
    return Object.entries(condition).every(([operator, expected]) => {
      if (operator === "in") return (expected as unknown[]).includes(actual);
      if (operator === "not") return actual !== expected;
      if (operator === "gte") return actual != null && actual >= (expected as any);
      if (operator === "lte") return actual != null && actual <= (expected as any);
      return matches(actual ?? {}, { [operator]: expected });
    });
  });
}

function installFixture(t: TestContext, fixture: Fixture) {
  const savedFixture = structuredClone(fixture);
  const withPatient = (row: FixtureRow) => ({
    ...row, patient: { isTest: row.isTest ?? false, assignedProfessionalId: "coach" },
  });
  const patch = (delegate: object, method: string, handler: (args: any) => Promise<unknown>) => {
    // Prisma delegates expose methods through a Proxy; their own descriptors
    // contain undefined, which node:test mock.method cannot replace directly.
    const target = delegate as Record<string, (args: any) => Promise<unknown>>;
    const original = target[method];
    target[method] = handler;
    t.after(() => { target[method] = original; });
    assert.equal(target[method], handler, `Prisma ${method} read must be mocked before testing`);
  };
  const read = (rows: readonly FixtureRow[]) => async (args: any = {}) =>
    structuredClone(rows.filter((row) => matches(row, args.where)));

  patch(prisma.transaction, "findMany", read(fixture.transactions));
  patch(prisma.sale, "findMany", read(fixture.sales.map(withPatient)));
  patch(prisma.renewalCheckout, "findMany", read(fixture.checkouts.map(withPatient)));
  patch(prisma.subscriptionRenewal, "findMany", read(fixture.renewals.map(withPatient)));
  patch(prisma.businessMonthlyInput, "findMany", read(fixture.inputs ?? []));
  patch(prisma.lead, "findMany", read(fixture.leads ?? []));
  patch(prisma.lead, "count", async (args: any) =>
    (fixture.leads ?? []).filter((row) => matches(row, args.where)).length);
  patch(prisma.professional, "findMany", read(fixture.professionals ?? []));
  patch(prisma.patient, "findMany", read(fixture.patients ?? []));
  patch(prisma.transaction, "groupBy", async (args: any) => {
    const grouped = new Map<string | null, number>();
    for (const row of fixture.transactions.filter((tx) => matches(tx, args.where))) {
      grouped.set(row.patientId, (grouped.get(row.patientId) ?? 0) + row.amount);
    }
    return [...grouped].map(([patientId, amount]) => ({ patientId, _sum: { amount } }));
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected provider/network call in a read-only metrics test");
  });
  // Test cleanup restores methods even on failure. Assert the actual
  // source rows remain untouched as well as forbidding database/network IO.
  t.after(() => assert.deepEqual(fixture, savedFixture));
}

function program(
  paidAt: string, receiptDates: string[], amountCents = 120000,
  receiptAmounts = [400, 400, 400],
): Fixture {
  const at = date(paidAt);
  return {
    sales: [{ id: "sale", patientId: "patient", closerId: "closer", status: "paid",
      paidAt: at, amountCents, programType: "RECUPERA", durationMonths: 4, isReservation: false }],
    checkouts: [],
    renewals: [{ id: "initial", patientId: "patient", amountPaid: amountCents / 100,
      decidedAt: at, startDate: at, programType: "RECUPERA", periodMonths: 4, isReservation: false }],
    transactions: receiptDates.map((value, index) => ({
      id: `receipt-${index}`, type: "income_new", amount: receiptAmounts[index],
      occurredAt: date(value), patientId: "patient", professionalId: "closer",
      category: "RECUPERA 4M",
      description: `Cobro [ff-receipt:v1 provider=stripe receipt=in_${index} contract=sale:sale subscription=sub_1]`,
    })),
  };
}

test("integration: one 1200 contract, three 400 cash months, one annual alta", async (t) => {
  const fixture = program("2025-01-05T12:00:00Z", [
    "2025-01-05T12:00:00Z", "2025-02-05T12:00:00Z", "2025-03-05T12:00:00Z",
  ]);
  installFixture(t, fixture);
  const grid = await computeMonthlyBusinessMetrics(2025);
  assert.equal(grid.months.length, 12);
  assert.deepEqual(grid.months.slice(0, 3).map((row) => ({
    billed: row.billed, cash: row.income, altas: row.altasCount,
  })), [
    { billed: 1200, cash: 400, altas: 1 },
    { billed: 0, cash: 400, altas: 0 },
    { billed: 0, cash: 400, altas: 0 },
  ]);
  assert.deepEqual(grid.annual.altasByProgram, { RECUPERA: 1 });
  assert.deepEqual(grid.annual.altasRevenueByProgram, { RECUPERA: 1200 });
  assert.equal(grid.annual.altasCount, 1);
  assert.equal(grid.annual.billed, 1200);
  assert.equal(grid.annual.income, 1200);
  for (let month = 0; month < 3; month++) {
    const summary = await calculateFinanceSummary(...monthRange(2025, month));
    const business = await computeBusinessMetrics(...monthRange(2025, month));
    assert.equal(summary.billed, grid.months[month].billed);
    assert.equal(summary.income, grid.months[month].income);
    assert.equal(summary.countNew, grid.months[month].altasCount);
    assert.equal(business.billed, summary.billed);
    assert.equal(business.income, summary.income);
    assert.equal(business.newAltas, summary.countNew);
    assert.equal(business.newSaleRevenue, month === 0 ? 1200 : 0);
    assert.equal(business.ticketAvg, month === 0 ? 1200 : null);
    assert.equal(business.closerCommission, month === 0 ? 120 : 0);
  }
  const annual = await calculateFinanceSummary(...yearRange(2025));
  assert.equal(annual.billed, grid.annual.billed);
  assert.equal(annual.income, grid.annual.income);
  assert.equal(annual.countNew, grid.annual.altasCount);
  assert.equal(annual.collectedCountNew, 3);
});

test("integration: installments cross years without another sale or boundary loss", async (t) => {
  installFixture(t, program("2024-12-31T23:59:59.999Z", [
    "2024-12-31T23:59:59.999Z", "2025-01-01T00:00:00.000Z", "2025-02-01T00:00:00.000Z",
  ]));
  const firstYear = await computeMonthlyBusinessMetrics(2024);
  const secondYear = await computeMonthlyBusinessMetrics(2025);
  assert.deepEqual([firstYear.annual.billed, firstYear.annual.income, firstYear.annual.altasCount], [1200, 400, 1]);
  assert.deepEqual([secondYear.annual.billed, secondYear.annual.income, secondYear.annual.altasCount], [0, 800, 0]);
  assert.deepEqual(secondYear.months.slice(0, 2).map((row) => row.income), [400, 400]);
  const followingYear = await computeBusinessMetrics(...yearRange(2025));
  assert.equal(followingYear.newAltas, 0);
  assert.equal(followingYear.billed, 0);
  assert.equal(followingYear.income, 800);
  const followingJanuary = await calculateFinanceSummary(...monthRange(2025, 0));
  assert.equal(followingJanuary.billedNew, 0);
  assert.equal(followingJanuary.incomeNew, 400);
});

test("integration: cents and expenses reconcile between monthly grid and annual summary", async (t) => {
  const fixture = program("2025-01-01T00:00:00Z", [
    "2025-01-01T00:00:00Z", "2025-02-01T00:00:00Z", "2025-03-01T00:00:00Z",
  ], 100001, [333.33, 333.33, 333.35]);
  fixture.transactions = [...fixture.transactions, {
    id: "expense", type: "expense", amount: 0.03,
    occurredAt: date("2025-01-31T23:59:59.999Z"), patientId: null, professionalId: null,
  }];
  installFixture(t, fixture);
  const grid = await computeMonthlyBusinessMetrics(2025);
  const annual = await calculateFinanceSummary(...yearRange(2025));
  assert.equal(grid.annual.billed, 1000.01);
  assert.equal(grid.annual.income, 1000.01);
  assert.equal(grid.months[0].expense, 0.03);
  assert.equal(grid.months[0].profit, 333.30);
  assert.equal(grid.annual.profit, 999.98);
  assert.equal(annual.billed, grid.annual.billed);
  assert.equal(annual.income, grid.annual.income);
  assert.equal(annual.expense, grid.annual.expense);
  assert.equal(annual.profit, grid.annual.profit);
});

test("integration: retention decisions do not manufacture renewal cash", async (t) => {
  const fixture = program("2024-09-01T00:00:00Z", ["2024-09-01T00:00:00Z"], 120000, [1200]);
  fixture.renewals = [
    { ...fixture.renewals[0], endDate: date("2025-01-01T00:00:00Z"), status: "finished" },
    { id: "follow-up", patientId: "patient", amountPaid: 900,
      decidedAt: date("2025-01-01T00:00:00Z"), startDate: date("2025-01-01T00:00:00Z"),
      endDate: date("2025-07-01T00:00:00Z"), status: "active", programType: "CONSOLIDA",
      periodMonths: 6, isReservation: false },
  ];
  fixture.patients = [{ id: "patient", assignedProfessionalId: "coach", isTest: false }];
  installFixture(t, fixture);
  const monthly = await computeMonthlyBusinessMetrics(2025);
  const summary = await computeBusinessMetrics(...monthRange(2025, 0));
  assert.equal(monthly.months[0].renewedCount, 1);
  assert.equal(monthly.months[0].billedRenewal, 900);
  assert.equal(monthly.months[0].incomeRenewal, 0);
  assert.equal(summary.renewedCount, 1);
  assert.equal(summary.billedRenewal, 900);
  assert.equal(summary.income, 0);
  assert.equal(summary.newAltas, 0);
});

test("integration: sales confirmed after the won decision stay in their billing month and closer", async (t) => {
  const fixture = program("2025-02-05T12:00:00Z", ["2025-02-05T12:00:00Z"], 120000, [400]);
  fixture.leads = [{
    id: "lead", closerId: "closer", status: "won",
    callScheduledAt: date("2025-01-30T12:00:00Z"), decidedAt: date("2025-01-31T12:00:00Z"),
    convertedPatient: { id: "patient", programType: "RECUPERA" },
  }];
  installFixture(t, fixture);
  const january = await calculateSalesMetrics(...monthRange(2025, 0), "closer");
  const february = await calculateSalesMetrics(...monthRange(2025, 1), "closer");
  const otherCloser = await calculateSalesMetrics(...monthRange(2025, 1), "someone-else");
  assert.equal(january.won, 1);
  assert.equal(january.revenue, 0);
  assert.equal(january.ticketAvg, null);
  assert.equal(february.won, 0);
  assert.equal(february.revenue, 1200);
  assert.equal(february.ticketAvg, 1200);
  assert.equal(otherCloser.revenue, 0);
});

test("integration: a receipt at the final millisecond of a reporting period is retained", async (t) => {
  const ranges = [parseSpecificMonth("2024-02")!, ...(["month", "quarter", "year"] as const).map(getPeriodRange)];
  const fixture: Fixture = {
    sales: [], checkouts: [], renewals: [],
    transactions: ranges.map((range, index) => ({
      id: `boundary-${index}`, type: "income_other", amount: 17.25,
      occurredAt: range.end, patientId: null, professionalId: null,
      category: null, description: "Movimiento manual",
    })),
  };
  installFixture(t, fixture);
  for (const range of ranges) {
    assert.equal(range.end.getMilliseconds(), 999);
    const expected = fixture.transactions.filter((tx) => tx.occurredAt >= range.start && tx.occurredAt <= range.end)
      .reduce((sum, tx) => sum + tx.amount, 0);
    const summary = await calculateFinanceSummary(range.start, range.end);
    assert.equal(summary.income, expected);
  }
});
