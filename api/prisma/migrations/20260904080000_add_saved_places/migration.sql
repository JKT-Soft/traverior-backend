-- CreateTable
CREATE TABLE "SavedPlace" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'user',
    "provider" TEXT,
    "providerRef" TEXT,
    "tripId" UUID,
    "nodeId" UUID,
    "notes" TEXT,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedPlace_userId_createdAt_idx" ON "SavedPlace"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedPlace_userId_nodeId_idx" ON "SavedPlace"("userId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPlace_userId_provider_providerRef_key" ON "SavedPlace"("userId", "provider", "providerRef");

-- AddForeignKey
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "PipelineNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
