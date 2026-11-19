CREATE TABLE IF NOT EXISTS "PatientRecording" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL REFERENCES "Patient"("id") ON DELETE CASCADE,
  "createdById" TEXT REFERENCES "Professional"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "url" TEXT, "notes" TEXT,
  "blobPath" TEXT, "mime" TEXT, "size" INTEGER, "durationSeconds" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'uploading', "pendingUntil" TIMESTAMP(3),
  "shareTokenHash" TEXT, "shareExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PatientRecording_patientId_createdAt_idx" ON "PatientRecording"("patientId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PatientRecording_blobPath_key" ON "PatientRecording"("blobPath");
CREATE UNIQUE INDEX IF NOT EXISTS "PatientRecording_shareTokenHash_key" ON "PatientRecording"("shareTokenHash");
