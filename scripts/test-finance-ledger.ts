import assert from "node:assert/strict";
import test from "node:test";
import { buildFinanceLedger, type FinanceLedgerSources, type LedgerSale, type LedgerPeriod,
  type LedgerCheckout, type LedgerTransaction } from "../lib/finance-ledger";
import { summarizeFinanceLedger } from "../lib/finance";

const d = (day: string) => new Date(day + "T12:00:00.000Z");
const start = new Date("2026-01-01T00:00:00.000Z");
const end = new Date("2026-01-31T23:59:59.999Z");
const sale = (id: string, overrides: Partial<LedgerSale> = {}): LedgerSale => ({
  id, patientId: "patient", closerId: "closer", status: "paid", paidAt: d("2026-01-05"),
  amountCents: 120000, programType: "RECUPERA", durationMonths: 4, isReservation: false, ...overrides,
});
const period = (id: string, overrides: Partial<LedgerPeriod> = {}): LedgerPeriod => ({
  id, patientId: "patient", amountPaid: 1200, decidedAt: d("2026-01-05"), startDate: d("2026-01-05"),
  programType: "RECUPERA", periodMonths: 4, isReservation: false, ...overrides,
});
const checkout = (id: string, overrides: Partial<LedgerCheckout> = {}): LedgerCheckout => ({
  id, patientId: "patient", createdById: "coach", status: "paid", paidAt: d("2026-01-05"),
  amountCents: 120000, programType: "RECUPERA", durationMonths: 4, isReservation: false,
  renewalId: "renewal", ...overrides,
});
const tx = (id: string, overrides: Partial<LedgerTransaction> = {}): LedgerTransaction => ({
  id, type: "income_new", amount: 400, occurredAt: d("2026-01-05"), patientId: "patient",
  professionalId: "closer", category: "RECUPERA 4M", description: "Pago vía PayPal · RECUPERA 4 meses · cuota 1/3", ...overrides,
});
const sources = (overrides: Partial<FinanceLedgerSources> = {}): FinanceLedgerSources => ({
  sales: [], checkouts: [], renewals: [], transactions: [], ...overrides,
});

test("a 1200 program billed once while three 400 receipts land in their actual months", () => {
  const data = sources({ sales: [sale("sale")], renewals: [period("initial")], transactions: [
    tx("one"), tx("two", { occurredAt: d("2026-02-05"), description: "cuota 2/3" }),
    tx("three", { occurredAt: d("2026-03-05"), description: "cuota 3/3" }),
  ] });
  const january = summarizeFinanceLedger(buildFinanceLedger(data, start, end));
  assert.equal(january.billed, 1200);
  assert.equal(january.income, 400);
  assert.equal(january.countNew, 1);
  assert.equal(january.collectedCountNew, 1);
  const february = summarizeFinanceLedger(buildFinanceLedger(data, d("2026-02-01"), d("2026-02-28")));
  assert.equal(february.billed, 0);
  assert.equal(february.income, 400);
  const year = summarizeFinanceLedger(buildFinanceLedger(data, start, d("2026-12-31")));
  assert.equal(year.billed, 1200);
  assert.equal(year.income, 1200);
  assert.equal(year.countNew, 1);
  assert.equal(year.collectedCountNew, 3);
});

test("a second confirmed contract for the same patient is not merged into the first", () => {
  const data = sources({ sales: [sale("first"), sale("second", { paidAt: d("2026-02-05"), amountCents: 90000 })],
    renewals: [period("initial"), period("second-period", { amountPaid: 900,
      decidedAt: d("2026-02-05"), startDate: d("2026-02-05") })],
    transactions: [tx("one"), tx("second-receipt", { amount: 300, occurredAt: d("2026-02-05"), description: "cuota 1/3" })],
  });
  const result = summarizeFinanceLedger(buildFinanceLedger(data, start, d("2026-12-31")));
  assert.equal(result.billed, 2100);
  assert.equal(result.countNew, 2);
  assert.equal(result.income, 700);
});

test("a newer sale does not swallow an older manual contract with the same amount", () => {
  const data = sources({ sales: [sale("new-sale", { paidAt: d("2026-06-05") })], renewals: [
    period("old-manual"), period("new-period", {
      decidedAt: new Date(d("2026-06-05").getTime() + 1), startDate: d("2026-06-05"),
    }),
  ] });
  const result = summarizeFinanceLedger(buildFinanceLedger(data, start, d("2026-12-31")));
  assert.equal(result.billed, 2400);
  assert.equal(result.countNew, 2);
});

