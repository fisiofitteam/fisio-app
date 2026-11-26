/** Only additive DDL for this feature. Never db push the shared production schema. */
export const METODO_MIGRATION = [
  `CREATE TABLE IF NOT EXISTS "MetodoVisitor" ("id" TEXT PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sourceJson" TEXT NOT NULL, "consentVersion" TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "MetodoEvent" ("id" TEXT PRIMARY KEY, "visitorId" TEXT NOT NULL REFERENCES "MetodoVisitor"("id") ON DELETE CASCADE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "type" TEXT NOT NULL, "target" TEXT NOT NULL, "value" INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS "MetodoEvent_createdAt_type_idx" ON "MetodoEvent"("createdAt", "type")`,
  `CREATE INDEX IF NOT EXISTS "MetodoEvent_visitorId_idx" ON "MetodoEvent"("visitorId")`,
  `CREATE TABLE IF NOT EXISTS "MetodoContact" ("reference" TEXT PRIMARY KEY, "visitorId" TEXT REFERENCES "MetodoVisitor"("id") ON DELETE SET NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "sourceJson" TEXT NOT NULL, "placement" TEXT NOT NULL, "confirmedAt" TIMESTAMP(3), "confirmedById" TEXT, "evidence" TEXT, "leadId" TEXT UNIQUE REFERENCES "Lead"("id") ON DELETE SET NULL)`,
  `CREATE INDEX IF NOT EXISTS "MetodoContact_createdAt_idx" ON "MetodoContact"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "MetodoContact_visitorId_idx" ON "MetodoContact"("visitorId")`,
  `CREATE TABLE IF NOT EXISTS "MetodoAudit" ("id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "reference" TEXT NOT NULL, "detail" TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "MetodoRateLimit" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS "MetodoRateLimit_expiresAt_idx" ON "MetodoRateLimit"("expiresAt")`,
  // Valoración form: operational contact request with explicit health-data consent. Not analytics.
  `CREATE TABLE IF NOT EXISTS "MetodoRequest" ("id" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "name" TEXT NOT NULL, "phone" TEXT NOT NULL, "zone" TEXT NOT NULL, "duration" TEXT NOT NULL, "impact" TEXT NOT NULL, "sport" TEXT NOT NULL, "tried" TEXT NOT NULL, "detail" TEXT, "origin" TEXT, "reference" TEXT, "consentAt" TIMESTAMP(3) NOT NULL, "consentVersion" TEXT NOT NULL, "handledAt" TIMESTAMP(3), "handledById" TEXT)`,
  `CREATE INDEX IF NOT EXISTS "MetodoRequest_createdAt_idx" ON "MetodoRequest"("createdAt")`,
] as const;
