BEGIN;
-- CreateTable
CREATE TABLE IF NOT EXISTS "CeoAgentConfig" (
    "founderId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cadenceHours" INTEGER NOT NULL DEFAULT 24,
    "instructions" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "lastScheduledAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeoAgentConfig_pkey" PRIMARY KEY ("founderId","agentId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CeoAgentTask" (
    "id" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "dependenciesJson" TEXT NOT NULL DEFAULT '[]',
    "parentId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeoAgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CeoAgentRun" (
    "id" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "resultJson" TEXT,
    "model" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "budgetMonth" TEXT,
    "reservedMicros" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER,
    "costKind" TEXT NOT NULL DEFAULT 'none',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CeoAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CeoAgentBudget" (
    "founderId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "spentMicros" INTEGER NOT NULL DEFAULT 0,
    "reservedMicros" INTEGER NOT NULL DEFAULT 0,
    "halted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CeoAgentBudget_pkey" PRIMARY KEY ("founderId","month")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CeoBusinessMemory" (
    "id" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'shared',
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "author" TEXT NOT NULL,
    "sourceRunId" TEXT,
    "metricKey" TEXT,
    "baselineValue" DOUBLE PRECISION,
    "targetValue" DOUBLE PRECISION,
    "outcomeValue" DOUBLE PRECISION,
    "outcomeNote" TEXT,
    "reviewAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeoBusinessMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CeoAgentEvent" (
    "id" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detailJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeoAgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CeoAgentMessage" (
    "id" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeoAgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CeoAgentTask_founderId_status_priority_createdAt_idx" ON "CeoAgentTask"("founderId", "status", "priority", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CeoAgentTask_founderId_requestKey_key" ON "CeoAgentTask"("founderId", "requestKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CeoAgentRun_founderId_agentId_startedAt_idx" ON "CeoAgentRun"("founderId", "agentId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CeoAgentRun_taskId_idx" ON "CeoAgentRun"("taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CeoBusinessMemory_founderId_scope_status_reviewAt_idx" ON "CeoBusinessMemory"("founderId", "scope", "status", "reviewAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CeoAgentEvent_founderId_createdAt_idx" ON "CeoAgentEvent"("founderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CeoAgentMessage_taskId_key" ON "CeoAgentMessage"("taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CeoAgentMessage_founderId_createdAt_idx" ON "CeoAgentMessage"("founderId", "createdAt");


COMMIT;
