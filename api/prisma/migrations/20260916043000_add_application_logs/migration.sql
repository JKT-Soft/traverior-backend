-- CreateTable
CREATE TABLE "ApplicationLog" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "source" TEXT,
    "status" TEXT,
    "message" TEXT,
    "userId" UUID,
    "tripId" UUID,
    "payload" JSONB,
    "result" JSONB,
    "error" JSONB,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationLog_type_startedAt_idx" ON "ApplicationLog"("type", "startedAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_level_startedAt_idx" ON "ApplicationLog"("level", "startedAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_status_startedAt_idx" ON "ApplicationLog"("status", "startedAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_tripId_startedAt_idx" ON "ApplicationLog"("tripId", "startedAt");

-- CreateIndex
CREATE INDEX "ApplicationLog_userId_startedAt_idx" ON "ApplicationLog"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "ApplicationLog" ADD CONSTRAINT "ApplicationLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationLog" ADD CONSTRAINT "ApplicationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
