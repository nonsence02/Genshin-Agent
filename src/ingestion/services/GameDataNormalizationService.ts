import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { CharacterNormalizer, type NormalizedCharacter } from "../normalizers/CharacterNormalizer.js";
import { MaterialNormalizer, type NormalizedMaterial } from "../normalizers/MaterialNormalizer.js";
import type { NormalizedAlias, RawGameObjectForNormalization } from "../normalizers/types.js";

export interface NormalizeGameDataOptions {
  folders?: string[];
  limit?: number;
  dryRun?: boolean;
}

export interface EntityWriteResult {
  id: number;
  created: boolean;
}

export interface AliasWriteResult {
  created: boolean;
  updated: boolean;
  skipped: boolean;
}

export interface NormalizationCounts {
  created: number;
  updated: number;
  skipped: number;
}

export interface GameDataNormalizationResult {
  characters: NormalizationCounts;
  materials: NormalizationCounts;
  aliases: NormalizationCounts;
  dryRun: boolean;
}

export interface GameDataNormalizationRepository {
  listRawObjects(source: string, folder: string, limit?: number): Promise<RawGameObjectForNormalization[]>;
  upsertCharacter(character: NormalizedCharacter): Promise<EntityWriteResult>;
  upsertMaterial(material: NormalizedMaterial): Promise<EntityWriteResult>;
  upsertAlias(input: {
    entityType: "character" | "material";
    entityId: number;
    alias: NormalizedAlias;
  }): Promise<AliasWriteResult>;
}

function emptyCounts(): NormalizationCounts {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
  };
}

function incrementEntity(counts: NormalizationCounts, result: EntityWriteResult): void {
  if (result.created) {
    counts.created += 1;
  } else {
    counts.updated += 1;
  }
}

function incrementAlias(counts: NormalizationCounts, result: AliasWriteResult): void {
  if (result.created) {
    counts.created += 1;
  } else if (result.updated) {
    counts.updated += 1;
  } else if (result.skipped) {
    counts.skipped += 1;
  }
}

export class PrismaGameDataNormalizationRepository implements GameDataNormalizationRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async listRawObjects(source: string, folder: string, limit?: number): Promise<RawGameObjectForNormalization[]> {
    return this.client.rawGameObject.findMany({
      where: {
        source,
        folder,
      },
      orderBy: {
        externalKey: "asc",
      },
      take: limit,
      select: {
        id: true,
        externalKey: true,
        payload: true,
        sourceVersion: true,
      },
    });
  }

  async upsertCharacter(character: NormalizedCharacter): Promise<EntityWriteResult> {
    const existing = await this.client.character.findUnique({
      where: {
        stableKey: character.stableKey,
      },
      select: {
        id: true,
      },
    });

    const saved = await this.client.character.upsert({
      where: {
        stableKey: character.stableKey,
      },
      create: {
        stableKey: character.stableKey,
        name: character.name,
        rarity: character.rarity,
        element: character.element,
        weaponType: character.weaponType,
        region: character.region,
        affiliation: character.affiliation,
        birthday: character.birthday,
        constellation: character.constellation,
        sourceExternalKey: character.sourceExternalKey,
        rawGameObjectId: character.rawGameObjectId,
      },
      update: {
        name: character.name,
        rarity: character.rarity,
        element: character.element,
        weaponType: character.weaponType,
        region: character.region,
        affiliation: character.affiliation,
        birthday: character.birthday,
        constellation: character.constellation,
        sourceExternalKey: character.sourceExternalKey,
        rawGameObjectId: character.rawGameObjectId,
      },
      select: {
        id: true,
      },
    });

    return {
      id: saved.id,
      created: existing === null,
    };
  }

  async upsertMaterial(material: NormalizedMaterial): Promise<EntityWriteResult> {
    const existing = await this.client.material.findUnique({
      where: {
        stableKey: material.stableKey,
      },
      select: {
        id: true,
      },
    });

    const saved = await this.client.material.upsert({
      where: {
        stableKey: material.stableKey,
      },
      create: {
        stableKey: material.stableKey,
        name: material.name,
        rarity: material.rarity,
        category: material.category,
        typeText: material.typeText,
        sourceExternalKey: material.sourceExternalKey,
        rawGameObjectId: material.rawGameObjectId,
      },
      update: {
        name: material.name,
        rarity: material.rarity,
        category: material.category,
        typeText: material.typeText,
        sourceExternalKey: material.sourceExternalKey,
        rawGameObjectId: material.rawGameObjectId,
      },
      select: {
        id: true,
      },
    });

    return {
      id: saved.id,
      created: existing === null,
    };
  }

  async upsertAlias(input: {
    entityType: "character" | "material";
    entityId: number;
    alias: NormalizedAlias;
  }): Promise<AliasWriteResult> {
    const existing = await this.client.entityAlias.findUnique({
      where: {
        entityType_normalized: {
          entityType: input.entityType,
          normalized: input.alias.normalized,
        },
      },
      select: {
        id: true,
        characterId: true,
        materialId: true,
      },
    });

    const relationMatches =
      existing === null ||
      (input.entityType === "character" && existing.characterId === input.entityId) ||
      (input.entityType === "material" && existing.materialId === input.entityId);

    if (!relationMatches) {
      return {
        created: false,
        updated: false,
        skipped: true,
      };
    }

    const relation =
      input.entityType === "character" ? { characterId: input.entityId } : { materialId: input.entityId };

    await this.client.entityAlias.upsert({
      where: {
        entityType_normalized: {
          entityType: input.entityType,
          normalized: input.alias.normalized,
        },
      },
      create: {
        entityType: input.entityType,
        alias: input.alias.alias,
        normalized: input.alias.normalized,
        ...relation,
      },
      update: {
        alias: input.alias.alias,
        ...relation,
      },
    });

    return {
      created: existing === null,
      updated: existing !== null,
      skipped: false,
    };
  }
}

