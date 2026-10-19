import type { PrismaClient } from "@prisma/client";

export type InstallmentContract = {
  kind: "sale" | "renewal";
  id: string;
  patientId: string;
  programType: string;
  durationMonths: number;
  installmentCount: number;
  professionalId: string | null;
  createdAt: Date;
};

export type InstallmentReceipt = {
  provider: "stripe" | "paypal";
  receiptId: string;
  subscriptionId: string;
  contract: InstallmentContract;
  amountCents: number;
  paidAt: Date;
  dryRun?: boolean;
};

export type ReceiptResult = {
  status: "created" | "existing" | "adopted" | "ambiguous" | "would-create" | "would-adopt";
  transactionId?: string;
  reason?: string;
};

export type LegacyReceiptRow = {
  id: string;
  amount: number;
  category: string | null;
  description: string | null;
  occurredAt: Date;
};

const RECEIPT_PREFIX = "[ff-receipt:v1 ";
const LEGACY_TOLERANCE_MS = 10 * 60 * 1000;

export function receiptTransactionId(input: Pick<InstallmentReceipt, "provider" | "receiptId">): string {
  return `receipt:${input.provider}:${input.provider === "stripe" ? "invoice" : "sale"}:${input.receiptId}`;
}

export function receiptMarker(input: InstallmentReceipt, legacyOccurredAt?: Date): string {
  const value = encodeURIComponent;
  return `${RECEIPT_PREFIX}provider=${input.provider} receipt=${value(input.receiptId)} contract=${input.contract.kind}:${value(input.contract.id)} subscription=${value(input.subscriptionId)}${legacyOccurredAt ? ` legacyOccurredAt=${legacyOccurredAt.toISOString()}` : ""}]`;
}

/** Legacy rows have no provider key. Only a unique provider/amount/category/time
 * match may be adopted. Older plausible rows are deliberately ambiguous: the
 * historical webhook used processing time, so absence on the payment day is
 * not evidence that the cash was never recorded. Reconcile oldest first. */
export function assessLegacyReceipt(input: InstallmentReceipt, rows: LegacyReceiptRow[]):
  { status: "new" } | { status: "adopt"; row: LegacyReceiptRow } | { status: "ambiguous" } {
  const category = `${input.contract.programType} ${input.contract.durationMonths}M`;
  const since = input.contract.createdAt.getTime() - 86400000;
  const unmarked = rows.filter((row) =>
    !row.description?.includes(RECEIPT_PREFIX)
    && Math.round(row.amount * 100) === input.amountCents
    && row.category === category
    && row.occurredAt.getTime() >= since,
  );
  const plausible = unmarked.filter((row) =>
    row.description?.toLowerCase().includes(input.provider)
    && /cuota/i.test(row.description),
  );
  const close = plausible.filter((row) => Math.abs(row.occurredAt.getTime() - input.paidAt.getTime()) <= LEGACY_TOLERANCE_MS);
  // An unlabelled manual receipt close to this payment is also a possible
  // duplicate, but lacks enough evidence to attach a provider identity.
  const unlabelledClose = unmarked.some((row) =>
    !/stripe|paypal/i.test(row.description ?? "")
    && Math.abs(row.occurredAt.getTime() - input.paidAt.getTime()) <= LEGACY_TOLERANCE_MS,
  );
  if (unlabelledClose || close.length > 1) return { status: "ambiguous" };
  if (close.length === 1) return { status: "adopt", row: close[0] };
  return plausible.length > 0 ? { status: "ambiguous" } : { status: "new" };
}

/** Records an actual successful provider receipt, never a scheduled amount.
 * The existing Transaction primary key supplies cross-webhook idempotency;
 * no schema migration is required. Serializing each patient's receipt writes
 * also prevents two events from adopting the same legacy transaction. */
