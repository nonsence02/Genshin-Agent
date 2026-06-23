import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { InventoryKameraNormalizer, type MaterialResolutionEntry, type NormalizedInventoryItem } from "../normalizers/InventoryKameraNormalizer.js";
import { InventoryKameraProvider, INVENTORY_KAMERA_SOURCE, type InventoryKameraSnapshot } from "../providers/InventoryKameraProvider.js";

export interface InventoryImportOptions {
  playerStableKey: string;
  filePath: string;
  dryRun?: boolean;
}

export interface InventoryImportResult {
  snapshotId: number | null;
  sourceFileHash: string;
  totalRawItemsParsed: number;
  resolvedMaterialItems: number;
  unresolvedItems: number;
  skippedInvalidItems: number;
  resolvedExamples: Array<{
    rawName: string;
    materialKey?: string;
    quantity: number;
  }>;
  unresolvedExamples: Array<{
    rawName: string;
    quantity: number;
  }>;
  dryRun: boolean;
}

export interface InventoryImportRepository {
  findOrCreatePlayer(stableKey: string): Promise<{ id: number; stableKey: string; displayName: string }>;
  listMaterialsForResolution(): Promise<MaterialResolutionEntry[]>;
  createInventorySnapshot(input: {
    playerId: number;
    source: string;
    capturedAt: Date;
    sourceVersion?: string;
    metadata: unknown;
  }): Promise<{ id: number }>;
  replaceInventoryItems(snapshotId: number, items: NormalizedInventoryItem[]): Promise<number>;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export class PrismaInventoryImportRepository implements InventoryImportRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findOrCreatePlayer(stableKey: string): Promise<{ id: number; stableKey: string; displayName: string }> {
    return this.client.player.upsert({
      where: {
        stableKey,
      },
      create: {
        stableKey,
        displayName: stableKey,
      },
      update: {},
      select: {
        id: true,
        stableKey: true,
        displayName: true,
      },
    });
  }

  async listMaterialsForResolution(): Promise<MaterialResolutionEntry[]> {
    return this.client.material.findMany({
      select: {
        id: true,
        stableKey: true,
        name: true,
        aliases: {
          where: {
            entityType: "material",
          },
          select: {
            alias: true,
            normalized: true,
          },
        },
      },
    });
  }

  async createInventorySnapshot(input: {
    playerId: number;
    source: string;
    capturedAt: Date;
    sourceVersion?: string;
    metadata: unknown;
  }): Promise<{ id: number }> {
    return this.client.inventorySnapshot.create({
      data: {
        playerId: input.playerId,
        source: input.source,
        capturedAt: input.capturedAt,
        sourceVersion: input.sourceVersion,
        rawPayload: toPrismaJson(input.metadata),
      },
      select: {
        id: true,
      },
    });
  }

  async replaceInventoryItems(snapshotId: number, items: NormalizedInventoryItem[]): Promise<number> {
    await this.client.inventoryItem.deleteMany({
      where: {
        snapshotId,
      },
    });

    if (items.length === 0) {
      return 0;
    }

    const result = await this.client.inventoryItem.createMany({
      data: items.map((item) => ({
        snapshotId,
        materialId: item.materialId,
        externalKey: item.materialKey ?? item.normalizedName,
        name: item.rawName,
        quantity: item.quantity,
        metadata: toPrismaJson({
          normalizedName: item.normalizedName,
          materialKey: item.materialKey,
          confidence: item.confidence,
          sourcePayload: item.sourcePayload,
        }),
      })),
    });

    return result.count;
  }
}

export class InventoryImportService {
  constructor(
    private readonly provider: InventoryKameraProvider = new InventoryKameraProvider(),
    private readonly normalizer: InventoryKameraNormalizer = new InventoryKameraNormalizer(),
    private readonly repository: InventoryImportRepository = new PrismaInventoryImportRepository(),
  ) {}

  async importSnapshot(optionsOrPlayerStableKey: InventoryImportOptions | string, maybeFilePath?: string): Promise<InventoryImportResult> {
    const options =
      typeof optionsOrPlayerStableKey === "string"
        ? { playerStableKey: optionsOrPlayerStableKey, filePath: maybeFilePath ?? "" }
        : optionsOrPlayerStableKey;

    if (!options.playerStableKey.trim()) {
      throw new Error("playerStableKey is required");
    }

    if (!options.filePath.trim()) {
      throw new Error("filePath is required");
    }

    const snapshot = await this.provider.readSnapshot(options.filePath);
    const materials = await this.repository.listMaterialsForResolution();
    const normalized = this.normalizer.normalize(snapshot.items, materials, [...snapshot.skippedInvalidItems]);
    const dryRun = options.dryRun ?? false;
    let snapshotId: number | null = null;

    if (!dryRun) {
      const player = await this.repository.findOrCreatePlayer(options.playerStableKey);
      const createdSnapshot = await this.repository.createInventorySnapshot({
        playerId: player.id,
        source: INVENTORY_KAMERA_SOURCE,
        capturedAt: snapshot.capturedAt,
        sourceVersion: snapshot.sourceVersion,
        metadata: this.buildSnapshotMetadata(snapshot, normalized.unresolvedItems, normalized.skippedInvalidItems),
      });
      snapshotId = createdSnapshot.id;
      await this.repository.replaceInventoryItems(snapshotId, normalized.items);
    }

    return {
      snapshotId,
      sourceFileHash: snapshot.fileHash,
      totalRawItemsParsed: snapshot.items.length,
      resolvedMaterialItems: normalized.resolvedItems.length,
      unresolvedItems: normalized.unresolvedItems.length,
      skippedInvalidItems: normalized.skippedInvalidItems.length,
      resolvedExamples: normalized.resolvedItems.slice(0, 10).map((item) => ({
        rawName: item.rawName,
        materialKey: item.materialKey,
        quantity: item.quantity,
      })),
      unresolvedExamples: normalized.unresolvedItems.slice(0, 20).map((item) => ({
        rawName: item.rawName,
        quantity: item.quantity,
      })),
      dryRun,
    };
  }

  private buildSnapshotMetadata(
    snapshot: InventoryKameraSnapshot,
    unresolvedItems: NormalizedInventoryItem[],
    skippedInvalidItems: InventoryKameraSnapshot["skippedInvalidItems"],
  ): Record<string, unknown> {
    return {
      ...snapshot.metadata,
      sourceFilePath: snapshot.sourceFilePath,
      fileHash: snapshot.fileHash,
      unresolvedItemCount: unresolvedItems.length,
      skippedInvalidItemCount: skippedInvalidItems.length,
      unresolvedExamples: unresolvedItems.slice(0, 20).map((item) => ({
        rawName: item.rawName,
        quantity: item.quantity,
      })),
    };
  }
}
