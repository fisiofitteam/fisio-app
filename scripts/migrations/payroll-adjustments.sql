CREATE TABLE IF NOT EXISTS "PayrollAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceKey" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL REFERENCES "Professional"("id") ON DELETE RESTRICT,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL CHECK ("month" BETWEEN 0 AND 11),
  "amountCents" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollAdjustment_sourceKey_key" ON "PayrollAdjustment"("sourceKey");
CREATE INDEX IF NOT EXISTS "PayrollAdjustment_professionalId_year_month_idx" ON "PayrollAdjustment"("professionalId", "year", "month");
