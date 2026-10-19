/**
 * Separate the value of confirmed contracts from money actually received.
 * This module never changes historical rows. Identity matching happens before
 * period filtering so installments from earlier sales remain cash this month.
 */
import { moneyCents, roundMoney } from "./money";

export type FinanceIncomeType = "income_new" | "income_renewal" | "income_other";
export type FinanceLedgerEntry<T extends string = FinanceIncomeType> = {
  id: string;
  type: T;
  amount: number;
  occurredAt: Date;
  patientId: string | null;
  professionalId: string | null;
  programType: string | null;
  source: string;
};

export type FinanceLedger = {
  billedEntries: FinanceLedgerEntry[];
  receiptEntries: FinanceLedgerEntry[];
  expenseEntries: FinanceLedgerEntry<"expense">[];
  legacyUnverified: {
    id: string; amount: number; occurredAt: Date | null; patientId: string | null;
    source: string; issue: "missing-receipt" | "contract-link" | "contract-incomplete"; reason: string;
  }[];
  warnings: string[];
};

export type LedgerTransaction = {
  id: string; type: string; amount: number; occurredAt: Date;
  patientId: string | null; professionalId: string | null;
  category?: string | null; description?: string | null;
};
export type LedgerSale = {
  id: string; status: string; amountCents: number; paidAt: Date | null;
  patientId: string | null; closerId: string | null; programType: string;
  durationMonths: number; isReservation: boolean; isTest?: boolean;
};
export type LedgerCheckout = {
  id: string; status: string; amountCents: number; paidAt: Date | null;
  patientId: string; createdById: string | null; programType: string;
  durationMonths: number; isReservation: boolean; renewalId: string | null;
  isTest?: boolean;
  grossAmountCents?: number | null;
  depositAppliedCents?: number | null;
  reservationId?: string | null;
};
export type LedgerPeriod = {
  id: string; patientId: string; amountPaid: number | null; decidedAt: Date;
  startDate: Date | null; programType: string | null; periodMonths: number;
  isReservation: boolean; reservationConsumedAt?: Date | null;
  professionalId?: string | null; isTest?: boolean;
};
export type FinanceLedgerSources = {
  transactions: readonly LedgerTransaction[];
  sales: readonly LedgerSale[];
  checkouts: readonly LedgerCheckout[];
  renewals: readonly LedgerPeriod[];
};

const incomeTypes = new Set<string>(["income_new", "income_renewal", "income_other"]);
const cents = moneyCents;
const money = roundMoney;
const sameTime = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() === b.getTime();
const validDate = (value: Date | null): value is Date => !!value && Number.isFinite(value.getTime());

function receiptContract(description: string): { kind: "sale" | "renewal"; id: string } | null {
  const marker = description.match(/\[ff-receipt:v1\s+[^\]]*\bcontract=(sale|renewal):([^\s\]]+)/);
  return marker ? { kind: marker[1] as "sale" | "renewal", id: marker[2] } : null;
}

