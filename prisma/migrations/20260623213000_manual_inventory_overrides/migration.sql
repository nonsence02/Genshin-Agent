ALTER TABLE "ManualInventoryOverride"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'absolute',
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "metadata" JSONB;

CREATE INDEX "ManualInventoryOverride_playerId_materialId_idx" ON "ManualInventoryOverride"("playerId", "materialId");
CREATE INDEX "ManualInventoryOverride_playerId_active_idx" ON "ManualInventoryOverride"("playerId", "active");
