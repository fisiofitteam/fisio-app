-- Explicit classification for an existing, fully reconciled checkout that funded a first program.
-- Do not rewrite provider source IDs or infer first sales from an empty receipt.
ALTER TABLE "RenewalCheckout" ADD COLUMN IF NOT EXISTS "isInitialSale" BOOLEAN NOT NULL DEFAULT false;
