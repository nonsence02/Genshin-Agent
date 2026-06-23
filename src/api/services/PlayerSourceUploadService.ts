import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MultipartFile } from "@fastify/multipart";
import type { PlayerSourceImportResult, PlayerSourceImportService } from "../../ingestion/services/PlayerSourceImportService.js";
import type { PlayerStateBuilder } from "../../player-state/services/PlayerStateBuilder.js";

export type PlayerSourceUploadField = "good" | "weapons" | "hoyolab";

export interface PlayerSourceUploadFile {
  field: PlayerSourceUploadField;
  originalName: string;
  size: number;
  accepted: boolean;
  warnings: string[];
}

export interface PlayerSourceUploadResult {
  player: {
    id: number;
    stableKey: string;
  };
  dryRun: boolean;
  files: PlayerSourceUploadFile[];
  importSummary: {
    sourceFilesProcessed: string[];
    materialsParsed: number;
    materialsResolved: number;
    materialsUnresolved: number;
    weaponsParsed: number;
    weaponsResolved: number;
    weaponsUnresolved: number;
    hoyolabCharactersParsed: number;
    hoyolabCharactersResolved: number;
    hoyolabCharactersUnresolved: number;
  };
  playerStateSummary?: {
    characters: number;
    weapons: number;
    artifacts: number;
    inventorySnapshotId?: number;
  };
  warnings: string[];
}

export interface PlayerSourceUploadImportService {
  importSources: Pick<PlayerSourceImportService, "importSources">["importSources"];
}

export interface PlayerSourceUploadPlayerStateService {
  build: Pick<PlayerStateBuilder, "build">["build"];
}

export interface PlayerSourceUploadOptions {
  playerKey: string;
  parts: AsyncIterable<MultipartFile>;
  dryRun: boolean;
  keepTemp?: boolean;
}

interface SavedUpload {
  field: PlayerSourceUploadField;
  originalName: string;
  size: number;
  tempPath: string;
  warnings: string[];
}

const ACCEPTED_FIELDS = new Set<PlayerSourceUploadField>(["good", "weapons", "hoyolab"]);
const ACCEPTED_CONTENT_TYPES = new Set(["application/json", "text/plain", "application/octet-stream"]);
const UPLOAD_TMP_DIR = path.resolve("data/tmp/uploads");

export class PlayerSourceUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerSourceUploadError";
  }
}

export class PlayerSourceUploadService {
  constructor(
    private readonly importService: PlayerSourceUploadImportService,
    private readonly playerState: PlayerSourceUploadPlayerStateService,
  ) {}

  async handleUpload(options: PlayerSourceUploadOptions): Promise<PlayerSourceUploadResult> {
    const saved: SavedUpload[] = [];

    try {
      await mkdir(UPLOAD_TMP_DIR, { recursive: true });

      for await (const part of options.parts) {
        if (!isAcceptedField(part.fieldname)) {
          await part.toBuffer();
          throw new PlayerSourceUploadError(`Unsupported file field: ${part.fieldname}`);
        }

        const file = await savePart(part, part.fieldname);
        saved.push(file);
      }

      if (saved.length === 0) {
        throw new PlayerSourceUploadError("Upload at least one source file: good, weapons, or hoyolab.");
      }

      const importResult = await this.importService.importSources({
        playerStableKey: options.playerKey,
        dryRun: options.dryRun,
        goodFile: saved.find((file) => file.field === "good")?.tempPath,
        weaponsFile: saved.find((file) => file.field === "weapons")?.tempPath,
        hoyolabFile: saved.find((file) => file.field === "hoyolab")?.tempPath,
      });
      const playerStateSummary = options.dryRun ? undefined : await this.buildPlayerStateSummary(options.playerKey);

      return toUploadResult(importResult, saved, playerStateSummary);
    } finally {
      if (!options.keepTemp) {
        await Promise.all(saved.map((file) => rm(file.tempPath, { force: true }).catch(() => undefined)));
      }
    }
  }

