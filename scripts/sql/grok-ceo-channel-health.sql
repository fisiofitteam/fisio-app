-- Metadata only, no alteration of existing message contents.
BEGIN;
ALTER TABLE "GrokCeoExchange" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
CREATE TABLE IF NOT EXISTS "GrokCeoChannelState" (
  "founderId" TEXT PRIMARY KEY,
  "lastPollAt" TIMESTAMP(3),
  "lastReplyAt" TIMESTAMP(3)
);
COMMIT;
