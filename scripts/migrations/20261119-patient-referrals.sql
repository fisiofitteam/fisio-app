-- Additive referral attribution. No patient access tokens or payment data are reused.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_referralCode_key" ON "Patient"("referralCode");
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "referredByPatientId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "referralRewardPaidAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "referralRewardPaidById" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_referredByPatientId_idx" ON "Lead"("referredByPatientId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_referredByPatientId_fkey') THEN
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_referredByPatientId_fkey"
      FOREIGN KEY ("referredByPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
