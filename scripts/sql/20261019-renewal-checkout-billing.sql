-- PostgreSQL: apply BEFORE deploying code that reads these optional columns.
-- Additive and repeatable. Existing rows remain NULL; no historical backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE "RenewalCheckout"
  ADD COLUMN IF NOT EXISTS "grossAmountCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "depositAppliedCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "reservationId" TEXT;
COMMIT;
