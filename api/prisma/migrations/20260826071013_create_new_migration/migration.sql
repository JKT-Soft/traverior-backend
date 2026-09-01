-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('draft', 'planning', 'ready', 'active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('JOURNEY', 'CHECKPOINT', 'LEG', 'ACTIVITY', 'POI', 'BOOKING', 'MODULE', 'LEAF');

-- CreateEnum
CREATE TYPE "CheckpointKind" AS ENUM ('ORIGIN', 'TRANSIT', 'STAY', 'DAY_TRIP', 'RETURN');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('planned', 'active', 'completed', 'disrupted', 'skipped');

-- CreateEnum
CREATE TYPE "NodeOrigin" AS ENUM ('ai', 'user', 'api');

-- CreateEnum
CREATE TYPE "BudgetStyle" AS ENUM ('budget', 'balanced', 'luxury');

-- CreateEnum
CREATE TYPE "Pace" AS ENUM ('relaxed', 'moderate', 'packed');

-- CreateEnum
CREATE TYPE "TravelWith" AS ENUM ('solo', 'couple', 'family', 'friends');

-- CreateEnum
CREATE TYPE "EditAction" AS ENUM ('add', 'edit', 'delete', 'lock', 'unlock', 'reorder', 'replace', 'replan');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "photoUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'id',
    "homeCurrency" TEXT NOT NULL DEFAULT 'IDR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "budgetMax" DECIMAL(14,2),
    "budgetStyle" "BudgetStyle" NOT NULL DEFAULT 'balanced',
    "pace" "Pace" NOT NULL DEFAULT 'moderate',
    "dietary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "travelWith" "TravelWith",
    "avoid" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extra" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'draft',
    "originCity" TEXT,
    "destinationSummary" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "baseCurrency" TEXT NOT NULL DEFAULT 'IDR',
    "totalCostAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalCostIsEstimate" BOOLEAN NOT NULL DEFAULT true,
    "totalDurationMinutes" INTEGER NOT NULL DEFAULT 0,
    "rootNodeId" UUID,
    "planningVersion" INTEGER NOT NULL DEFAULT 0,
    "lastPlannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineNode" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "parentId" UUID,
    "depth" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "type" "NodeType" NOT NULL,
    "checkpointKind" "CheckpointKind",
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "status" "NodeStatus" NOT NULL DEFAULT 'planned',
    "contentType" TEXT,
    "content" JSONB,
    "costAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "costCurrency" TEXT NOT NULL DEFAULT 'IDR',
    "costIsEstimate" BOOLEAN NOT NULL DEFAULT true,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "distanceMeters" INTEGER,
    "scheduleStart" TIMESTAMP(3),
    "scheduleEnd" TIMESTAMP(3),
    "locationLat" DOUBLE PRECISION,
    "locationLng" DOUBLE PRECISION,
    "locationLabel" TEXT,
    "deepLinkUrl" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "origin" "NodeOrigin" NOT NULL DEFAULT 'ai',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "userNotes" TEXT,
    "suppressAiRestore" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "lastRefreshedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineEditLog" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "nodeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" "EditAction" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineEditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripAlert" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "nodeId" UUID,
    "kind" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'info',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCache" (
    "id" UUID NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("base","quote")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "Trip_userId_status_idx" ON "Trip"("userId", "status");

-- CreateIndex
CREATE INDEX "Trip_userId_updatedAt_idx" ON "Trip"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "PipelineNode_tripId_parentId_sortOrder_idx" ON "PipelineNode"("tripId", "parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "PipelineNode_tripId_path_idx" ON "PipelineNode"("tripId", "path");

-- CreateIndex
CREATE INDEX "PipelineNode_tripId_type_idx" ON "PipelineNode"("tripId", "type");

-- CreateIndex
CREATE INDEX "PipelineNode_tripId_deletedAt_idx" ON "PipelineNode"("tripId", "deletedAt");

-- CreateIndex
CREATE INDEX "PipelineEditLog_tripId_createdAt_idx" ON "PipelineEditLog"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineEditLog_nodeId_createdAt_idx" ON "PipelineEditLog"("nodeId", "createdAt");

-- CreateIndex
CREATE INDEX "TripAlert_tripId_isRead_createdAt_idx" ON "TripAlert"("tripId", "isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCache_cacheKey_key" ON "ProviderCache"("cacheKey");

-- CreateIndex
CREATE INDEX "ProviderCache_expiresAt_idx" ON "ProviderCache"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineNode" ADD CONSTRAINT "PipelineNode_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineNode" ADD CONSTRAINT "PipelineNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PipelineNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineEditLog" ADD CONSTRAINT "PipelineEditLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineEditLog" ADD CONSTRAINT "PipelineEditLog_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "PipelineNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineEditLog" ADD CONSTRAINT "PipelineEditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripAlert" ADD CONSTRAINT "TripAlert_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripAlert" ADD CONSTRAINT "TripAlert_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "PipelineNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
