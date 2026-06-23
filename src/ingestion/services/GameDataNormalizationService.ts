import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { CharacterNormalizer, type NormalizedCharacter } from "../normalizers/CharacterNormalizer.js";
import {
  CharacterCostNormalizer,
  type ExtractedAscensionCost,
  type ExtractedTalentCost,
} from "../normalizers/CharacterCostNormalizer.js";
import { MaterialNormalizer, type NormalizedMaterial } from "../normalizers/MaterialNormalizer.js";
import { normalizeSearchText, prefixedStableKey } from "../normalizers/normalizeKey.js";
import type { NormalizedAlias, RawGameObjectForNormalization } from "../normalizers/types.js";

export interface NormalizeGameDataOptions {
  folders?: string[];
  sections?: string[];
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
  characterAscensionCosts: NormalizationCounts;
  characterTalentCosts: NormalizationCounts;
  unresolvedMaterials: number;
  unresolvedCharacters: number;
  specialCases: string[];
  materialCountReport?: MaterialCountReport;
  dryRun: boolean;
}

export interface MaterialCountReport {
  rawMaterials: number;
  normalizedMaterials: number;
  duplicateStableKeys: Array<{
    stableKey: string;
    externalKeys: string[];
  }>;
}

export interface CharacterReference {
  id: number;
  stableKey: string;
  name: string;
}

export interface MaterialReference {
  id: number;
  stableKey: string;
  name: string;
  aliases: Array<{
    alias: string;
    normalized: string;
  }>;
}

export interface AscensionCostWrite {
  characterId: number;
  materialId: number;
  phase: number;
  quantity: number;
}

export interface TalentCostWrite {
  characterId: number;
  materialId: number;
  fromLevel: number;
  toLevel: number;
  quantity: number;
}

export interface GameDataNormalizationRepository {
  listRawObjects(source: string, folder: string, limit?: number): Promise<RawGameObjectForNormalization[]>;
  countRawObjects(source: string, folder: string): Promise<number>;
  countCharacters(): Promise<number>;
  countMaterials(): Promise<number>;
  findCharacterForRaw(rawObject: RawGameObjectForNormalization): Promise<CharacterReference | null>;
  listMaterialsForResolution(): Promise<MaterialReference[]>;
  replaceCharacterAscensionCosts(characterId: number, costs: AscensionCostWrite[]): Promise<number>;
  replaceCharacterTalentCosts(characterId: number, costs: TalentCostWrite[]): Promise<number>;
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

  async countRawObjects(source: string, folder: string): Promise<number> {
    return this.client.rawGameObject.count({
      where: {
        source,
        folder,
      },
    });
  }

  async countCharacters(): Promise<number> {
    return this.client.character.count();
  }

  async countMaterials(): Promise<number> {
    return this.client.material.count();
  }

  async findCharacterForRaw(rawObject: RawGameObjectForNormalization): Promise<CharacterReference | null> {
    const normalized = normalizeSearchText(rawObject.externalKey);
    const stableKey = normalized ? prefixedStableKey("char", rawObject.externalKey) : rawObject.externalKey;

    return this.client.character.findFirst({
      where: {
        OR: [
          { sourceExternalKey: rawObject.externalKey },
          { name: rawObject.externalKey },
          { stableKey },
          {
            aliases: {
              some: {
                entityType: "character",
                normalized,
              },
            },
          },
        ],
      },
      select: {
        id: true,
        stableKey: true,
        name: true,
      },
    });
  }