test("a paid checkout and its exact legacy renewal are one contract across period boundaries", () => {
  const data = sources({ checkouts: [checkout("checkout", { paidAt: d("2026-01-31") })],
    renewals: [period("renewal", { decidedAt: d("2026-02-01"), startDate: d("2026-06-01") })],
    transactions: [tx("cash", { type: "income_renewal", amount: 400 })],
  });
  assert.equal(summarizeFinanceLedger(buildFinanceLedger(data, start, end)).billedRenewal, 1200);
  assert.equal(summarizeFinanceLedger(buildFinanceLedger(data, d("2026-02-01"), d("2026-02-28"))).billed, 0);
});

test("pending checkout links are not contracts and legacy totals do not become cash", () => {
  const data = sources({ sales: [sale("pending", { status: "pending" })],
    checkouts: [checkout("pending-checkout", { status: "pending", renewalId: null })],
    renewals: [period("legacy", { patientId: "legacy-patient", amountPaid: 997 })],
  });
  const ledger = buildFinanceLedger(data, start, end);
  const result = summarizeFinanceLedger(ledger);
  assert.equal(result.billed, 997);
  assert.equal(result.income, 0);
  assert.equal(ledger.legacyUnverified[0].id, "legacy");
  assert.equal(ledger.legacyUnverified[0].issue, "missing-receipt");
});

test("manual cash is preserved even for a patient who already has a contract", () => {
  const manual = tx("manual", { amount: 75, description: "Sesión adicional", category: "Sesión" });
  const data = sources({ sales: [sale("confirmed")], renewals: [period("initial")],
    transactions: [tx("actual-installment"), manual] });
  const ledger = buildFinanceLedger(data, start, end);
  const result = summarizeFinanceLedger(ledger);
  assert.equal(result.billed, 1275);
  assert.equal(result.income, 475);
  assert.ok(ledger.billedEntries.some((row) => row.id === "transaction:manual"));
  // An identical amount and instant alone are not evidence that a manual entry is duplicated.
  const sameAmount = buildFinanceLedger(sources({ sales: [sale("confirmed")], renewals: [period("initial")],
    transactions: [tx("manual-full", { amount: 1200, description: "Otro servicio contratado" })] }), start, end);
  assert.equal(summarizeFinanceLedger(sameAmount).billed, 2400);
});

test("generated one-shot and manual conversion receipts do not bill the program twice", () => {
  for (const description of ["Pago vía PayPal · RECUPERA 4 meses · paypal", "Alta - Atleta"]) {
    const data = sources({ sales: [sale("confirmed")], renewals: [period("initial")],
      transactions: [tx("full-payment", { amount: 1200, description })] });
    const result = summarizeFinanceLedger(buildFinanceLedger(data, start, end));
    assert.equal(result.billed, 1200);
    assert.equal(result.income, 1200);
  }
  const legacy = sources({ renewals: [period("initial")],
    transactions: [tx("manual-full", { amount: 1200, description: "Alta - Atleta" })] });
  const corroborated = buildFinanceLedger(legacy, start, end);
  assert.equal(summarizeFinanceLedger(corroborated).billed, 1200);
  assert.equal(corroborated.legacyUnverified.filter((row) => row.issue === "missing-receipt").length, 0);
});

test("unknown installments remain cash without inventing a full contract", () => {
  const ledger = buildFinanceLedger(sources({ transactions: [tx("orphan")] }), start, end);
  assert.equal(summarizeFinanceLedger(ledger).billed, 0);
  assert.equal(summarizeFinanceLedger(ledger).income, 400);
  assert.equal(ledger.legacyUnverified[0].source, "installment-receipt");
  assert.equal(ledger.legacyUnverified[0].issue, "contract-link");
});

test("deposit reservations and ADHOC balances are cash, not new program contracts", () => {
  const data = sources({ sales: [sale("reserve", { isReservation: true, amountCents: 10000 })],
    checkouts: [checkout("adhoc", { programType: "ADHOC", amountCents: 25000, renewalId: null })],
    renewals: [period("reserve-period", { amountPaid: 100, isReservation: true })],
    transactions: [tx("signal", { amount: 100, description: "Reserva de plaza PayPal · RECUPERA" }),
      tx("balance", { type: "income_renewal", amount: 250, category: "ADHOC", description: "Pago suelto PayPal" })],
  });
  const result = summarizeFinanceLedger(buildFinanceLedger(data, start, end));
  assert.equal(result.billed, 0);
  assert.equal(result.income, 350);
});