export class GameDataNormalizationService {
  constructor(
    private readonly repository: GameDataNormalizationRepository = new PrismaGameDataNormalizationRepository(),
    private readonly characterNormalizer = new CharacterNormalizer(),
    private readonly materialNormalizer = new MaterialNormalizer(),
    private readonly log: (message: string) => void = console.log,
  ) {}

  async normalize(options: NormalizeGameDataOptions = {}): Promise<GameDataNormalizationResult> {
    const folders = options.folders?.length ? options.folders : ["characters", "materials"];
    const result: GameDataNormalizationResult = {
      characters: emptyCounts(),
      materials: emptyCounts(),
      aliases: emptyCounts(),
      dryRun: options.dryRun ?? false,
    };

    for (const folder of folders) {
      if (folder === "characters") {
        await this.normalizeCharacters(options, result);
      } else if (folder === "materials") {
        await this.normalizeMaterials(options, result);
      } else {
        this.log(`Skipping unsupported normalization folder: ${folder}`);
      }
    }

    this.log(
      `Normalization completed. Characters created/updated/skipped: ${result.characters.created}/${result.characters.updated}/${result.characters.skipped}`,
    );
    this.log(
      `Materials created/updated/skipped: ${result.materials.created}/${result.materials.updated}/${result.materials.skipped}`,
    );
    this.log(`Aliases created/updated/skipped: ${result.aliases.created}/${result.aliases.updated}/${result.aliases.skipped}`);

    return result;
  }

  private async normalizeCharacters(
    options: NormalizeGameDataOptions,
    result: GameDataNormalizationResult,
  ): Promise<void> {
    const rawObjects = await this.repository.listRawObjects("genshin-db", "characters", options.limit);
    this.log(`Normalizing characters: ${rawObjects.length} raw objects`);

    for (const rawObject of rawObjects) {
      const character = this.characterNormalizer.normalize(rawObject);

      if (options.dryRun) {
        result.characters.skipped += 1;
        result.aliases.skipped += character.aliases.length;
        continue;
      }

      const writeResult = await this.repository.upsertCharacter(character);
      incrementEntity(result.characters, writeResult);

      for (const alias of character.aliases) {
        incrementAlias(
          result.aliases,
          await this.repository.upsertAlias({
            entityType: "character",
            entityId: writeResult.id,
            alias,
          }),
        );
      }
    }
  }

  private async normalizeMaterials(
    options: NormalizeGameDataOptions,
    result: GameDataNormalizationResult,
  ): Promise<void> {
    const rawObjects = await this.repository.listRawObjects("genshin-db", "materials", options.limit);
    this.log(`Normalizing materials: ${rawObjects.length} raw objects`);

    for (const rawObject of rawObjects) {
      const material = this.materialNormalizer.normalize(rawObject);

      if (options.dryRun) {
        result.materials.skipped += 1;
        result.aliases.skipped += material.aliases.length;
        continue;
      }

      const writeResult = await this.repository.upsertMaterial(material);
      incrementEntity(result.materials, writeResult);

      for (const alias of material.aliases) {
        incrementAlias(
          result.aliases,
          await this.repository.upsertAlias({
            entityType: "material",
            entityId: writeResult.id,
            alias,
          }),
        );
      }
    }
  }
}