/** Pure projection, including conservative fallbacks for existing manual data. */
export function buildFinanceLedger(
  sources: FinanceLedgerSources, start: Date, end: Date,
): FinanceLedger {
  const inPeriod = (date: Date | null) => validDate(date) && date >= start && date <= end;
  const billed: FinanceLedgerEntry[] = [];
  const unverified: FinanceLedger["legacyUnverified"] = [];
  const warnings = new Set<string>();
  const linkedPeriods = new Set<string>();
  const periods = [...sources.renewals].filter((period) => !period.isTest && !period.isReservation)
    .sort((a, b) => (a.startDate ?? a.decidedAt).getTime() - (b.startDate ?? b.decidedAt).getTime()
      || a.decidedAt.getTime() - b.decidedAt.getTime() || a.id.localeCompare(b.id));
  const periodById = new Map(sources.renewals.map((period) => [period.id, period]));
  const byPatient = new Map<string, LedgerPeriod[]>();
  for (const period of periods) {
    const rows = byPatient.get(period.patientId) ?? [];
    rows.push(period);
    byPatient.set(period.patientId, rows);
  }
  const salePeriod = new Map<string, LedgerPeriod>();
  const confirmedSales = sources.sales.filter((sale) => ["paid", "refunded"].includes(sale.status));
  const confirmedCheckouts = sources.checkouts.filter((checkout) => checkout.status === "paid");

  // This is an explicit stored relationship, not a date/amount heuristic.
  for (const checkout of confirmedCheckouts) {
    if (checkout.renewalId) linkedPeriods.add(checkout.renewalId);
  }

  // The activation transaction uses the same timestamp for Sale.paidAt and
  // the initial period's decidedAt. Older activations can use a unique initial
  // period only when the patient has exactly one confirmed non-reservation sale.
  for (const sale of confirmedSales) {
    if (!sale.patientId || sale.isReservation || sale.isTest) continue;
    const candidates = (byPatient.get(sale.patientId) ?? []).filter((period) => !linkedPeriods.has(period.id));
    const exact = candidates.filter((period) => sameTime(sale.paidAt, period.decidedAt));
    let pair: LedgerPeriod | undefined = exact.length === 1 ? exact[0] : undefined;
    if (!pair && exact.length === 0) {
      const patientSales = confirmedSales.filter((other) => other.patientId === sale.patientId && !other.isReservation);
      const initial = byPatient.get(sale.patientId)?.[0];
      if (patientSales.length === 1 && initial && !linkedPeriods.has(initial.id)
        && (!sale.paidAt || Math.abs(initial.decidedAt.getTime() - sale.paidAt.getTime()) <= 300_000)
        && (!initial.programType || initial.programType === sale.programType)
        && initial.periodMonths === sale.durationMonths) pair = initial;
    }
    if (pair) {
      salePeriod.set(sale.id, pair);
      linkedPeriods.add(pair.id);
    } else if (candidates.length > 0) {
      // Keep ambiguous amounts visible for review instead of counting a known
      // sale again through its possibly duplicated legacy subscription period.
      const potential = candidates.filter((period) => period.amountPaid != null
        && cents(period.amountPaid) === sale.amountCents
        && sale.paidAt != null && Math.abs(period.decidedAt.getTime() - sale.paidAt.getTime()) <= 86_400_000
        && (!period.programType || period.programType === sale.programType)
        && period.periodMonths === sale.durationMonths);
      for (const period of potential) {
        linkedPeriods.add(period.id);
        unverified.push({ id: period.id, amount: period.amountPaid ?? 0,
          occurredAt: period.decidedAt, patientId: period.patientId, source: "legacy-period",
          issue: "contract-link",
          reason: "Posible duplicado de un contrato confirmado; falta una vinculación inequívoca." });
      }
      if (potential.length && (potential.some((period) => inPeriod(period.decidedAt)) || inPeriod(sale.paidAt))) warnings.add("Hay periodos históricos cuya vinculación con una venta requiere revisión. Sus importes no se añaden otra vez al contrato confirmado.");
    }
  }

  function addContract(
    id: string, type: FinanceIncomeType, amount: number, date: Date | null,
    patientId: string | null, professionalId: string | null, programType: string | null, source: string,
  ) {
    if (!validDate(date) || !Number.isFinite(amount) || amount <= 0) {
      unverified.push({ id, amount: Number.isFinite(amount) ? amount : 0,
        occurredAt: validDate(date) ? date : null, patientId, source,
        issue: "contract-incomplete",
        reason: "Falta una fecha de confirmación o un importe contractual válido." });
      warnings.add("Hay contratos históricos sin fecha o importe suficiente para asignarlos a un mes.");
      return;
    }
    billed.push({ id, type, amount: money(amount), occurredAt: date, patientId,
      professionalId, programType, source });
  }

  for (const sale of confirmedSales) {
    if (sale.status !== "paid" || sale.isReservation || sale.isTest) continue;
    addContract("sale:" + sale.id, "income_new", sale.amountCents / 100,
      sale.paidAt ?? salePeriod.get(sale.id)?.decidedAt ?? null,
      sale.patientId, sale.closerId, sale.programType, "sale");
  }
  for (const checkout of confirmedCheckouts) {
    if (checkout.isReservation || checkout.programType === "ADHOC" || checkout.isTest) continue;
    const date = checkout.paidAt ?? (checkout.renewalId ? periodById.get(checkout.renewalId)?.decidedAt : null) ?? null;
    let contractualCents = checkout.amountCents;
    const hasSnapshot = checkout.grossAmountCents != null || checkout.depositAppliedCents != null || checkout.reservationId != null;
    if (hasSnapshot) {
      const gross = checkout.grossAmountCents;
      const deposit = checkout.depositAppliedCents;
      const reservation = checkout.reservationId ? periodById.get(checkout.reservationId) : undefined;
      const uniqueReservation = !checkout.reservationId || confirmedCheckouts.filter((row) => row.reservationId === checkout.reservationId).length === 1;
      const amountsValid = typeof gross === "number" && Number.isSafeInteger(gross) && gross > 0
        && typeof deposit === "number" && Number.isSafeInteger(deposit) && deposit >= 0
        && Number.isSafeInteger(checkout.amountCents) && checkout.amountCents > 0
        && gross === checkout.amountCents + deposit;
      const depositValid = deposit === 0 ? !checkout.reservationId : !!reservation && reservation.isReservation
        && reservation.patientId === checkout.patientId && !!reservation.reservationConsumedAt
        && reservation.amountPaid != null && cents(reservation.amountPaid) === deposit && uniqueReservation;
      if (amountsValid && depositValid) contractualCents = gross!;
      else {
        if (inPeriod(date)) warnings.add("Una renovación tiene datos de señal o precio completo incoherentes. Se conserva el saldo guardado y se requiere revisar el contrato.");
        unverified.push({ id: "renewal:" + checkout.id, amount: checkout.amountCents / 100,
          occurredAt: date, patientId: checkout.patientId, source: "renewal-checkout", issue: "contract-incomplete",
          reason: "El precio completo no coincide con saldo y señal, o la reserva exacta no es verificable." });
      }
    }
    addContract("renewal:" + checkout.id, "income_renewal", contractualCents / 100, date,
      checkout.patientId, checkout.createdById, checkout.programType, "renewal-checkout");
    // The original gross amount/deposit application was not persisted on the
    // checkout. Never invent that link from the patient or an approximate date.
    const consumedDeposit = sources.renewals.some((period) => period.patientId === checkout.patientId
      && period.isReservation && period.reservationConsumedAt);
    if (!hasSnapshot && consumedDeposit && inPeriod(date)) warnings.add("Alguna renovación puede tener una señal descontada. Se muestra el importe guardado; el precio completo anterior al descuento requiere revisar esa vinculación histórica.");
  }
  for (const period of periods) {
    if (linkedPeriods.has(period.id) || period.amountPaid == null || period.amountPaid <= 0) continue;
    const first = byPatient.get(period.patientId)?.[0]?.id === period.id;
    addContract("period:" + period.id, first ? "income_new" : "income_renewal",
      period.amountPaid, period.decidedAt, period.patientId, period.professionalId ?? null,
      period.programType, "legacy-period");
    unverified.push({ id: period.id, amount: period.amountPaid, occurredAt: period.decidedAt,
      patientId: period.patientId, source: "legacy-period",
      issue: "missing-receipt",
      reason: "Importe contractual histórico. El cobro solo se reconoce si existe un movimiento de ingreso." });
  }

  // Evidence used only to prevent a generated receipt from becoming a second
  // contract. A patient having a sale is NOT sufficient to discard manual rows.
  const generatedReceipt = /^(?:Alta\s*-|Renovaci[oó]n\s*-|Pago v[ií]a (?:PayPal|Stripe)\s*[·-]|Renovaci[oó]n (?:PayPal|Stripe)\s*[·(]|Pago suelto PayPal)/i;
  const reservationReceipt = /^Reserva de plaza\b/i;
  const installmentReceipt = /\bcuotas?\b|\binstallments?\b/i;
  const excludedCashContracts = [
    ...confirmedSales.filter((sale) => sale.isReservation || sale.isTest || sale.status === "refunded")
      .map((sale) => ({ patientId: sale.patientId, amount: sale.amountCents / 100, occurredAt: sale.paidAt })),
    ...confirmedCheckouts.filter((checkout) => checkout.isReservation || checkout.programType === "ADHOC" || checkout.isTest)
      .map((checkout) => ({ patientId: checkout.patientId, amount: checkout.amountCents / 100, occurredAt: checkout.paidAt })),
    // A deposit-aware contract bills the gross price, while its one-shot
    // generated receipt still contains ONLY the net balance actually charged.
    ...confirmedCheckouts.filter((checkout) => !checkout.isReservation && !checkout.isTest
      && checkout.grossAmountCents != null && checkout.grossAmountCents !== checkout.amountCents)
      .map((checkout) => ({ patientId: checkout.patientId, amount: checkout.amountCents / 100, occurredAt: checkout.paidAt })),
  ];
  for (const tx of sources.transactions) {
    if (!incomeTypes.has(tx.type)) continue;
    const description = tx.description ?? "";
    const linkedReceipt = receiptContract(description);
    if (linkedReceipt) {
      const known = linkedReceipt.kind === "sale"
        ? confirmedSales.some((sale) => sale.id === linkedReceipt.id)
        : confirmedCheckouts.some((checkout) => checkout.id === linkedReceipt.id);
      if (!known && inPeriod(tx.occurredAt)) unverified.push({ id: "transaction:" + tx.id,
        amount: tx.amount, occurredAt: tx.occurredAt, patientId: tx.patientId,
        source: "linked-receipt", issue: "contract-link",
        reason: "Cobro registrado cuyo contrato confirmado no se ha localizado; permanece en recaudado." });
      continue;
    }
    if (tx.id.startsWith("receipt:")) {
      if (inPeriod(tx.occurredAt)) unverified.push({ id: "transaction:" + tx.id,
        amount: tx.amount, occurredAt: tx.occurredAt, patientId: tx.patientId,
        source: "linked-receipt", issue: "contract-link",
        reason: "Cobro verificado cuya referencia al contrato falta en el registro; permanece en recaudado." });
      continue;
    }
    if (reservationReceipt.test(description) || tx.category === "ADHOC") continue;
    if (installmentReceipt.test(description)) {
      // Its face value is a payment, never evidence of the full program price.
      if (inPeriod(tx.occurredAt)) unverified.push({ id: "transaction:" + tx.id, amount: tx.amount,
        occurredAt: tx.occurredAt, patientId: tx.patientId, source: "installment-receipt",
        issue: "contract-link",
        reason: "Cuota histórica sin vinculación verificable al contrato; se conserva en recaudado." });
      continue;
    }
    const samePatientAmount = (candidate: { patientId: string | null; amount: number; occurredAt: Date | null }) =>
      !!tx.patientId && candidate.patientId === tx.patientId && cents(candidate.amount) === cents(tx.amount);
    const nearbyGenerated = generatedReceipt.test(description) && [
      ...billed.filter((candidate) => candidate.type === tx.type), ...excludedCashContracts,
    ].filter((candidate) => samePatientAmount(candidate) && validDate(candidate.occurredAt)
      && Math.abs(candidate.occurredAt.getTime() - tx.occurredAt.getTime()) <= 300_000);
    if (Array.isArray(nearbyGenerated) && nearbyGenerated.length > 0) {
      if (nearbyGenerated.length > 1 && inPeriod(tx.occurredAt)) warnings.add("Hay cobros generados con más de un contrato compatible. Permanecen en recaudado sin añadir otra venta mientras se revisa su vinculación.");
      continue;
    }
    // Unpaired manual/standalone entries remain useful historical evidence.
    // This fallback never removes their cash value or rewrites the stored row.
    addContract("transaction:" + tx.id, tx.type as FinanceIncomeType, tx.amount, tx.occurredAt,
      tx.patientId, tx.professionalId, tx.category ?? null, "manual-transaction");
  }

  const transactions = sources.transactions.filter((row) => inPeriod(row.occurredAt));
  const fractionalMovements = transactions.filter((row) =>
    (incomeTypes.has(row.type) || row.type === "expense")
    && Math.abs(row.amount - money(row.amount)) > 1e-8);
  if (fractionalMovements.length) warnings.add(
    `${fractionalMovements.length} movimiento${fractionalMovements.length === 1 ? " histórico tiene" : "s históricos tienen"} fracciones de céntimo. Los totales suman cada movimiento redondeado a dos decimales; los importes guardados no se modifican.`,
  );
  const toEntry = <T extends string>(row: LedgerTransaction, type: T): FinanceLedgerEntry<T> => ({
    id: row.id, type, amount: money(row.amount), occurredAt: row.occurredAt,
    patientId: row.patientId, professionalId: row.professionalId,
    programType: row.category ?? null, source: "transaction",
  });
  const legacyUnverified = unverified.filter((row) => {
    if (row.occurredAt != null && !inPeriod(row.occurredAt)) return false;
    if (row.issue !== "missing-receipt") return true;
    const period = periodById.get(row.id);
    if (!period) return true;
    const expectedType = byPatient.get(period.patientId)?.[0]?.id === period.id ? "income_new" : "income_renewal";
    const corroboratingReceipts = sources.transactions.filter((tx) => tx.patientId === period.patientId
      && tx.type === expectedType && cents(tx.amount) === cents(row.amount)
      && generatedReceipt.test(tx.description ?? "")
      && Math.abs(tx.occurredAt.getTime() - period.decidedAt.getTime()) <= 300_000);
    // A unique generated receipt corroborates the actual money; there is no
    // missing-cash issue to show merely because the contract is a legacy row.
    return corroboratingReceipts.length !== 1;
  });
  if (legacyUnverified.some((row) => row.source === "legacy-period")) warnings.add("Parte de la facturación usa importes contractuales históricos. Esos importes no se convierten automáticamente en dinero recaudado.");
  if (legacyUnverified.some((row) => row.source === "installment-receipt")) warnings.add("Las cuotas históricas sin contrato vinculado permanecen en recaudado, sin inventar un precio completo ni una venta adicional.");
  return {
    billedEntries: billed.filter((row) => inPeriod(row.occurredAt)),
    receiptEntries: transactions.filter((row) => incomeTypes.has(row.type))
      .map((row) => toEntry(row, row.type as FinanceIncomeType)),
    expenseEntries: transactions.filter((row) => row.type === "expense").map((row) => toEntry(row, "expense")),
    legacyUnverified, warnings: [...warnings],
  };
}

/** All queries below are reads; no reconciliation or record repair runs here. */
export async function getFinanceLedger(start: Date, end: Date): Promise<FinanceLedger> {
  const { prisma } = await import("@/lib/prisma");
  const [transactions, sales, checkouts, renewals] = await Promise.all([
    prisma.transaction.findMany({
      where: { OR: [
        { type: { in: ["income_new", "income_renewal", "income_other"] } },
        { type: "expense", occurredAt: { gte: start, lte: end } },
      ] },
      select: { id: true, type: true, amount: true, occurredAt: true, patientId: true,
        professionalId: true, category: true, description: true },
    }),
    prisma.sale.findMany({
      where: { status: { in: ["paid", "refunded"] } },
      select: { id: true, status: true, amountCents: true, paidAt: true, patientId: true,
        closerId: true, programType: true, durationMonths: true, isReservation: true,
        patient: { select: { isTest: true } } },
    }),
    prisma.renewalCheckout.findMany({
      where: { status: "paid" },
      select: { id: true, status: true, amountCents: true, paidAt: true, patientId: true,
        createdById: true, programType: true, durationMonths: true, isReservation: true,
        grossAmountCents: true, depositAppliedCents: true, reservationId: true,
        renewalId: true, patient: { select: { isTest: true } } },
    }),
    prisma.subscriptionRenewal.findMany({
      select: { id: true, patientId: true, amountPaid: true, decidedAt: true, startDate: true,
        programType: true, periodMonths: true, isReservation: true, reservationConsumedAt: true,
        patient: { select: { isTest: true, assignedProfessionalId: true } } },
    }),
  ]);
  return buildFinanceLedger({ transactions,
    sales: sales.map(({ patient, ...row }) => ({ ...row, isTest: patient?.isTest ?? false })),
    checkouts: checkouts.map(({ patient, ...row }) => ({ ...row, isTest: patient.isTest })),
    renewals: renewals.map(({ patient, ...row }) => ({ ...row, isTest: patient.isTest,
      professionalId: patient.assignedProfessionalId })),
  }, start, end);
}