export async function recordInstallmentReceipt(
  input: InstallmentReceipt,
  database?: Pick<PrismaClient, "$transaction">,
): Promise<ReceiptResult> {
  if (!input.receiptId || !input.subscriptionId || !input.contract.id || !input.contract.patientId) {
    throw new Error("Cuota sin identificador de recibo, contrato, suscripción o paciente.");
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0
    || !Number.isFinite(input.paidAt.getTime()) || !Number.isFinite(input.contract.createdAt.getTime())
    || !Number.isInteger(input.contract.installmentCount) || input.contract.installmentCount < 2 || input.contract.installmentCount > 12) {
    throw new Error("Importe, fecha o número de cuotas inválido.");
  }
  const db = database ?? (await import("./prisma")).prisma;
  const id = receiptTransactionId(input);
  const type = input.contract.kind === "sale" ? "income_new" : "income_renewal";
  const marker = receiptMarker(input);
  const identity = `${RECEIPT_PREFIX}provider=${input.provider} receipt=${encodeURIComponent(input.receiptId)} `;

  return db.$transaction<ReceiptResult>(async (tx) => {
    // Cast the void result so Prisma's raw result decoder receives supported text.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ff-receipt:${input.provider}:${input.receiptId}`}))::text`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`ff-installments:${input.contract.patientId}:${type}`}))::text`;
    const existing = await tx.transaction.findUnique({ where: { id } });
    if (existing) {
      if (existing.patientId !== input.contract.patientId || Math.round(existing.amount * 100) !== input.amountCents
        || !existing.description?.includes(`contract=${input.contract.kind}:${encodeURIComponent(input.contract.id)} `)) {
        throw new Error("El recibo ya existe con un paciente, contrato o importe diferente.");
      }
      return { status: "existing", transactionId: existing.id };
    }
    const adopted = await tx.transaction.findFirst({ where: { description: { contains: identity } } });
    if (adopted) {
      if (adopted.patientId !== input.contract.patientId || Math.round(adopted.amount * 100) !== input.amountCents
        || !adopted.description?.includes(`contract=${input.contract.kind}:${encodeURIComponent(input.contract.id)} `)) {
        throw new Error("El recibo adoptado tiene un paciente, contrato o importe diferente.");
      }
      return { status: "existing", transactionId: adopted.id };
    }

    const rows = await tx.transaction.findMany({
      where: {
        patientId: input.contract.patientId,
        type,
        category: `${input.contract.programType} ${input.contract.durationMonths}M`,
        amount: { gte: (input.amountCents - 0.1) / 100, lte: (input.amountCents + 0.1) / 100 },
        occurredAt: { gte: new Date(input.contract.createdAt.getTime() - 86400000) },
      },
      orderBy: { occurredAt: "asc" },
      take: 101,
      select: { id: true, amount: true, category: true, description: true, occurredAt: true },
    });
    if (rows.length > 100) return { status: "ambiguous", reason: "Demasiados movimientos históricos candidatos." };
    const assessment = assessLegacyReceipt(input, rows);
    if (assessment.status === "ambiguous") {
      return { status: "ambiguous", reason: "Hay movimientos antiguos sin identificador que podrían corresponder al recibo." };
    }
    if (assessment.status === "adopt") {
      if (input.dryRun) return { status: "would-adopt", transactionId: assessment.row.id };
      const original = assessment.row;
      await tx.transaction.update({
        where: { id: original.id },
        data: {
          description: `${original.description ?? "Cuota"} ${receiptMarker(input, original.occurredAt)}`,
          occurredAt: input.paidAt,
        },
      });
      return { status: "adopted", transactionId: original.id };
    }
    if (input.dryRun) return { status: "would-create", transactionId: id };
    const label = input.contract.kind === "renewal" ? "Renovación" : "Pago vía";
    const created = await tx.transaction.upsert({
      where: { id },
      update: {},
      create: {
        id,
        type,
        category: `${input.contract.programType} ${input.contract.durationMonths}M`,
        amount: input.amountCents / 100,
        occurredAt: input.paidAt,
        patientId: input.contract.patientId,
        professionalId: input.contract.professionalId,
        description: `${label} ${input.provider === "stripe" ? "Stripe" : "PayPal"} · ${input.contract.programType} ${input.contract.durationMonths} meses · cuota (plan de ${input.contract.installmentCount} pagos) ${marker}`,
      },
    });
    if (created.patientId !== input.contract.patientId || Math.round(created.amount * 100) !== input.amountCents) {
      throw new Error("El recibo ya existe con otro paciente o importe.");
    }
    return { status: "created", transactionId: created.id };
  }, { maxWait: 5000, timeout: 10000 });
}
