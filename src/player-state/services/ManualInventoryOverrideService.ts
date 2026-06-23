import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";

export type ManualInventoryOverrideMode = "absolute" | "delta";

export interface UpsertManualInventoryOverrideInput {
  mode: ManualInventoryOverrideMode;
  quantity: number;
  reason?: string;
  active?: boolean;
}

export interface ManualInventoryOverrideRecord {
  id: number;
  player: {
    id: number;
    stableKey: string;
  };
  material: {
    id: number;
    stableKey: string;
    name: string;
  };
  mode: ManualInventoryOverrideMode;
  quantity: number;
  reason?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export class ManualInventoryOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualInventoryOverrideError";
  }
}

export class ManualInventoryOverrideService {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listOverrides(playerKey: string): Promise<ManualInventoryOverrideRecord[]> {
    const player = await this.requirePlayer(playerKey);
    const rows = await this.client.manualInventoryOverride.findMany({
      where: { playerId: player.id },
      include: { player: true, material: true },
      orderBy: [{ active: "desc" }, { material: { stableKey: "asc" } }],
    });

    return rows.map(toRecord);
  }

  async upsertOverride(
    playerKey: string,
    materialKey: string,
    input: UpsertManualInventoryOverrideInput,
  ): Promise<ManualInventoryOverrideRecord> {
    this.validateInput(input);
    const player = await this.requirePlayer(playerKey);
    const material = await this.requireMaterial(materialKey);

    const row = await this.client.manualInventoryOverride.upsert({
      where: {
        playerId_materialId: {
          playerId: player.id,
          materialId: material.id,
        },
      },
      create: {
        playerId: player.id,
        materialId: material.id,
        mode: input.mode,
        quantity: input.quantity,
        reason: normalizeReason(input.reason),
        active: input.active ?? true,
      },
      update: {
        mode: input.mode,
        quantity: input.quantity,
        reason: normalizeReason(input.reason),
        active: input.active ?? true,
      },
      include: { player: true, material: true },
    });

    return toRecord(row);
  }

  async deactivateOverride(playerKey: string, materialKey: string): Promise<ManualInventoryOverrideRecord> {
    const player = await this.requirePlayer(playerKey);
    const material = await this.requireMaterial(materialKey);

    const existing = await this.client.manualInventoryOverride.findUnique({
      where: {
        playerId_materialId: {
          playerId: player.id,
          materialId: material.id,
        },
      },
    });

    if (!existing) {
      throw new ManualInventoryOverrideError(`Manual inventory override not found: ${playerKey}/${materialKey}`);
    }

    const row = await this.client.manualInventoryOverride.update({
      where: { id: existing.id },
      data: { active: false },
      include: { player: true, material: true },
    });

    return toRecord(row);
  }

  async clearOverrides(playerKey: string): Promise<{ player: { id: number; stableKey: string }; deactivated: number }> {
    const player = await this.requirePlayer(playerKey);
    const result = await this.client.manualInventoryOverride.updateMany({
      where: { playerId: player.id, active: true },
      data: { active: false },
    });

    return {
      player,
      deactivated: result.count,
    };
  }

  private async requirePlayer(playerKey: string): Promise<{ id: number; stableKey: string }> {
    if (!playerKey.trim()) {
      throw new ManualInventoryOverrideError("playerKey is required");
    }

    const player = await this.client.player.findUnique({
      where: { stableKey: playerKey },
      select: { id: true, stableKey: true },
    });

    if (!player) {
      throw new ManualInventoryOverrideError(`Player not found: ${playerKey}`);
    }

    return player;
  }

  private async requireMaterial(materialKey: string): Promise<{ id: number; stableKey: string; name: string }> {
    if (!materialKey.trim()) {
      throw new ManualInventoryOverrideError("materialKey is required");
    }

    const material = await this.client.material.findUnique({
      where: { stableKey: materialKey },
      select: { id: true, stableKey: true, name: true },
    });

    if (!material) {
      throw new ManualInventoryOverrideError(`Material not found: ${materialKey}`);
    }

    return material;
  }

  private validateInput(input: UpsertManualInventoryOverrideInput): void {
    if (input.mode !== "absolute" && input.mode !== "delta") {
      throw new ManualInventoryOverrideError("mode must be absolute or delta");
    }

    if (!Number.isInteger(input.quantity)) {
      throw new ManualInventoryOverrideError("quantity must be an integer");
    }

    if (input.mode === "absolute" && input.quantity < 0) {
      throw new ManualInventoryOverrideError("absolute quantity must be greater than or equal to 0");
    }

    if (input.reason !== undefined && input.reason.length > 500) {
      throw new ManualInventoryOverrideError("reason must be 500 characters or fewer");
    }
  }
}

function normalizeReason(reason: string | undefined): string | null {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : null;
}

function toRecord(row: {
  id: number;
  mode: string;
  quantity: number;
  reason: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  player: { id: number; stableKey: string };
  material: { id: number; stableKey: string; name: string };
}): ManualInventoryOverrideRecord {
  return {
    id: row.id,
    player: { id: row.player.id, stableKey: row.player.stableKey },
    material: { id: row.material.id, stableKey: row.material.stableKey, name: row.material.name },
    mode: row.mode === "delta" ? "delta" : "absolute",
    quantity: row.quantity,
    reason: row.reason ?? undefined,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
