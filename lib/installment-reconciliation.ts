import type Stripe from "stripe";
import {
  recordInstallmentReceipt,
  type InstallmentContract,
  type InstallmentReceipt,
  type ReceiptResult,
} from "./installment-receipts";

type Provider = InstallmentReceipt["provider"];
type ContractKind = InstallmentContract["kind"];

type StoredContract = {
  id: string;
  patientId: string | null;
  programType: string;
  durationMonths: number;
  installmentCount: number | null;
  currency: string;
  paymentToken: string;
  paypalSubscriptionId: string | null;
  stripeSessionId: string | null;
  createdAt: Date;
  closerId?: string;
  createdById?: string | null;
  renewalId?: string | null;
};

const commonSelect = {
  id: true, patientId: true, programType: true, durationMonths: true,
  installmentCount: true, currency: true, paymentToken: true,
  paypalSubscriptionId: true, stripeSessionId: true, createdAt: true,
} as const;

type Repository = {
  count(args: { where: Record<string, unknown> }): Promise<number>;
  findMany(args: Record<string, unknown>): Promise<StoredContract[]>;
};

/** The narrow dependency surface permits receipt-history tests without credentials
 * or a database. Production always uses the existing application clients. */
export type InstallmentReconciliationDependencies = {
  database: { sale: Repository; renewalCheckout: Repository };
  loadStripe: () => Promise<Stripe | null>;
  paypalConfigured: () => Promise<boolean>;
  paypalGet: (path: string, query?: Record<string, string>) => Promise<unknown>;
  writeReceipt: (input: InstallmentReceipt) => Promise<ReceiptResult>;
};

export type InstallmentReconciliationOptions = {
  dryRun?: boolean;
  /** Per contract type, 1..20. The unattended cron rotates through all batches. */
  batchSize?: number;
  /** Supply an empty string to start an explicit cursor-based historical pass. */
  salesAfter?: string;
  renewalsAfter?: string;
  saleId?: string;
  renewalId?: string;
  maxProviderRequests?: number;
  maxRunMs?: number;
  now?: Date;
};

type BatchReport = {
  total: number;
  offset: number;
  selected: number;
  hasMore: boolean;
  nextAfter: string | null;
  retryIds: string[];
};

type Detail = {
  kind: ContractKind;
  id: string;
  action: string;
  provider?: Provider;
  receiptId?: string;
  transactionId?: string;
  reason?: string;
};

export type InstallmentReconciliationReport = {
  dryRun: boolean;
  startedAt: string;
  providerRequests: number;
  contractsProcessed: number;
  receiptsConfirmed: number;
  created: number;
  adopted: number;
  existing: number;
  wouldCreate: number;
  wouldAdopt: number;
  ambiguous: number;
  skipped: number;
  failed: number;
  incomplete: boolean;
  batches: { sales: BatchReport; renewals: BatchReport };
  details: Detail[];
};

class ReconciliationSkip extends Error {
  constructor(readonly reason: string) { super(reason); }
}

const DEFAULT_BATCH_SIZE = 5;
const MAX_HISTORY_REQUESTS = 8;
const MAX_RECEIPTS_PER_CONTRACT = 250;
const DAY_MS = 86_400_000;

function integerOption(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(maximum, Math.floor(value!))) : fallback;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function idOf(value: unknown): string | null {
  return typeof value === "string" ? value : typeof object(value)?.id === "string" ? object(value)!.id as string : null;
}

