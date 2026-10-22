
ALTER TABLE "ProgramTask" ADD COLUMN IF NOT EXISTS "assessment" TEXT;
CREATE TABLE IF NOT EXISTS "AssessmentVideo" (
 "id" TEXT PRIMARY KEY, "patientId" TEXT NOT NULL REFERENCES "Patient"("id") ON DELETE CASCADE,
 "sessionId" TEXT REFERENCES "ProgramSession"("id") ON DELETE SET NULL,
 "taskId" TEXT NOT NULL, "testId" TEXT NOT NULL, "assessmentTitle" TEXT NOT NULL,
 "testTitle" TEXT NOT NULL, "assessedAt" TIMESTAMP(3) NOT NULL,
 "url" TEXT, "uploadedAt" TIMESTAMP(3), "reviewedAt" TIMESTAMP(3), "reviewedById" TEXT,
 "coachNotes" TEXT NOT NULL DEFAULT '', "pendingPath" TEXT, "pendingMime" TEXT,
 "pendingSize" INTEGER, "pendingUntil" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AssessmentVideo_sessionId_taskId_testId_key" ON "AssessmentVideo"("sessionId","taskId","testId");
CREATE INDEX IF NOT EXISTS "AssessmentVideo_patientId_assessedAt_idx" ON "AssessmentVideo"("patientId","assessedAt");
CREATE INDEX IF NOT EXISTS "AssessmentVideo_uploadedAt_idx" ON "AssessmentVideo"("uploadedAt");
