BEGIN;
CREATE TABLE IF NOT EXISTS "SupportConversation" (
  "id" TEXT PRIMARY KEY, "professionalId" TEXT NOT NULL UNIQUE, "version" INTEGER NOT NULL DEFAULT 0,
  "busyUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "SupportMessage" (
  "id" TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL REFERENCES "SupportConversation"("id") ON DELETE CASCADE,
  "requestId" TEXT NOT NULL UNIQUE, "role" TEXT NOT NULL, "text" TEXT NOT NULL, "answerJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SupportMessage_conversationId_createdAt_idx" ON "SupportMessage"("conversationId", "createdAt");
CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE, "reporterId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new', "priority" TEXT NOT NULL DEFAULT 'normal', "path" TEXT NOT NULL,
  "contextJson" TEXT NOT NULL, "conversationJson" TEXT NOT NULL DEFAULT '[]', "version" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SupportTicket_reporterId_updatedAt_idx" ON "SupportTicket"("reporterId", "updatedAt");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");
CREATE TABLE IF NOT EXISTS "SupportTicketEvent" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL UNIQUE,
  "ticketId" TEXT NOT NULL REFERENCES "SupportTicket"("id") ON DELETE CASCADE,
  "authorId" TEXT NOT NULL, "body" TEXT NOT NULL, "status" TEXT, "priority" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SupportTicketEvent_ticketId_createdAt_idx" ON "SupportTicketEvent"("ticketId", "createdAt");
ALTER TABLE "SupportTicket" ADD COLUMN IF NOT EXISTS "linksJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "SupportTicketEvent" ADD COLUMN IF NOT EXISTS "linksJson" TEXT NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS "SupportAttachment" (
  "id" TEXT PRIMARY KEY, "createdById" TEXT NOT NULL,
  "ticketId" TEXT REFERENCES "SupportTicket"("id") ON DELETE CASCADE,
  "eventId" TEXT REFERENCES "SupportTicketEvent"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL, "mime" TEXT NOT NULL, "size" INTEGER NOT NULL,
  "blobPath" TEXT NOT NULL UNIQUE, "url" TEXT, "status" TEXT NOT NULL DEFAULT 'pending',
  "pendingUntil" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SupportAttachment_createdById_createdAt_idx" ON "SupportAttachment"("createdById", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportAttachment_ticketId_eventId_idx" ON "SupportAttachment"("ticketId", "eventId");
COMMIT;
