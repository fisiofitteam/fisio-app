-- Additive migration. No session, upload, or clinical history is rewritten.
CREATE TABLE IF NOT EXISTS "ShoulderPilotProtocol" (
 "assignmentId" TEXT PRIMARY KEY REFERENCES "ProgramAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "rubricVersion" TEXT NOT NULL, "configJson" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "ShoulderPilotReview" (
 "sessionId" TEXT PRIMARY KEY REFERENCES "ProgramSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "version" INTEGER NOT NULL DEFAULT 0, "aiConsent" BOOLEAN NOT NULL DEFAULT false, "aiConsentAt" TIMESTAMP(3),
 "painJson" TEXT NOT NULL DEFAULT '{}', "loadsJson" TEXT NOT NULL DEFAULT '{}',
 "observationsJson" TEXT NOT NULL DEFAULT '{}', "reviewedJson" TEXT NOT NULL DEFAULT '{}',
 "notAssessableJson" TEXT NOT NULL DEFAULT '{}', "publishedJson" TEXT, "publishedAt" TIMESTAMP(3), "publishedById" TEXT,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
