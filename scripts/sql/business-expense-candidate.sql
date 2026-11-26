-- Additive migration; no changes to historical transactions.
BEGIN;
CREATE TABLE IF NOT EXISTS "BusinessExpenseCandidate" (
  "id" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "merchant" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "transactionId" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessExpenseCandidate_source_sourceRef_key" ON "BusinessExpenseCandidate" ("source","sourceRef");
CREATE UNIQUE INDEX IF NOT EXISTS "BusinessExpenseCandidate_transactionId_key" ON "BusinessExpenseCandidate" ("transactionId");
CREATE INDEX IF NOT EXISTS "BusinessExpenseCandidate_status_occurredAt_idx" ON "BusinessExpenseCandidate" ("status","occurredAt");
COMMIT;
