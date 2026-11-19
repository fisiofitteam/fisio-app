ALTER TABLE "PatientRecording" ADD COLUMN IF NOT EXISTS "transcript" TEXT;
ALTER TABLE "PatientRecording" ADD COLUMN IF NOT EXISTS "transcriptionStatus" TEXT NOT NULL DEFAULT 'off';
