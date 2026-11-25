BEGIN;
CREATE TABLE IF NOT EXISTS "PublicWodProfile" (
  "id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tokenHash" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "name" TEXT NOT NULL, "phone" TEXT NOT NULL, "profileJson" TEXT NOT NULL,
  "selfTestJson" TEXT, "healthConsentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consentVersion" TEXT NOT NULL, "marketingConsentAt" TIMESTAMP(3),
  "sourceJson" TEXT NOT NULL DEFAULT '{}', "helpRequestedAt" TIMESTAMP(3),
  "adaptationQuestionAt" TIMESTAMP(3), "whatsappClickedAt" TIMESTAMP(3),
  "followUpStatus" TEXT NOT NULL DEFAULT 'NEW', "managedById" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "PublicWodProfile_tokenHash_key" ON "PublicWodProfile"("tokenHash");
CREATE INDEX IF NOT EXISTS "PublicWodProfile_createdAt_idx" ON "PublicWodProfile"("createdAt");
CREATE INDEX IF NOT EXISTS "PublicWodProfile_lastUsedAt_idx" ON "PublicWodProfile"("lastUsedAt");
CREATE INDEX IF NOT EXISTS "PublicWodProfile_followUpStatus_idx" ON "PublicWodProfile"("followUpStatus");
CREATE TABLE IF NOT EXISTS "PublicWodEntry" (
  "id" TEXT PRIMARY KEY, "profileId" TEXT NOT NULL REFERENCES "PublicWodProfile"("id") ON DELETE CASCADE,
  "requestId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "rawText" TEXT NOT NULL,
  "readiness" TEXT NOT NULL, "inputJson" TEXT NOT NULL, "profileSnapshot" TEXT NOT NULL,
  "resultJson" TEXT NOT NULL, "feedbackJson" TEXT, "completedAt" TIMESTAMP(3), "engineVersion" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "PublicWodEntry_profileId_requestId_key" ON "PublicWodEntry"("profileId","requestId");
CREATE INDEX IF NOT EXISTS "PublicWodEntry_profileId_createdAt_idx" ON "PublicWodEntry"("profileId","createdAt");
CREATE TABLE IF NOT EXISTS "PublicWodRateLimit" (
  "key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "PublicWodRateLimit_expiresAt_idx" ON "PublicWodRateLimit"("expiresAt");
COMMIT;
