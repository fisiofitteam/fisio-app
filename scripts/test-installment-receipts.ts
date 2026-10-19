import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import {
  recordInstallmentReceipt, receiptTransactionId, receiptMarker,
  type InstallmentReceipt, type LegacyReceiptRow,
} from "../lib/installment-receipts";

type Row = LegacyReceiptRow & { patientId: string; type: string; professionalId?: string | null };

// No Prisma connection or provider network. Exercise the writer with a
// transactional in-memory adapter, including concurrent deliveries.
function database(initial: Row[] = []) {
  let rows = structuredClone(initial);
  let tail = Promise.resolve();
  let locks = 0;
  const db = {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      const before = structuredClone(rows);
      const tx = {
        $queryRaw: async () => { locks++; return []; },
        transaction: {
          findUnique: async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
          findFirst: async ({ where }: any) => rows.find((r) => r.description?.includes(where.description.contains)) ?? null,
          findMany: async ({ where, take }: any) => rows.filter((r) =>
            r.patientId === where.patientId && r.type === where.type && r.category === where.category
            && r.amount >= where.amount.gte && r.amount <= where.amount.lte
            && r.occurredAt >= where.occurredAt.gte,
          ).slice(0, take),
          update: async ({ where, data }: any) => {
            const row = rows.find((r) => r.id === where.id)!;
            Object.assign(row, data);
            return row;
          },
          upsert: async ({ where, create }: any) => {
            const row = rows.find((r) => r.id === where.id);
            if (row) return row;
            rows.push(structuredClone(create));
            return create;
          },
        },
      };
      try { return await run(tx); }
      catch (error) { rows = before; throw error; }
      finally { release(); }
    },
  } as unknown as Pick<PrismaClient, "$transaction">;
  return { db, rows: () => rows, locks: () => locks };
}

const input: InstallmentReceipt = {
  provider: "stripe", receiptId: "in_actual_july", subscriptionId: "sub_contract1",
  amountCents: 20037, paidAt: new Date("2026-07-03T10:20:00Z"),
  contract: {
    kind: "sale", id: "sale_contract1", patientId: "patient1", programType: "RECUPERA",
    durationMonths: 4, installmentCount: 3, professionalId: "closer1",
    createdAt: new Date("2026-07-01T09:00:00Z"),
  },
};
const legacy = (id: string, minutes = 1): Row => ({
  id, patientId: input.contract.patientId, type: "income_new", category: "RECUPERA 4M",
  amount: 200.37, description: "Pago vía Stripe · RECUPERA 4 meses · cuota 1/3",
  occurredAt: new Date(input.paidAt.getTime() + minutes * 60000),
});

