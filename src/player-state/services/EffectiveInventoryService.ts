import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import type { ManualInventoryOverrideMode } from "./ManualInventoryOverrideService.js";

export interface EffectiveInventoryInput {
  playerKey: string;
  inventorySnapshotId?: number;
  includeManualOverrides?: boolean;
}

export interface EffectiveInventoryItem {
  materialId: number;
  stableKey: string;
  name: string;
  snapshotQuantity: number;
  overrideMode?: ManualInventoryOverrideMode;
  overrideQuantity?: number;
  effectiveQuantity: number;
  overrideActive: boolean;
}

export interface EffectiveInventoryResult {
  player: {
    id: number;
    stableKey: string;
  };
  snapshot: {
    id: number;
    source: string;
    createdAt: string;
  };
  items: EffectiveInventoryItem[];
  overridesApplied: number;
  warnings: string[];
}

export class EffectiveInventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EffectiveInventoryError";
  }
}

export class EffectiveInventoryService {
  constructor(private readonly client: PrismaClient = prisma) {}

  async resolve(input: EffectiveInventoryInput): Promise<EffectiveInventoryResult> {
    const player = await this.requirePlayer(input.playerKey);
    const snapshot = await this.requireSnapshot(player.id, input.inventorySnapshotId);
    const snapshotItems = await this.client.inventoryItem.findMany({
      where: { snapshotId: snapshot.id, materialId: { not: null } },
      include: { material: true },
    });
    const itemByMaterialId = new Map<number, EffectiveInventoryItem>();

    for (const item of snapshotItems) {
      if (item.materialId === null || !item.material) {
        continue;
      }

      const existing = itemByMaterialId.get(item.materialId);
      itemByMaterialId.set(item.materialId, {
        materialId: item.materialId,
        stableKey: item.material.stableKey,
        name: item.material.name,
        snapshotQuantity: (existing?.snapshotQuantity ?? 0) + item.quantity,
        effectiveQuantity: (existing?.snapshotQuantity ?? 0) + item.quantity,
        overrideActive: false,
      });
    }

    const warnings: string[] = [];
    let overridesApplied = 0;

    if (input.includeManualOverrides !== false) {
      const overrides = await this.client.manualInventoryOverride.findMany({
        where: { playerId: player.id, active: true },
        include: { material: true },
        orderBy: { material: { stableKey: "asc" } },
      });

      for (const override of overrides) {
        const mode = override.mode === "delta" ? "delta" : "absolute";
        const existing = itemByMaterialId.get(override.materialId);
        const snapshotQuantity = existing?.snapshotQuantity ?? 0;
        const rawEffective = mode === "absolute" ? override.quantity : snapshotQuantity + override.quantity;
        const effectiveQuantity = Math.max(0, rawEffective);

        if (rawEffective < 0) {
          warnings.push(
            `Manual override for ${override.material.stableKey} produced ${rawEffective}; clamped effective quantity to 0.`,
          );
        }

        itemByMaterialId.set(override.materialId, {
          materialId: override.materialId,
          stableKey: override.material.stableKey,
          name: override.material.name,
          snapshotQuantity,
          overrideMode: mode,
          overrideQuantity: override.quantity,
          effectiveQuantity,
          overrideActive: true,
        });
        overridesApplied += 1;
      }
    }

    return {
      player,
      snapshot: {
        id: snapshot.id,
        source: snapshot.source,
        createdAt: snapshot.capturedAt.toISOString(),
      },
      items: [...itemByMaterialId.values()].sort((left, right) => left.stableKey.localeCompare(right.stableKey)),
      overridesApplied,
      warnings,
    };
  }

  private async requirePlayer(playerKey: string): Promise<{ id: number; stableKey: string }> {
    if (!playerKey.trim()) {
      throw new EffectiveInventoryError("playerKey is required");
    }

    const player = await this.client.player.findUnique({
      where: { stableKey: playerKey },
      select: { id: true, stableKey: true },
    });

    if (!player) {
      throw new EffectiveInventoryError(`Player not found: ${playerKey}`);
    }

    return player;
  }

  private async requireSnapshot(
    playerId: number,
    inventorySnapshotId: number | undefined,
  ): Promise<{ id: number; source: string; capturedAt: Date }> {
    const snapshot =
      inventorySnapshotId === undefined
        ? await this.client.inventorySnapshot.findFirst({
            where: { playerId },
            orderBy: [{ capturedAt: "desc" }, { importedAt: "desc" }, { id: "desc" }],
            select: { id: true, source: true, capturedAt: true },
          })
        : await this.client.inventorySnapshot.findFirst({
            where: { id: inventorySnapshotId, playerId },
            select: { id: true, source: true, capturedAt: true },
          });

    if (!snapshot) {
      throw new EffectiveInventoryError("No inventory snapshot found for player");
    }

    return snapshot;
  }
}
