-- Additive cache, separate from manual lead notes and the post-call summary.
CREATE TABLE IF NOT EXISTS "SkalexCallInsight" (
  "leadId" TEXT NOT NULL PRIMARY KEY,
  "identityKey" TEXT NOT NULL,
  "payload" TEXT,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SkalexCallInsight_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