test("gross 997 with an exact 100 deposit bills once while the net 897 stays actual cash", () => {
  for (const provider of ["PayPal", "Stripe"]) {
    const data = sources({ checkouts: [checkout("with-deposit", { amountCents: 89700,
      grossAmountCents: 99700, depositAppliedCents: 10000, reservationId: "signal", renewalId: "real-period" })],
      renewals: [period("signal", { amountPaid: 100, isReservation: true,
        decidedAt: d("2025-12-15"), startDate: d("2025-12-15"), reservationConsumedAt: d("2026-01-01") }),
      period("real-period", { amountPaid: 897 })],
      transactions: [tx("deposit-cash", { amount: 100, occurredAt: d("2025-12-15"), description: "Reserva de plaza PayPal · RECUPERA" }),
        tx("net-cash", { amount: 897, type: "income_renewal", description: `Renovación ${provider} · RECUPERA 4 meses` })],
    });
    const ledger = buildFinanceLedger(data, start, end);
    const result = summarizeFinanceLedger(ledger);
    assert.equal(result.billed, 997);
    assert.equal(result.countRenewal, 1);
    assert.equal(result.income, 897);
    assert.equal(ledger.billedEntries.length, 1);
    assert.equal(ledger.warnings.length, 0);
    assert.equal(summarizeFinanceLedger(buildFinanceLedger(data, d("2025-12-01"), end)).income, 997);
  }
});

test("gross deposit snapshot does not turn future net installments into collected cash", () => {
  const data = sources({ checkouts: [checkout("split-deposit", { amountCents: 89700,
    grossAmountCents: 99700, depositAppliedCents: 10000, reservationId: "signal", renewalId: "real-period" })],
    renewals: [period("signal", { amountPaid: 100, isReservation: true, reservationConsumedAt: d("2026-01-01") }),
      period("real-period", { amountPaid: 897 })],
    transactions: [tx("part-one", { amount: 299, type: "income_renewal", description: "Renovación PayPal · cuota 1/3" }),
      tx("part-two", { amount: 299, type: "income_renewal", occurredAt: d("2026-02-05"), description: "Renovación PayPal · cuota 2/3" }),
      tx("part-three", { amount: 299, type: "income_renewal", occurredAt: d("2026-03-05"), description: "Renovación PayPal · cuota 3/3" })],
  });
  const january = summarizeFinanceLedger(buildFinanceLedger(data, start, end));
  assert.equal(january.billed, 997);
  assert.equal(january.income, 299);
  const february = summarizeFinanceLedger(buildFinanceLedger(data, d("2026-02-01"), d("2026-02-28")));
  assert.equal(february.billed, 0);
  assert.equal(february.income, 299);
});

test("legacy or invalid deposit snapshots retain their stored balance with a review warning", () => {
  const signal = period("signal", { amountPaid: 100, isReservation: true, reservationConsumedAt: d("2026-01-01") });
  for (const snapshot of [
    {},
    { grossAmountCents: 99700, depositAppliedCents: 9900, reservationId: "signal" },
    { grossAmountCents: 99700, depositAppliedCents: 10000, reservationId: "missing" },
  ]) {
    const ledger = buildFinanceLedger(sources({ checkouts: [checkout("unknown", { amountCents: 89700,
      renewalId: "real-period", ...snapshot })], renewals: [signal, period("real-period", { amountPaid: 897 })] }), start, end);
    assert.equal(summarizeFinanceLedger(ledger).billed, 897);
    assert.ok(ledger.warnings.length > 0);
  }
  const wrongPatient = buildFinanceLedger(sources({ checkouts: [checkout("wrong-patient", { amountCents: 89700,
    grossAmountCents: 99700, depositAppliedCents: 10000, reservationId: "signal" })],
    renewals: [{ ...signal, patientId: "another-patient" }] }), start, end);
  assert.equal(summarizeFinanceLedger(wrongPatient).billed, 897);
  assert.ok(wrongPatient.legacyUnverified.some((row) => row.issue === "contract-incomplete"));
});

test("receipt metadata prevents rebilling even when an old row keeps its random id", () => {
  const ledger = buildFinanceLedger(sources({ sales: [sale("contract")],
    transactions: [tx("old-id", { amount: 1200,
      description: "Cobro verificado [ff-receipt:v1 provider=stripe receipt=in_1 contract=sale:contract subscription=sub_1]" })],
  }), start, end);
  assert.equal(summarizeFinanceLedger(ledger).billed, 1200);
  assert.equal(summarizeFinanceLedger(ledger).income, 1200);
  const editedDescription = buildFinanceLedger(sources({ transactions: [
    tx("receipt:stripe:invoice:in_existing", { description: "Descripción editada" }),
  ] }), start, end);
  assert.equal(summarizeFinanceLedger(editedDescription).billed, 0);
  assert.equal(summarizeFinanceLedger(editedDescription).income, 400);
  assert.equal(editedDescription.legacyUnverified[0].issue, "contract-link");
});

test("cash profit stays cash based and decimal cents are stable", () => {
  const ledger = buildFinanceLedger(sources({ transactions: [
    tx("income", { type: "income_other", amount: 100.01, patientId: null, description: "Formación" }),
    tx("expense", { type: "expense", amount: 30.02 }),
  ] }), start, end);
  const result = summarizeFinanceLedger(ledger);
  assert.equal(result.billedOther, 100.01);
  assert.equal(result.profit, 69.99);
  assert.equal(result.expense, 30.02);
  assert.equal(result.collectedCountOther, 1);
});
