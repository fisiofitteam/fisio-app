BEGIN;
CREATE TABLE IF NOT EXISTS "PontoBankAccount" (
 "id" TEXT PRIMARY KEY, "label" TEXT NOT NULL, "maskedReference" TEXT NOT NULL, "currency" TEXT NOT NULL,
 "currentBalanceCents" INTEGER, "availableBalanceCents" INTEGER, "balanceAt" TIMESTAMP(3),
 "authorizationExpiresAt" TIMESTAMP(3), "transactionsAt" TIMESTAMP(3), "lastImportedAt" TIMESTAMP(3), "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS "BankMovement" (
 "id" TEXT PRIMARY KEY, "duplicateOfId" TEXT, "accountId" TEXT NOT NULL, "externalId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL,
 "merchant" TEXT NOT NULL, "merchantKey" TEXT NOT NULL, "description" TEXT NOT NULL, "category" TEXT NOT NULL,
 "personal" BOOLEAN NOT NULL DEFAULT false, "reason" TEXT NOT NULL, "conflict" BOOLEAN NOT NULL DEFAULT false,
 "candidateId" TEXT, "stripePayoutId" TEXT, "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "BankMovement_accountId_externalId_key" ON "BankMovement" ("accountId","externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "BankMovement_candidateId_key" ON "BankMovement" ("candidateId");
CREATE UNIQUE INDEX IF NOT EXISTS "BankMovement_stripePayoutId_key" ON "BankMovement" ("stripePayoutId");
CREATE INDEX IF NOT EXISTS "BankMovement_accountId_occurredAt_idx" ON "BankMovement" ("accountId","occurredAt");
CREATE INDEX IF NOT EXISTS "BankMovement_merchantKey_occurredAt_idx" ON "BankMovement" ("merchantKey","occurredAt");
CREATE TABLE IF NOT EXISTS "BankClassificationRule" (
 "id" TEXT PRIMARY KEY, "merchantKey" TEXT NOT NULL, "amountCents" INTEGER, "category" TEXT NOT NULL,
 "personal" BOOLEAN NOT NULL DEFAULT false, "enabled" BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BankClassificationRule_merchantKey_idx" ON "BankClassificationRule" ("merchantKey");
CREATE TABLE IF NOT EXISTS "BankSyncState" (
 "selectedAccountIds" TEXT NOT NULL DEFAULT '[]',
 "id" TEXT PRIMARY KEY, "paused" BOOLEAN NOT NULL DEFAULT false, "leaseId" TEXT, "leaseUntil" TIMESTAMP(3),
 "lastAttemptAt" TIMESTAMP(3), "lastSuccessAt" TIMESTAMP(3), "lastError" TEXT, "stripeStatus" TEXT
);
COMMIT;