async function main() {
  let passed = 0;
  const check = async (name: string, run: () => Promise<void>) => { await run(); passed++; console.log(`✓ ${name}`); };

  await check("Records only the actual installment with cents and historic paid date", async () => {
    const mem = database();
    assert.equal((await recordInstallmentReceipt(input, mem.db)).status, "created");
    assert.equal(mem.rows().length, 1);
    assert.equal(mem.rows()[0].amount, 200.37); // not the full contract or future installments
    assert.equal(mem.rows()[0].occurredAt.toISOString(), "2026-07-03T10:20:00.000Z");
    assert.ok(mem.rows()[0].description?.includes("contract=sale:sale_contract1 subscription=sub_contract1"));
  });
  await check("Concurrent delivery of one provider receipt cannot create duplicate cash", async () => {
    const mem = database();
    const results = await Promise.all(Array.from({ length: 5 }, () => recordInstallmentReceipt(input, mem.db)));
    assert.equal(results.filter((r) => r.status === "created").length, 1);
    assert.equal(mem.rows().length, 1);
    assert.equal(mem.locks(), 10); // provider identity + patient legacy serialization
  });
  await check("Later monthly receipt is independent and keeps its actual month", async () => {
    const mem = database();
    await recordInstallmentReceipt(input, mem.db);
    await recordInstallmentReceipt({ ...input, receiptId: "in_actual_august", paidAt: new Date("2026-08-03T10:20:00Z") }, mem.db);
    assert.equal(mem.rows().length, 2);
    assert.equal(mem.rows().reduce((sum, row) => sum + row.amount, 0), 400.74);
    assert.equal(mem.rows()[1].occurredAt.getUTCMonth(), 7);
  });
  await check("PayPal and Stripe receipt identities cannot collide", async () => {
    const mem = database();
    await recordInstallmentReceipt(input, mem.db);
    await recordInstallmentReceipt({ ...input, provider: "paypal", subscriptionId: "I-CONTRACT", receiptId: input.receiptId }, mem.db);
    assert.equal(mem.rows().length, 2);
    assert.notEqual(mem.rows()[0].id, mem.rows()[1].id);
  });
  await check("A uniquely corroborated old receipt keeps its ID and amount", async () => {
    const mem = database([legacy("old_random_id")]);
    const result = await recordInstallmentReceipt(input, mem.db);
    assert.deepEqual(result, { status: "adopted", transactionId: "old_random_id" });
    assert.equal(mem.rows().length, 1);
    assert.equal(mem.rows()[0].id, "old_random_id");
    assert.equal(mem.rows()[0].amount, 200.37);
    assert.ok(mem.rows()[0].description?.includes("legacyOccurredAt=2026-07-03T10:21:00.000Z"));
    assert.equal(mem.rows()[0].occurredAt.toISOString(), input.paidAt.toISOString());
    const adoptedText = mem.rows()[0].description;
    assert.equal((await recordInstallmentReceipt(input, mem.db)).status, "existing");
    assert.equal(mem.rows()[0].description, adoptedText);
  });
  await check("Ambiguous legacy duplicates are reported without changing or deleting records", async () => {
    const mem = database([legacy("old1"), legacy("old2", 2)]);
    const before = structuredClone(mem.rows());
    assert.equal((await recordInstallmentReceipt(input, mem.db)).status, "ambiguous");
    assert.deepEqual(mem.rows(), before);
  });
  await check("Delayed legacy receipt is not mistaken for a missing cash payment", async () => {
    const mem = database([legacy("late_old", 1440)]);
    assert.equal((await recordInstallmentReceipt(input, mem.db)).status, "ambiguous");
    assert.equal(mem.rows().length, 1);
  });
  await check("Unlabelled same-time manual cash is ambiguous, not silently duplicated", async () => {
    const row = legacy("manual"); row.description = "Ingreso manual";
    const mem = database([row]);
    assert.equal((await recordInstallmentReceipt(input, mem.db)).status, "ambiguous");
    assert.equal(mem.rows().length, 1);
  });
  await check("Dry run previews creation/adoption and leaves all rows unchanged", async () => {
    const empty = database();
    assert.equal((await recordInstallmentReceipt({ ...input, dryRun: true }, empty.db)).status, "would-create");
    assert.equal(empty.rows().length, 0);
    const old = database([legacy("old")]);
    const before = structuredClone(old.rows());
    assert.equal((await recordInstallmentReceipt({ ...input, dryRun: true }, old.db)).status, "would-adopt");
    assert.deepEqual(old.rows(), before);
  });
  await check("Receipt cannot be reassigned to another patient or amount", async () => {
    const mem = database();
    await recordInstallmentReceipt(input, mem.db);
    await assert.rejects(() => recordInstallmentReceipt({ ...input, amountCents: 99999 }, mem.db));
    await assert.rejects(() => recordInstallmentReceipt({ ...input, contract: { ...input.contract, patientId: "other" } }, mem.db));
    assert.equal(mem.rows().length, 1);
    assert.equal(mem.rows()[0].amount, 200.37);
  });
  await check("Invalid amount, paid date or installment count cannot write cash", async () => {
    const mem = database();
    for (const bad of [{ amountCents: 0 }, { amountCents: -10 }, { paidAt: new Date("invalid") }, { contract: { ...input.contract, installmentCount: 0 } }]) {
      await assert.rejects(() => recordInstallmentReceipt({ ...input, ...bad }, mem.db));
    }
    assert.equal(mem.rows().length, 0);
  });
  await check("Renewal receipt has separate contract marker and renewal income type", async () => {
    const mem = database();
    const renewal = { ...input, contract: { ...input.contract, kind: "renewal" as const, id: "renewal1" } };
    await recordInstallmentReceipt(renewal, mem.db);
    assert.equal(mem.rows()[0].type, "income_renewal");
    assert.ok(mem.rows()[0].description?.includes("contract=renewal:renewal1"));
    assert.equal(mem.rows()[0].id, receiptTransactionId(input));
    assert.ok(receiptMarker(renewal).includes("subscription=sub_contract1"));
  });
  console.log(`${passed} installment receipt checks passed; no database or payment API used.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