  private async buildPlayerStateSummary(playerKey: string): Promise<PlayerSourceUploadResult["playerStateSummary"]> {
    const state = await this.playerState.build({ playerKey, includeArtifacts: true });
    return {
      characters: state.characters.length,
      weapons: state.sourceSummary.weapons,
      artifacts: state.sourceSummary.artifacts,
    };
  }
}

async function savePart(part: MultipartFile, field: PlayerSourceUploadField): Promise<SavedUpload> {
  validateFileMetadata(part);
  const buffer = await part.toBuffer();
  const payload = parseJson(buffer, part.filename);
  const warnings = validatePayloadShape(field, payload);
  const tempPath = path.join(UPLOAD_TMP_DIR, `${Date.now()}-${randomUUID()}-${field}.json`);
  await writeFile(tempPath, buffer);

  return {
    field,
    originalName: part.filename,
    size: buffer.byteLength,
    tempPath,
    warnings,
  };
}

function validateFileMetadata(part: MultipartFile): void {
  if (!part.filename.toLowerCase().endsWith(".json")) {
    throw new PlayerSourceUploadError(`${part.fieldname} must be a .json file.`);
  }

  if (part.mimetype && !ACCEPTED_CONTENT_TYPES.has(part.mimetype)) {
    throw new PlayerSourceUploadError(`${part.fieldname} has unsupported content type: ${part.mimetype}.`);
  }
}

function parseJson(buffer: Buffer, filename: string): unknown {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new PlayerSourceUploadError(`${filename} is not valid JSON.`);
  }
}

function validatePayloadShape(field: PlayerSourceUploadField, payload: unknown): string[] {
  if (!isRecord(payload)) {
    throw new PlayerSourceUploadError(`${field} JSON root must be an object.`);
  }

  if (field === "good") {
    if (Array.isArray(payload.weapons) && !payload.materials && !payload.characters && !payload.artifacts) {
      throw new PlayerSourceUploadError("weapons.json was uploaded in the GOOD field. Use the weapons field instead.");
    }
    if (payload.format === "GOOD" || payload.materials || payload.characters || payload.artifacts) {
      return [];
    }
    throw new PlayerSourceUploadError("GOOD file does not look like Inventory Kamera GOOD JSON.");
  }

  if (field === "weapons") {
    if (Array.isArray(payload.weapons)) {
      return [];
    }
    if (payload.materials || payload.characters || payload.artifacts) {
      throw new PlayerSourceUploadError("GOOD inventory file was uploaded in the weapons field. Use the GOOD field instead.");
    }
    throw new PlayerSourceUploadError("weapons file must contain a weapons array.");
  }

  if (payload.source === "hoyolab_calculator" || isRecord(payload.characters)) {
    return [];
  }

  throw new PlayerSourceUploadError("HoYoLAB profile file must have source=hoyolab_calculator or a characters object.");
}

function toUploadResult(
  result: PlayerSourceImportResult,
  files: SavedUpload[],
  playerStateSummary: PlayerSourceUploadResult["playerStateSummary"],
): PlayerSourceUploadResult {
  return {
    player: {
      id: result.player.id ?? 0,
      stableKey: result.player.stableKey,
    },
    dryRun: result.dryRun,
    files: files.map((file) => ({
      field: file.field,
      originalName: file.originalName,
      size: file.size,
      accepted: true,
      warnings: file.warnings,
    })),
    importSummary: {
      sourceFilesProcessed: result.sourceFilesProcessed.map((filePath) => path.basename(filePath)),
      materialsParsed: result.materialsParsed,
      materialsResolved: result.materialsResolved,
      materialsUnresolved: result.materialsUnresolved,
      weaponsParsed: result.weaponsParsed,
      weaponsResolved: result.weaponsResolved,
      weaponsUnresolved: result.weaponsUnresolved,
      hoyolabCharactersParsed: result.hoyolabCharactersParsed,
      hoyolabCharactersResolved: result.hoyolabCharactersResolved,
      hoyolabCharactersUnresolved: result.hoyolabCharactersUnresolved,
    },
    playerStateSummary,
    warnings: result.warnings,
  };
}

function isAcceptedField(value: string): value is PlayerSourceUploadField {
  return ACCEPTED_FIELDS.has(value as PlayerSourceUploadField);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
