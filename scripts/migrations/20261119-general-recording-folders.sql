ALTER TABLE "PatientRecording" ALTER COLUMN "patientId" DROP NOT NULL;
CREATE TABLE IF NOT EXISTS "RecordingFolder" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "professionalId" TEXT NOT NULL REFERENCES "Professional"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecordingFolder_professionalId_name_key" ON "RecordingFolder"("professionalId", "name");
CREATE TABLE IF NOT EXISTS "RecordingFolderEntry" (
 "recordingId" TEXT NOT NULL REFERENCES "PatientRecording"("id") ON DELETE CASCADE,
 "professionalId" TEXT NOT NULL REFERENCES "Professional"("id") ON DELETE CASCADE,
 "folderId" TEXT NOT NULL REFERENCES "RecordingFolder"("id") ON DELETE CASCADE,
 PRIMARY KEY ("recordingId", "professionalId")
);
CREATE INDEX IF NOT EXISTS "RecordingFolderEntry_folderId_idx" ON "RecordingFolderEntry"("folderId");
CREATE INDEX IF NOT EXISTS "RecordingFolderEntry_professionalId_idx" ON "RecordingFolderEntry"("professionalId");
CREATE INDEX IF NOT EXISTS "PatientRecording_createdById_patientId_idx" ON "PatientRecording"("createdById", "patientId");
