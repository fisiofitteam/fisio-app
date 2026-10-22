-- Additive migration. Apply before deploying the testimonials feature.
-- This migration does not rewrite or remove any existing patient data.
BEGIN;
CREATE TABLE IF NOT EXISTS "PatientEvidence" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER,
  "url" TEXT,
  "textContent" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatientEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientEvidence_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PatientEvidence_patientId_status_createdAt_idx" ON "PatientEvidence"("patientId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "PatientEvidence_status_createdAt_idx" ON "PatientEvidence"("status", "createdAt");
COMMIT;
