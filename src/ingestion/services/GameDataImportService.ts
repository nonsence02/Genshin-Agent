import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import type { GameDataProvider } from "../providers/GenshinDbProvider.js";
import { sha256StableJson, toStableJson } from "../utils/stableJson.js";

type PrismaJsonInput = Prisma.InputJsonValue | typeof Prisma.JsonNull;

function toPrismaJson(value: unknown): PrismaJsonInput {
  const normalized = toStableJson(value);
  return normalized === null ? Prisma.JsonNull : normalized;
}

export interface ImportGameDataOptions {
  folders?: string[];
  limit?: number;
  dryRun?: boolean;
}

export interface FolderImportSummary {
  folder: string;
  count: number;
  skipped: boolean;
}

export interface GameDataImportResult {
  importRunId: number | null;
  source: string;
  sourceVersion: string;
  rawObjectCount: number;
  folders: FolderImportSummary[];
  dryRun: boolean;
}

export interface RawGameObjectUpsert {
  importRunId: number;
  source: string;
  sourceVersion: string;
  folder: string;
  externalKey: string;
  payload: unknown;
  rawHash: string;
}

export interface GameDataImportRepository {
  createImportRun(input: {
    source: string;
    sourceVersion: string;
    metadata?: unknown;
  }): Promise<{ id: number }>;
  completeImportRun(importRunId: number, metadata: unknown): Promise<void>;
  failImportRun(importRunId: number, errorMessage: string, metadata?: unknown): Promise<void>;
  upsertRawGameObject(input: RawGameObjectUpsert): Promise<void>;
}

export class PrismaGameDataImportRepository implements GameDataImportRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async createImportRun(input: {
    source: string;
    sourceVersion: string;
    metadata?: unknown;
  }): Promise<{ id: number }> {
    return this.client.importRun.create({
      data: {
        source: input.source,
        sourceVersion: input.sourceVersion,
        status: "running",
        metadata: toPrismaJson(input.metadata ?? {}),
      },
      select: {
        id: true,
      },
    });
  }

  async completeImportRun(importRunId: number, metadata: unknown): Promise<void> {
    await this.client.importRun.update({
      where: {
        id: importRunId,
      },
      data: {
        status: "completed",
        finishedAt: new Date(),
        metadata: toPrismaJson(metadata),
      },
    });
  }

  async failImportRun(importRunId: number, errorMessage: string, metadata?: unknown): Promise<void> {
    await this.client.importRun.update({
      where: {
        id: importRunId,
      },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage,
        metadata: toPrismaJson(metadata ?? {}),
      },
    });
  }

  async upsertRawGameObject(input: RawGameObjectUpsert): Promise<void> {
    const payload = toPrismaJson(input.payload);

    await this.client.rawGameObject.upsert({
      where: {
        source_folder_externalKey_sourceVersion: {
          source: input.source,
          folder: input.folder,
          externalKey: input.externalKey,
          sourceVersion: input.sourceVersion,
        },
      },
      create: {
        importRunId: input.importRunId,
        source: input.source,
        folder: input.folder,
        externalKey: input.externalKey,
        sourceVersion: input.sourceVersion,
        payload,
        rawHash: input.rawHash,
      },
      update: {
        importRunId: input.importRunId,
        payload,
        rawHash: input.rawHash,
        importedAt: new Date(),
      },
    });
  }
}

export class GameDataImportService {
  constructor(
    private readonly provider: GameDataProvider,
    private readonly repository: GameDataImportRepository = new PrismaGameDataImportRepository(),
    private readonly log: (message: string) => void = console.log,
  ) {}

  async importAll(options: ImportGameDataOptions = {}): Promise<GameDataImportResult> {
    const sourceVersion = this.provider.getSourceVersion();
    const availableFolders = this.provider.listSupportedFolders();
    const selectedFolders = options.folders?.length
      ? options.folders.filter((folder) => availableFolders.includes(folder))
      : availableFolders;
    const skippedFolders = options.folders?.filter((folder) => !availableFolders.includes(folder)) ?? [];
    const dryRun = options.dryRun ?? false;

    this.log(`Starting ${this.provider.source} raw import`);
    this.log(`Source version: ${sourceVersion}`);

    for (const folder of skippedFolders) {
      this.log(`Skipping unsupported folder: ${folder}`);
    }

    if (dryRun) {
      const dryRunFolders = selectedFolders.map((folder) => {
        const count = this.provider.dumpFolder(folder).slice(0, options.limit).length;
        this.log(`[dry-run] ${folder}: ${count} objects`);
        return { folder, count, skipped: false };
      });

      return {
        importRunId: null,
        source: this.provider.source,
        sourceVersion,
        rawObjectCount: dryRunFolders.reduce((sum, folder) => sum + folder.count, 0),
        folders: dryRunFolders,
        dryRun,
      };
    }

    const importRun = await this.repository.createImportRun({
      source: this.provider.source,
      sourceVersion,
      metadata: {
        selectedFolders,
        skippedFolders,
      },
    });

    const folderSummaries: FolderImportSummary[] = [];
    let rawObjectCount = 0;

    try {
      for (const folder of selectedFolders) {
        this.log(`Importing folder: ${folder}`);
        const objects = this.provider.dumpFolder(folder).slice(0, options.limit);

        for (const object of objects) {
          await this.repository.upsertRawGameObject({
            importRunId: importRun.id,
            source: this.provider.source,
            sourceVersion,
            folder,
            externalKey: object.externalKey,
            payload: object.raw,
            rawHash: sha256StableJson(object.raw),
          });
        }

        rawObjectCount += objects.length;
        folderSummaries.push({ folder, count: objects.length, skipped: false });
        this.log(`${folder}: imported or updated ${objects.length} objects`);
      }

      for (const folder of skippedFolders) {
        folderSummaries.push({ folder, count: 0, skipped: true });
      }

      const result: GameDataImportResult = {
        importRunId: importRun.id,
        source: this.provider.source,
        sourceVersion,
        rawObjectCount,
        folders: folderSummaries,
        dryRun,
      };

      await this.repository.completeImportRun(importRun.id, result);
      this.log(`Import run ${importRun.id} completed. Total imported or updated: ${rawObjectCount}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.failImportRun(importRun.id, message, {
        folderSummaries,
        rawObjectCount,
      });
      this.log(`Import run ${importRun.id} failed: ${message}`);
      throw error;
    }
  }
}