function paypalCents(value: unknown): number | null {
  // Do not coerce missing amounts or round malformed precision into cash.
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function matchesMetadata(metadata: unknown, kind: ContractKind, stored: StoredContract): boolean {
  const meta = object(metadata);
  if (!meta || meta.productType !== kind) return false;
  const contractKey = kind === "sale" ? "saleId" : "renewalCheckoutId";
  return (meta[contractKey] === stored.id || meta.paymentToken === stored.paymentToken)
    && (meta[contractKey] === undefined || meta[contractKey] === stored.id)
    && (meta.paymentToken === undefined || meta.paymentToken === stored.paymentToken);
}

function emptyBatch(): BatchReport {
  return { total: 0, offset: 0, selected: 0, hasMore: false, nextAfter: null, retryIds: [] };
}

async function productionDependencies(): Promise<InstallmentReconciliationDependencies> {
  const { prisma } = await import("./prisma");
  return {
    // findMany always selects precisely the StoredContract fields above.
    database: prisma as unknown as InstallmentReconciliationDependencies["database"],
    loadStripe: async () => (await import("./stripe")).stripe,
    paypalConfigured: async () => Boolean((await import("./paypal/config")).paypalCredentials()),
    paypalGet: async (path, query) => (await import("./paypal/client")).paypalFetch(path, { method: "GET", query }),
    writeReceipt: recordInstallmentReceipt,
  };
}

/** Rebuilds only provider-confirmed successful installment receipts. It never
 * captures payments, activates contracts, cancels subscriptions, edits agreed
 * contract values, or turns an expected installment into collected revenue.
 * Complete histories are sorted oldest first before conservative legacy adoption. */
export async function reconcileInstallmentReceipts(
  options: InstallmentReconciliationOptions = {},
  injectedDependencies?: InstallmentReconciliationDependencies,
): Promise<InstallmentReconciliationReport> {
  const deps = injectedDependencies ?? await productionDependencies();
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Fecha de reconciliación inválida.");
  const deadline = Date.now() + integerOption(options.maxRunMs, 45_000, 45_000);
  const maxRequests = integerOption(options.maxProviderRequests, 40, 100);
  const batchSize = integerOption(options.batchSize, DEFAULT_BATCH_SIZE, 20);
  const report: InstallmentReconciliationReport = {
    dryRun: options.dryRun === true, startedAt: now.toISOString(), providerRequests: 0,
    contractsProcessed: 0, receiptsConfirmed: 0, created: 0, adopted: 0, existing: 0,
    wouldCreate: 0, wouldAdopt: 0, ambiguous: 0, skipped: 0, failed: 0, incomplete: false,
    batches: { sales: emptyBatch(), renewals: emptyBatch() }, details: [],
  };

  function checkBudget() {
    if (Date.now() >= deadline) throw new ReconciliationSkip("run_time_limit");
    if (report.providerRequests >= maxRequests) throw new ReconciliationSkip("provider_request_limit");
  }

  async function providerRequest<T>(request: () => Promise<T>): Promise<T> {
    checkBudget();
    report.providerRequests++;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // The existing PayPal client does not expose AbortSignal. A timed-out GET
      // may finish in the background, but its result can never cause a write.
      return await Promise.race([
        request(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new ReconciliationSkip("provider_timeout")), Math.min(8_000, Math.max(1, deadline - Date.now())));
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function batch(kind: ContractKind): Promise<StoredContract[]> {
    const repository = kind === "sale" ? deps.database.sale : deps.database.renewalCheckout;
    const target = kind === "sale" ? options.saleId : options.renewalId;
    const otherTarget = kind === "sale" ? options.renewalId : options.saleId;
    if (!target && otherTarget) return [];
    const after = kind === "sale" ? options.salesAfter : options.renewalsAfter;
    const where: Record<string, unknown> = {
      status: "paid", installmentCount: { gte: 2 }, isReservation: false,
      ...(target ? { id: target } : after ? { id: { gt: after } } : {}),
    };
    const total = await repository.count({ where });
    // Rotate without a schema/cursor mutation. Explicit cursors make a complete
    // one-off backfill repeatable; ordinary cron runs eventually visit all rows.
    const pages = Math.max(1, Math.ceil(total / batchSize));
    const offset = target || after !== undefined ? 0 : (Math.floor(now.getTime() / (15 * 60_000)) % pages) * batchSize;
    const selected = await repository.findMany({
      where, select: { ...commonSelect, ...(kind === "sale" ? { closerId: true } : { createdById: true, renewalId: true }) },
      orderBy: { id: "asc" }, skip: offset, take: batchSize,
    });
    const hasMore = offset + selected.length < total;
    report.batches[kind === "sale" ? "sales" : "renewals"] = {
      total, offset, selected: selected.length, hasMore,
      nextAfter: hasMore && selected.length > 0 ? selected[selected.length - 1].id : null,
      retryIds: [],
    };
    return selected;
  }

  const [sales, renewals] = await Promise.all([batch("sale"), batch("renewal")]);
  let stripeClient: Stripe | null | undefined;
  let paypalConfigured: boolean | undefined;

  async function stripe() {
    if (stripeClient === undefined) stripeClient = await deps.loadStripe();
    if (!stripeClient) throw new ReconciliationSkip("stripe_not_configured");
    return stripeClient;
  }

  async function resolveSubscription(kind: ContractKind, stored: StoredContract): Promise<{ provider: Provider; subscriptionId: string }> {
    const storedId = stored.paypalSubscriptionId;
    let provider: Provider;
    let subscriptionId: string;
    if (storedId?.startsWith("I-")) {
      provider = "paypal";
      subscriptionId = storedId;
      if (paypalConfigured === undefined) paypalConfigured = await deps.paypalConfigured();
      if (!paypalConfigured) throw new ReconciliationSkip("paypal_not_configured");
      const subscription = object(await providerRequest(() => deps.paypalGet(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`)));
      const expectedCustomId = kind === "sale" ? stored.paymentToken : `renewal:${stored.paymentToken}`;
      if (subscription?.id !== subscriptionId || subscription.custom_id !== expectedCustomId) {
        throw new ReconciliationSkip("paypal_contract_link_unknown_or_conflicting");
      }
    } else if (storedId?.startsWith("sub_") || (!storedId && stored.stripeSessionId)) {
      provider = "stripe";
      const client = await stripe();
      if (storedId) {
        subscriptionId = storedId;
      } else {
        // Renewal Checkout historically saved only the Checkout Session ID.
        const session = await providerRequest(() => client.checkout.sessions.retrieve(stored.stripeSessionId!, { timeout: 8_000, maxNetworkRetries: 0 }));
        const recovered = idOf(session.subscription);
        if (session.mode !== "subscription" || !recovered?.startsWith("sub_") || !matchesMetadata(session.metadata, kind, stored)) {
          throw new ReconciliationSkip("stripe_checkout_link_unknown_or_conflicting");
        }
        subscriptionId = recovered;
      }
      const subscription = await providerRequest(() => client.subscriptions.retrieve(subscriptionId, { timeout: 8_000, maxNetworkRetries: 0 }));
      if (subscription.id !== subscriptionId || !matchesMetadata(subscription.metadata, kind, stored)) {
        throw new ReconciliationSkip("stripe_contract_link_unknown_or_conflicting");
      }
    } else {
      throw new ReconciliationSkip(storedId ? "unknown_subscription_provider" : "missing_subscription_link");
    }

    // The two tables each have a unique key, but can still both refer to the
    // same provider subscription. Never arbitrarily choose between contracts.
    const [linkedSales, linkedRenewals] = await Promise.all([
      deps.database.sale.findMany({ where: { paypalSubscriptionId: subscriptionId }, select: { id: true }, take: 2 }),
      deps.database.renewalCheckout.findMany({ where: { paypalSubscriptionId: subscriptionId }, select: { id: true }, take: 2 }),
    ]);
    if (linkedSales.some((row) => kind !== "sale" || row.id !== stored.id)
      || linkedRenewals.some((row) => kind !== "renewal" || row.id !== stored.id)) {
      throw new ReconciliationSkip("subscription_linked_to_multiple_contracts");
    }
    return { provider, subscriptionId };
  }

  type ConfirmedReceipt = { receiptId: string; amountCents: number; paidAt: Date };

  function validPaymentTime(date: Date, stored: StoredContract): boolean {
    return Number.isFinite(date.getTime()) && date.getTime() >= stored.createdAt.getTime() - DAY_MS
      && date.getTime() <= now.getTime() + 5 * 60_000;
  }

  async function stripeHistory(subscriptionId: string, stored: StoredContract, skipReceipt: (receiptId: string | undefined, reason: string) => void): Promise<ConfirmedReceipt[]> {
    const client = await stripe();
    const receipts: ConfirmedReceipt[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < 4; page++) {
      const invoices = await providerRequest(() => client.invoices.list({
        subscription: subscriptionId, status: "paid", limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }, { timeout: 8_000, maxNetworkRetries: 0 }));
      for (const invoice of invoices.data) {
        const paidAt = new Date((invoice.status_transitions?.paid_at ?? NaN) * 1000);
        if (idOf(invoice.subscription) !== subscriptionId || invoice.status !== "paid" || invoice.paid_out_of_band || invoice.currency?.toLowerCase() !== "eur"
          || !Number.isSafeInteger(invoice.amount_paid) || invoice.amount_paid <= 0 || !validPaymentTime(paidAt, stored)) {
          skipReceipt(invoice.id, "invalid_or_non_eur_paid_invoice");
          continue;
        }
        receipts.push({ receiptId: invoice.id, amountCents: invoice.amount_paid, paidAt });
      }
      if (receipts.length > MAX_RECEIPTS_PER_CONTRACT) throw new ReconciliationSkip("too_many_provider_receipts");
      if (!invoices.has_more) return receipts;
      const next = invoices.data[invoices.data.length - 1]?.id;
      if (!next || next === startingAfter) throw new ReconciliationSkip("stripe_history_incomplete");
      startingAfter = next;
    }
    throw new ReconciliationSkip("stripe_history_incomplete");
  }

  async function paypalHistory(subscriptionId: string, stored: StoredContract, skipReceipt: (receiptId: string | undefined, reason: string) => void): Promise<ConfirmedReceipt[]> {
    let requests = 0;
    async function range(start: number, end: number): Promise<unknown[]> {
      if (++requests > MAX_HISTORY_REQUESTS) throw new ReconciliationSkip("paypal_history_incomplete");
      const response = object(await providerRequest(() => deps.paypalGet(
        `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/transactions`,
        { start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString() },
      )));
      if (!response || !Array.isArray(response.transactions)) throw new ReconciliationSkip("paypal_history_invalid");
      const nextLink = Array.isArray(response.links) && response.links.some((link) => object(link)?.rel === "next");
      const incomplete = nextLink || Number(response.total_pages) > 1 || Number(response.total_items) > response.transactions.length;
      if (!incomplete) return response.transactions;
      // PayPal documents no page/cursor query for this endpoint. Split the date
      // range instead of silently accepting a partial page or following a URL.
      const midpoint = Math.floor((start + end) / 2);
      if (midpoint <= start || midpoint >= end || end - start < 2_000) throw new ReconciliationSkip("paypal_history_incomplete");
      const older = await range(start, midpoint);
      const newer = await range(midpoint, end);
      return [...older, ...newer];
    }
    const history = await range(stored.createdAt.getTime() - DAY_MS, now.getTime());
    if (history.length > MAX_RECEIPTS_PER_CONTRACT) throw new ReconciliationSkip("too_many_provider_receipts");
    const receipts: ConfirmedReceipt[] = [];
    for (const raw of history) {
      const transaction = object(raw);
      const receiptId = typeof transaction?.id === "string" ? transaction.id : undefined;
      const gross = object(object(transaction?.amount_with_breakdown)?.gross_amount);
      const amountCents = paypalCents(gross?.value);
      const paidAt = new Date(typeof transaction?.time === "string" ? transaction.time : NaN);
      if (!receiptId || transaction?.status !== "COMPLETED" || gross?.currency_code !== "EUR" || !amountCents || !validPaymentTime(paidAt, stored)) {
        skipReceipt(receiptId, "invalid_or_non_eur_completed_payment");
        continue;
      }
      receipts.push({ receiptId, amountCents, paidAt });
    }
    return receipts;
  }

  async function process(kind: ContractKind, stored: StoredContract) {
    report.contractsProcessed++;
    let provider: Provider | undefined;
    const detail = (action: string, reason?: string, receiptId?: string, transactionId?: string) => {
      report.details.push({ kind, id: stored.id, action, ...(provider ? { provider } : {}), ...(reason ? { reason } : {}), ...(receiptId ? { receiptId } : {}), ...(transactionId ? { transactionId } : {}) });
    };
    const skipReceipt = (receiptId: string | undefined, reason: string) => {
      report.skipped++;
      detail("skipped_receipt", reason, receiptId);
    };
    try {
      checkBudget();
      if (!stored.patientId || (kind === "renewal" && !stored.renewalId && stored.programType !== "ADHOC")) {
        throw new ReconciliationSkip("activation_incomplete");
      }
      if (stored.currency.toLowerCase() !== "eur") throw new ReconciliationSkip("non_eur_contract");
      if (!stored.installmentCount || stored.installmentCount < 2 || stored.installmentCount > 12) throw new ReconciliationSkip("invalid_installment_count");
      const resolved = await resolveSubscription(kind, stored);
      provider = resolved.provider;
      const history = provider === "stripe"
        ? await stripeHistory(resolved.subscriptionId, stored, skipReceipt)
        : await paypalHistory(resolved.subscriptionId, stored, skipReceipt);
      // Overlapping PayPal date ranges can repeat their boundary receipt. A
      // conflicting duplicate is unknown history and must not be written.
      const unique = new Map<string, ConfirmedReceipt>();
      for (const receipt of history) {
        const prior = unique.get(receipt.receiptId);
        if (prior && (prior.amountCents !== receipt.amountCents || prior.paidAt.getTime() !== receipt.paidAt.getTime())) {
          throw new ReconciliationSkip("provider_receipt_identity_conflict");
        }
        unique.set(receipt.receiptId, receipt);
      }
      const receipts = [...unique.values()].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime() || a.receiptId.localeCompare(b.receiptId));
      report.receiptsConfirmed += receipts.length;
      const contract: InstallmentContract = {
        kind, id: stored.id, patientId: stored.patientId, programType: stored.programType,
        durationMonths: stored.durationMonths, installmentCount: stored.installmentCount,
        professionalId: (kind === "sale" ? stored.closerId : stored.createdById) ?? null,
        createdAt: stored.createdAt,
      };
      if (receipts.length === 0) detail("no_confirmed_receipts");
      let ambiguous = false;
      for (const receipt of receipts) {
        if (Date.now() >= deadline) throw new ReconciliationSkip("run_time_limit");
        const result = await deps.writeReceipt({ ...receipt, provider, subscriptionId: resolved.subscriptionId, contract, dryRun: report.dryRun });
        switch (result.status) {
          case "created": report.created++; break;
          case "adopted": report.adopted++; break;
          case "existing": report.existing++; break;
          case "would-create": report.wouldCreate++; break;
          case "would-adopt": report.wouldAdopt++; break;
          case "ambiguous": report.ambiguous++; ambiguous = true; report.incomplete = true; break;
        }
        detail(result.status, result.reason, receipt.receiptId, result.transactionId);
      }
      return !ambiguous;
    } catch (error) {
      if (error instanceof ReconciliationSkip) {
        report.skipped++;
        report.incomplete = true;
        if (/conflict|unknown|multiple/.test(error.reason)) report.ambiguous++;
        detail("skipped_contract", error.reason);
      } else {
        report.failed++;
        report.incomplete = true;
        // Provider errors may contain customer information. Return an action
        // code only; a later idempotent pass can retry the same contract.
        detail("error", "provider_or_database_error");
        console.error("[installment-reconcile] contract failed", { kind, id: stored.id, error: error instanceof Error ? error.name : "unknown" });
      }
      return false;
    }
  }

  // Alternate types so a busy sales history cannot starve renewal recovery.
  const completedSales = new Set<string>();
  const completedRenewals = new Set<string>();
  for (let index = 0; index < Math.max(sales.length, renewals.length); index++) {
    if (sales[index] && await process("sale", sales[index])) completedSales.add(sales[index].id);
    if (renewals[index] && await process("renewal", renewals[index])) completedRenewals.add(renewals[index].id);
  }

  function finishBatch(kind: ContractKind, selected: StoredContract[], completed: Set<string>) {
    const summary = report.batches[kind === "sale" ? "sales" : "renewals"];
    const after = kind === "sale" ? options.salesAfter : options.renewalsAfter;
    const firstIncomplete = selected.findIndex((row) => !completed.has(row.id));
    const prefixLength = firstIncomplete < 0 ? selected.length : firstIncomplete;
    summary.retryIds = selected.filter((row) => !completed.has(row.id)).map((row) => row.id);
    summary.hasMore = prefixLength < selected.length || summary.offset + selected.length < summary.total;
    // Never move a manual backfill cursor past an unfinished/ambiguous repair.
    // A failed first row retains an explicitly supplied empty starting cursor.
    summary.nextAfter = summary.hasMore ? (prefixLength > 0 ? selected[prefixLength - 1].id : after ?? null) : null;
  }
  finishBatch("sale", sales, completedSales);
  finishBatch("renewal", renewals, completedRenewals);
  return report;
}
