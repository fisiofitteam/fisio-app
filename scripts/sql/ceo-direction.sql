BEGIN;
CREATE TABLE IF NOT EXISTS "CeoPriority" (
  "id" TEXT PRIMARY KEY, "founderId" TEXT NOT NULL, "reportId" TEXT NOT NULL, "actionIndex" INTEGER NOT NULL,
  "title" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'planned',
  "dueDate" TIMESTAMP(3), "resultNote" TEXT NOT NULL DEFAULT '', "baselineJson" TEXT NOT NULL,
  "outcomeJson" TEXT, "version" INTEGER NOT NULL DEFAULT 0, "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoPriority_status_check" CHECK ("status" IN ('planned','in_progress','blocked','done','discarded')),
  CONSTRAINT "CeoPriority_actionIndex_check" CHECK ("actionIndex" BETWEEN 0 AND 2)
);
CREATE UNIQUE INDEX IF NOT EXISTS "CeoPriority_founderId_reportId_actionIndex_key" ON "CeoPriority" ("founderId","reportId","actionIndex");
CREATE INDEX IF NOT EXISTS "CeoPriority_founderId_updatedAt_idx" ON "CeoPriority" ("founderId","updatedAt");
CREATE TABLE IF NOT EXISTS "CeoPriorityEvent" (
  "id" TEXT PRIMARY KEY, "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "priorityId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL, "version" INTEGER NOT NULL, "status" TEXT NOT NULL, "detailJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoPriorityEvent_priorityId_fkey" FOREIGN KEY ("priorityId") REFERENCES "CeoPriority"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CeoPriorityEvent_requestId_key" ON "CeoPriorityEvent" ("requestId");
CREATE UNIQUE INDEX IF NOT EXISTS "CeoPriorityEvent_priorityId_version_key" ON "CeoPriorityEvent" ("priorityId","version");
CREATE INDEX IF NOT EXISTS "CeoPriorityEvent_priorityId_createdAt_idx" ON "CeoPriorityEvent" ("priorityId","createdAt");
CREATE TABLE IF NOT EXISTS "CeoDirectionSettings" (
  "founderId" TEXT PRIMARY KEY, "targetsJson" TEXT NOT NULL DEFAULT '[]', "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMIT;