  async listMaterialsForResolution(): Promise<MaterialReference[]> {
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

  async replaceCharacterAscensionCosts(characterId: number, costs: AscensionCostWrite[]): Promise<number> {
    await this.client.characterAscensionCost.deleteMany({
      where: {
        characterId,
      },
    });

    if (costs.length === 0) {
      return 0;
    }

    const result = await this.client.characterAscensionCost.createMany({
      data: costs,
    });

    return result.count;
  }

  async replaceCharacterTalentCosts(characterId: number, costs: TalentCostWrite[]): Promise<number> {
    await this.client.characterTalentCost.deleteMany({
      where: {
        characterId,
      },
    });

    if (costs.length === 0) {
      return 0;
    }

    const result = await this.client.characterTalentCost.createMany({
      data: costs,
    });

    return result.count;
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
    private readonly characterCostNormalizer = new CharacterCostNormalizer(),
    private readonly log: (message: string) => void = console.log,
  ) {}

  async normalize(options: NormalizeGameDataOptions = {}): Promise<GameDataNormalizationResult> {
    const sections = options.sections?.length ? options.sections : options.folders?.length ? options.folders : ["characters", "materials", "character-costs"];
    const result: GameDataNormalizationResult = {
      characters: emptyCounts(),
      materials: emptyCounts(),
      aliases: emptyCounts(),
      characterAscensionCosts: emptyCounts(),
      characterTalentCosts: emptyCounts(),
      unresolvedMaterials: 0,
      unresolvedCharacters: 0,
      specialCases: [],
      dryRun: options.dryRun ?? false,
    };

    for (const section of sections) {
      if (section === "characters") {
        await this.normalizeCharacters(options, result);
      } else if (section === "materials") {
        await this.normalizeMaterials(options, result);
      } else if (section === "character-costs") {
        await this.normalizeCharacterCosts(options, result);
      } else {
        this.log(`Skipping unsupported normalization section: ${section}`);
      }
    }

    result.materialCountReport = await this.buildMaterialCountReport();

    this.log(
      `Normalization completed. Characters created/updated/skipped: ${result.characters.created}/${result.characters.updated}/${result.characters.skipped}`,
    );
    this.log(
      `Materials created/updated/skipped: ${result.materials.created}/${result.materials.updated}/${result.materials.skipped}`,
    );
    this.log(`Aliases created/updated/skipped: ${result.aliases.created}/${result.aliases.updated}/${result.aliases.skipped}`);
    this.log(
      `CharacterAscensionCost created/updated/skipped: ${result.characterAscensionCosts.created}/${result.characterAscensionCosts.updated}/${result.characterAscensionCosts.skipped}`,
    );
    this.log(
      `CharacterTalentCost created/updated/skipped: ${result.characterTalentCosts.created}/${result.characterTalentCosts.updated}/${result.characterTalentCosts.skipped}`,
    );
    this.log(`Unresolved materials: ${result.unresolvedMaterials}`);
    this.log(`Unresolved characters: ${result.unresolvedCharacters}`);
    this.log(`Special cases skipped: ${result.specialCases.length}`);
    this.log(
      `Material count report: raw=${result.materialCountReport.rawMaterials}, normalized=${result.materialCountReport.normalizedMaterials}, duplicateStableKeys=${result.materialCountReport.duplicateStableKeys.length}`,
    );

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

  private async normalizeCharacterCosts(
    options: NormalizeGameDataOptions,
    result: GameDataNormalizationResult,
  ): Promise<void> {
    const materials = await this.repository.listMaterialsForResolution();
    const materialIndex = new MaterialResolutionIndex(materials);
    const rawCharacters = await this.repository.listRawObjects("genshin-db", "characters", options.limit);
    const rawTalents = await this.repository.listRawObjects("genshin-db", "talents", options.limit);
    this.log(`Normalizing character ascension costs: ${rawCharacters.length} raw character objects`);
    this.log(`Normalizing character talent costs: ${rawTalents.length} raw talent objects`);

    for (const rawObject of rawCharacters) {
      const character = await this.repository.findCharacterForRaw(rawObject);

      if (!character) {
        result.unresolvedCharacters += 1;
        result.specialCases.push(`Ascension costs skipped: unresolved character '${rawObject.externalKey}'`);
        continue;
      }

      const extracted = this.characterCostNormalizer.extractAscensionCosts(rawObject);
      const costs: AscensionCostWrite[] = [];

      for (const extractedCost of extracted.ascensionCosts) {
        const materialId = materialIndex.resolve(extractedCost.materialName);

        if (materialId === null) {
          result.unresolvedMaterials += 1;
          result.specialCases.push(
            `Unresolved ascension material '${extractedCost.materialName}' for ${character.name} phase ${extractedCost.phase}`,
          );
          continue;
        }

        costs.push({
          characterId: character.id,
          materialId,
          phase: extractedCost.phase,
          quantity: extractedCost.quantity,
        });
      }

      for (const warning of extracted.warnings) {
        result.specialCases.push(warning);
      }

      if (options.dryRun) {
        result.characterAscensionCosts.skipped += costs.length;
        continue;
      }

      result.characterAscensionCosts.created += await this.repository.replaceCharacterAscensionCosts(character.id, costs);
    }

    for (const rawObject of rawTalents) {
      const character = await this.repository.findCharacterForRaw(rawObject);

      if (!character) {
        result.unresolvedCharacters += 1;
        result.specialCases.push(`Talent costs skipped: unresolved character '${rawObject.externalKey}'`);
        continue;
      }

      const extracted = this.characterCostNormalizer.extractTalentCosts(rawObject);
      const costs: TalentCostWrite[] = [];

      for (const extractedCost of extracted.talentCosts) {
        const materialId = materialIndex.resolve(extractedCost.materialName);

        if (materialId === null) {
          result.unresolvedMaterials += 1;
          result.specialCases.push(
            `Unresolved talent material '${extractedCost.materialName}' for ${character.name} ${extractedCost.fromLevel}->${extractedCost.toLevel}`,
          );
          continue;
        }

        costs.push({
          characterId: character.id,
          materialId,
          fromLevel: extractedCost.fromLevel,
          toLevel: extractedCost.toLevel,
          quantity: extractedCost.quantity,
        });
      }

      for (const warning of extracted.warnings) {
        result.specialCases.push(warning);
      }

      if (options.dryRun) {
        result.characterTalentCosts.skipped += costs.length;
        continue;
      }

      result.characterTalentCosts.created += await this.repository.replaceCharacterTalentCosts(character.id, costs);
    }
  }

  private async buildMaterialCountReport(): Promise<MaterialCountReport> {
    const rawObjects = await this.repository.listRawObjects("genshin-db", "materials");
    const duplicateMap = new Map<string, string[]>();

    for (const rawObject of rawObjects) {
      const material = this.materialNormalizer.normalize(rawObject);
      const current = duplicateMap.get(material.stableKey) ?? [];
      current.push(rawObject.externalKey);
      duplicateMap.set(material.stableKey, current);
    }

    return {
      rawMaterials: await this.repository.countRawObjects("genshin-db", "materials"),
      normalizedMaterials: await this.repository.countMaterials(),
      duplicateStableKeys: [...duplicateMap.entries()]
        .filter(([, externalKeys]) => externalKeys.length > 1)
        .map(([stableKey, externalKeys]) => ({
          stableKey,
          externalKeys,
        })),
    };
  }
}

class MaterialResolutionIndex {
  private readonly byAlias = new Map<string, number>();
  private readonly byNormalizedName = new Map<string, number>();
  private readonly byStableKey = new Map<string, number>();

  constructor(materials: MaterialReference[]) {
    for (const material of materials) {
      this.byStableKey.set(material.stableKey, material.id);
      this.byNormalizedName.set(normalizeSearchText(material.name), material.id);

      for (const alias of material.aliases) {
        this.byAlias.set(alias.normalized, material.id);
      }
    }
  }

  resolve(rawName: string): number | null {
    const normalized = normalizeSearchText(rawName);
    return (
      this.byAlias.get(normalized) ??
      this.byNormalizedName.get(normalized) ??
      this.byStableKey.get(rawName) ??
      this.byStableKey.get(`mat_${normalized}`) ??
      null
    );
  }
}
