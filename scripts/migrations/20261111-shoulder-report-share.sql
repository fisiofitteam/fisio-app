-- Frozen share, distinct from the original and its future clinical drafts.
-- One live capability per publication session. A lost link can be replaced.
CREATE TABLE IF NOT EXISTS "ShoulderReportShare" (
  "sessionId" TEXT PRIMARY KEY REFERENCES "ShoulderPilotReview"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE,
  "patientId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "reportJson" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "baselinePublishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShoulderReportShare_tokenHash_key" ON "ShoulderReportShare"("tokenHash");
