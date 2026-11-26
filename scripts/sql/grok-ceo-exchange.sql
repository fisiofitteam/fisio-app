-- Additive migration only. Apply once to the intended PostgreSQL database.
BEGIN;
CREATE TABLE IF NOT EXISTS "GrokCeoExchange" (
  "id" TEXT PRIMARY KEY,
  "founderId" TEXT NOT NULL,
  "reportId" TEXT,
  "decisionIndex" INTEGER,
  "kind" TEXT NOT NULL,
  "decision" TEXT,
  "question" TEXT,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "response" TEXT,
  "respondedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "GrokCeoExchange_founderId_reportId_decisionIndex_key" ON "GrokCeoExchange" ("founderId","reportId","decisionIndex");
CREATE INDEX IF NOT EXISTS "GrokCeoExchange_founderId_createdAt_idx" ON "GrokCeoExchange" ("founderId","createdAt");
CREATE INDEX IF NOT EXISTS "GrokCeoExchange_founderId_respondedAt_createdAt_idx" ON "GrokCeoExchange" ("founderId","respondedAt","createdAt");
COMMIT;
