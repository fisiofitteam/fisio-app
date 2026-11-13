-- Only newly generated first-sale links use these fields. Existing receipts stay untouched.
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "grossAmountCents" INTEGER;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "depositAppliedCents" INTEGER;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "firstSaleReservationId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "initialPeriodId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "checkoutStartedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Sale_initial_program_pending_patient" ON "Sale" ("patientId") WHERE "grossAmountCents" IS NOT NULL AND "status" = 'pending';
