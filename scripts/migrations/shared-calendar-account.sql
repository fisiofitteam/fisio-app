ALTER TABLE "GoogleCalendarConnection" ADD COLUMN IF NOT EXISTS "isOrganizational" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "googleCalendarEmail" TEXT;
UPDATE "GoogleCalendarConnection" SET "isOrganizational" = true WHERE id = (SELECT id FROM "GoogleCalendarConnection" WHERE "professionalId" IS NULL ORDER BY "createdAt" DESC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM "GoogleCalendarConnection" WHERE "isOrganizational" = true);
UPDATE "Lead" SET "googleCalendarEmail" = (SELECT "googleEmail" FROM "GoogleCalendarConnection" WHERE "isOrganizational" = true LIMIT 1) WHERE "googleEventId" IS NOT NULL AND "googleCalendarEmail" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "GoogleCalendarConnection_one_organizational" ON "GoogleCalendarConnection" ("isOrganizational") WHERE "isOrganizational" = true;
