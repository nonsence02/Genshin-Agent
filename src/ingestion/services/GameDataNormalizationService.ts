import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { CharacterNormalizer, type NormalizedCharacter } from "../normalizers/CharacterNormalizer.js";
import {
  CharacterCostNormalizer,
  type ExtractedAscensionCost,
  type ExtractedTalentCost,
} from "../normalizers/CharacterCostNormalizer.js";
import { DomainNormalizer, type NormalizedDomain } from "../normalizers/DomainNormalizer.js";
import { EnemyNormalizer, type NormalizedEnemy } from "../normalizers/EnemyNormalizer.js";
import { FarmCalendarNormalizer } from "../normalizers/FarmCalendarNormalizer.js";
import { MaterialSourceNormalizer, type NormalizedMaterialSource } from "../normalizers/MaterialSourceNormalizer.js";
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
  domains: NormalizationCounts;
  domainRewardsInserted: number;
  enemies: NormalizationCounts;
  enemyDropsInserted: number;
  materialSourcesInserted: number;
  farmCalendarEntriesInserted: number;
  unresolvedMaterials: number;
  unresolvedCharacters: number;
  unresolvedSourceReferences: number;
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

export interface DomainReference {
  id: number;
  stableKey: string;
  name: string;
  domainType: string | null;
}

export interface EnemyReference {
  id: number;
  stableKey: string;
  name: string;
  enemyType: string | null;
  family: string | null;
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

export interface DomainRewardWrite {
  domainId: number;
  materialId: number;
  rewardType: string;
  level: number | null;
  rarity: number | null;
  rawPayload: unknown;
}

export interface EnemyDropWrite {
  enemyId: number;
  materialId: number;
  dropType: string;
  rarity: number | null;
  minLevel: number | null;
  rawPayload: unknown;
}

export interface MaterialSourceWrite {
  materialId: number;
  sourceType: string;
  sourceKey: string | null;
  sourceName: string | null;
  resinCost: number | null;
  domainId: number | null;
  enemyId: number | null;
  notes: string | null;
  rawPayload: unknown;
}

export interface FarmCalendarEntryWrite {
  dayOfWeek: string;
  sourceType: string;
  sourceKey: string;
  domainId: number | null;
  materialId: number | null;
}

export interface DomainRewardSource {
  materialId: number;
  domainId: number;
  domainStableKey: string;
  domainName: string;
  rewardType: string;
  rawPayload: unknown;
}

export interface EnemyDropSource {
  materialId: number;
  enemyId: number;
  enemyStableKey: string;
  enemyName: string;
  enemyType: string | null;
  family: string | null;
  rawPayload: unknown;
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
  replaceDomainRewards(domainId: number, rewards: DomainRewardWrite[]): Promise<number>;
  replaceEnemyDrops(enemyId: number, drops: EnemyDropWrite[]): Promise<number>;
  replaceMaterialSources(sources: MaterialSourceWrite[]): Promise<number>;
  replaceFarmCalendarEntries(entries: FarmCalendarEntryWrite[]): Promise<number>;
  listDomainRewardSources(): Promise<DomainRewardSource[]>;
  listEnemyDropSources(): Promise<EnemyDropSource[]>;
  upsertCharacter(character: NormalizedCharacter): Promise<EntityWriteResult>;
  upsertMaterial(material: NormalizedMaterial): Promise<EntityWriteResult>;
  upsertDomain(domain: NormalizedDomain): Promise<EntityWriteResult>;
  upsertEnemy(enemy: NormalizedEnemy): Promise<EntityWriteResult>;
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

  async replaceDomainRewards(domainId: number, rewards: DomainRewardWrite[]): Promise<number> {
    await this.client.domainReward.deleteMany({
      where: {
        domainId,
      },
    });

    if (rewards.length === 0) {
      return 0;
    }

    const result = await this.client.domainReward.createMany({
      data: rewards.map((reward) => ({
        domainId: reward.domainId,
        materialId: reward.materialId,
        rewardType: reward.rewardType,
        level: reward.level,
        rarity: reward.rarity,
        rawPayload: reward.rawPayload as never,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  async replaceEnemyDrops(enemyId: number, drops: EnemyDropWrite[]): Promise<number> {
    await this.client.enemyDrop.deleteMany({
      where: {
        enemyId,
      },
    });

    if (drops.length === 0) {
      return 0;
    }

    const result = await this.client.enemyDrop.createMany({
      data: drops.map((drop) => ({
        enemyId: drop.enemyId,
        materialId: drop.materialId,
        dropType: drop.dropType,
        rarity: drop.rarity,
        minLevel: drop.minLevel,
        rawPayload: drop.rawPayload as never,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  async replaceMaterialSources(sources: MaterialSourceWrite[]): Promise<number> {
    await this.client.materialSource.deleteMany();

    if (sources.length === 0) {
      return 0;
    }

    const result = await this.client.materialSource.createMany({
      data: sources.map((source) => ({
        materialId: source.materialId,
        sourceType: source.sourceType,
        sourceKey: source.sourceKey,
        sourceName: source.sourceName,
        resinCost: source.resinCost,
        domainId: source.domainId,
        enemyId: source.enemyId,
        notes: source.notes,
        rawPayload: source.rawPayload as never,
      })),
    });

    return result.count;
  }

  async replaceFarmCalendarEntries(entries: FarmCalendarEntryWrite[]): Promise<number> {
    await this.client.farmCalendarEntry.deleteMany();

    if (entries.length === 0) {
      return 0;
    }

    const result = await this.client.farmCalendarEntry.createMany({
      data: entries,
      skipDuplicates: true,
    });

    return result.count;
  }

  async listDomainRewardSources(): Promise<DomainRewardSource[]> {
    const rows = await this.client.domainReward.findMany({
      include: {
        domain: {
          select: {
            id: true,
            stableKey: true,
            name: true,
          },
        },
      },
      orderBy: [
        {
          domain: {
            stableKey: "asc",
          },
        },
        {
          materialId: "asc",
        },
      ],
    });

    return rows.map((row) => ({
      materialId: row.materialId,
      domainId: row.domainId,
      domainStableKey: row.domain.stableKey,
      domainName: row.domain.name,
      rewardType: row.rewardType,
      rawPayload: row.rawPayload,
    }));
  }

  async listEnemyDropSources(): Promise<EnemyDropSource[]> {
    const rows = await this.client.enemyDrop.findMany({
      include: {
        enemy: {
          select: {
            id: true,
            stableKey: true,
            name: true,
            enemyType: true,
            family: true,
          },
        },
      },
      orderBy: [
        {
          enemy: {
            stableKey: "asc",
          },
        },
        {
          materialId: "asc",
        },
      ],
    });

    return rows.map((row) => ({
      materialId: row.materialId,
      enemyId: row.enemyId,
      enemyStableKey: row.enemy.stableKey,
      enemyName: row.enemy.name,
      enemyType: row.enemy.enemyType,
      family: row.enemy.family,
      rawPayload: row.rawPayload,
    }));
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

  async upsertDomain(domain: NormalizedDomain): Promise<EntityWriteResult> {
    const existing = await this.client.domain.findUnique({
      where: {
        stableKey: domain.stableKey,
      },
      select: {
        id: true,
      },
    });

    const saved = await this.client.domain.upsert({
      where: {
        stableKey: domain.stableKey,
      },
      create: {
        stableKey: domain.stableKey,
        name: domain.name,
        region: domain.region,
        domainType: domain.domainType,
        sourceExternalKey: domain.sourceExternalKey,
        rawGameObjectId: domain.rawGameObjectId,
      },
      update: {
        name: domain.name,
        region: domain.region,
        domainType: domain.domainType,
        sourceExternalKey: domain.sourceExternalKey,
        rawGameObjectId: domain.rawGameObjectId,
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

  async upsertEnemy(enemy: NormalizedEnemy): Promise<EntityWriteResult> {
    const existing = await this.client.enemy.findUnique({
      where: {
        stableKey: enemy.stableKey,
      },
      select: {
        id: true,
      },
    });

    const saved = await this.client.enemy.upsert({
      where: {
        stableKey: enemy.stableKey,
      },
      create: {
        stableKey: enemy.stableKey,
        name: enemy.name,
        enemyType: enemy.enemyType,
        family: enemy.family,
        sourceExternalKey: enemy.sourceExternalKey,
        rawGameObjectId: enemy.rawGameObjectId,
      },
      update: {
        name: enemy.name,
        enemyType: enemy.enemyType,
        family: enemy.family,
        sourceExternalKey: enemy.sourceExternalKey,
        rawGameObjectId: enemy.rawGameObjectId,
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
    private readonly domainNormalizer = new DomainNormalizer(),
    private readonly enemyNormalizer = new EnemyNormalizer(),
    private readonly materialSourceNormalizer = new MaterialSourceNormalizer(),
    private readonly farmCalendarNormalizer = new FarmCalendarNormalizer(),
  ) {}

  async normalize(options: NormalizeGameDataOptions = {}): Promise<GameDataNormalizationResult> {
    const sections = options.sections?.length
      ? options.sections
      : options.folders?.length
        ? options.folders
        : ["characters", "materials", "character-costs", "domains", "enemies", "material-sources", "farm-calendar"];
    const result: GameDataNormalizationResult = {
      characters: emptyCounts(),
      materials: emptyCounts(),
      aliases: emptyCounts(),
      characterAscensionCosts: emptyCounts(),
      characterTalentCosts: emptyCounts(),
      domains: emptyCounts(),
      domainRewardsInserted: 0,
      enemies: emptyCounts(),
      enemyDropsInserted: 0,
      materialSourcesInserted: 0,
      farmCalendarEntriesInserted: 0,
      unresolvedMaterials: 0,
      unresolvedCharacters: 0,
      unresolvedSourceReferences: 0,
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
      } else if (section === "domains") {
        await this.normalizeDomains(options, result);
      } else if (section === "enemies") {
        await this.normalizeEnemies(options, result);
      } else if (section === "material-sources") {
        await this.normalizeMaterialSources(options, result);
      } else if (section === "farm-calendar") {
        await this.normalizeFarmCalendar(options, result);
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
    this.log(`Domains created/updated/skipped: ${result.domains.created}/${result.domains.updated}/${result.domains.skipped}`);
    this.log(`Domain rewards inserted: ${result.domainRewardsInserted}`);
    this.log(`Enemies created/updated/skipped: ${result.enemies.created}/${result.enemies.updated}/${result.enemies.skipped}`);
    this.log(`Enemy drops inserted: ${result.enemyDropsInserted}`);
    this.log(`Material sources inserted: ${result.materialSourcesInserted}`);
    this.log(`Farm calendar entries inserted: ${result.farmCalendarEntriesInserted}`);
    this.log(`Unresolved materials: ${result.unresolvedMaterials}`);
    this.log(`Unresolved characters: ${result.unresolvedCharacters}`);
    this.log(`Unresolved source references: ${result.unresolvedSourceReferences}`);
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

  private async normalizeDomains(options: NormalizeGameDataOptions, result: GameDataNormalizationResult): Promise<void> {
    const materials = await this.repository.listMaterialsForResolution();
    const materialIndex = new MaterialResolutionIndex(materials);
    const rawObjects = await this.repository.listRawObjects("genshin-db", "domains", options.limit);
    const rewardsByDomain = new Map<number, DomainRewardWrite[]>();
    this.log(`Normalizing domains: ${rawObjects.length} raw objects`);

    for (const rawObject of rawObjects) {
      const domain = this.domainNormalizer.normalize(rawObject);

      if (options.dryRun) {
        result.domains.skipped += 1;
        continue;
      }

      const writeResult = await this.repository.upsertDomain(domain);
      incrementEntity(result.domains, writeResult);

      const currentRewards = rewardsByDomain.get(writeResult.id) ?? [];

      for (const reward of domain.rewards) {
        const materialId = materialIndex.resolve(reward.materialName);

        if (materialId === null) {
          result.unresolvedMaterials += 1;
          result.specialCases.push(`Unresolved domain reward '${reward.materialName}' for ${domain.name}`);
          continue;
        }

        currentRewards.push({
          domainId: writeResult.id,
          materialId,
          rewardType: reward.rewardType,
          level: reward.level,
          rarity: reward.rarity,
          rawPayload: reward.rawPayload,
        });
      }

      rewardsByDomain.set(writeResult.id, currentRewards);
    }

    if (options.dryRun) {
      return;
    }

    for (const [domainId, rewards] of rewardsByDomain.entries()) {
      result.domainRewardsInserted += await this.repository.replaceDomainRewards(domainId, rewards);
    }
  }

  private async normalizeEnemies(options: NormalizeGameDataOptions, result: GameDataNormalizationResult): Promise<void> {
    const materials = await this.repository.listMaterialsForResolution();
    const materialIndex = new MaterialResolutionIndex(materials);
    const rawObjects = await this.repository.listRawObjects("genshin-db", "enemies", options.limit);
    this.log(`Normalizing enemies: ${rawObjects.length} raw objects`);

    for (const rawObject of rawObjects) {
      const enemy = this.enemyNormalizer.normalize(rawObject);

      if (options.dryRun) {
        result.enemies.skipped += 1;
        continue;
      }

      const writeResult = await this.repository.upsertEnemy(enemy);
      incrementEntity(result.enemies, writeResult);
      const drops: EnemyDropWrite[] = [];

      for (const drop of enemy.drops) {
        const materialId = materialIndex.resolve(drop.materialName);

        if (materialId === null) {
          result.unresolvedMaterials += 1;
          result.specialCases.push(`Unresolved enemy drop '${drop.materialName}' for ${enemy.name}`);
          continue;
        }

        drops.push({
          enemyId: writeResult.id,
          materialId,
          dropType: drop.dropType,
          rarity: drop.rarity,
          minLevel: drop.minLevel,
          rawPayload: drop.rawPayload,
        });
      }

      result.enemyDropsInserted += await this.repository.replaceEnemyDrops(writeResult.id, drops);
    }
  }

  private async normalizeMaterialSources(
    options: NormalizeGameDataOptions,
    result: GameDataNormalizationResult,
  ): Promise<void> {
    const materials = await this.repository.listMaterialsForResolution();
    const materialIndex = new MaterialResolutionIndex(materials);
    const rawMaterials = await this.repository.listRawObjects("genshin-db", "materials", options.limit);
    const sources: MaterialSourceWrite[] = [];

    for (const rawMaterial of rawMaterials) {
      const extracted = this.materialSourceNormalizer.extractFromMaterial(rawMaterial);

      for (const warning of extracted.warnings) {
        result.unresolvedSourceReferences += 1;
        result.specialCases.push(warning);
      }

      for (const source of extracted.sources) {
        const materialId = materialIndex.resolve(source.materialName);

        if (materialId === null) {
          result.unresolvedMaterials += 1;
          result.specialCases.push(`Unresolved material source material '${source.materialName}'`);
          continue;
        }

        sources.push(this.toMaterialSourceWrite(materialId, source, null, null));
      }
    }

    for (const reward of await this.repository.listDomainRewardSources()) {
      sources.push({
        materialId: reward.materialId,
        sourceType: "domain",
        sourceKey: reward.domainStableKey,
        sourceName: reward.domainName,
        resinCost: null,
        domainId: reward.domainId,
        enemyId: null,
        notes: `Domain reward: ${reward.rewardType}`,
        rawPayload: reward.rawPayload,
      });
    }

    for (const drop of await this.repository.listEnemyDropSources()) {
      sources.push({
        materialId: drop.materialId,
        sourceType: this.sourceTypeForEnemy(drop),
        sourceKey: drop.enemyStableKey,
        sourceName: drop.enemyName,
        resinCost: null,
        domainId: null,
        enemyId: drop.enemyId,
        notes: drop.family,
        rawPayload: drop.rawPayload,
      });
    }

    const deduped = dedupeMaterialSources(sources);
    this.log(`Normalizing material sources: ${deduped.length} source rows`);

    if (options.dryRun) {
      result.materialSourcesInserted += deduped.length;
      return;
    }

    result.materialSourcesInserted += await this.repository.replaceMaterialSources(deduped);
  }

  private async normalizeFarmCalendar(options: NormalizeGameDataOptions, result: GameDataNormalizationResult): Promise<void> {
    const rawDomains = await this.repository.listRawObjects("genshin-db", "domains", options.limit);
    const rawMaterials = await this.repository.listRawObjects("genshin-db", "materials", options.limit);
    const materials = await this.repository.listMaterialsForResolution();
    const materialIndex = new MaterialResolutionIndex(materials);
    const entries: FarmCalendarEntryWrite[] = [];
    const domainSourceKeysByDropName = new Map<string, Set<string>>();
    this.log(`Normalizing farm calendar from domains: ${rawDomains.length} raw objects`);

    for (const rawObject of rawDomains) {
      const domain = this.domainNormalizer.normalize(rawObject);
      const raw = rawObject.payload !== null && typeof rawObject.payload === "object" && !Array.isArray(rawObject.payload)
        ? (rawObject.payload as Record<string, unknown>)
        : {};
      const rawName = typeof raw.name === "string" ? raw.name : rawObject.externalKey;
      const dropName = rawName.replace(/\s+[IVX]+$/i, "").trim();
      const sourceKeys = domainSourceKeysByDropName.get(dropName) ?? new Set<string>();
      sourceKeys.add(domain.stableKey);
      domainSourceKeysByDropName.set(dropName, sourceKeys);
      const days = this.farmCalendarNormalizer.normalizeDays(domain.daysOfWeek);

      if (days.length === 0) {
        continue;
      }

      if (options.dryRun) {
        for (const dayOfWeek of days) {
          entries.push({
            dayOfWeek,
            sourceType: "domain",
            sourceKey: domain.stableKey,
            domainId: null,
            materialId: null,
          });
        }

        continue;
      }

      const domainWrite = await this.repository.upsertDomain(domain);

      for (const dayOfWeek of days) {
        entries.push({
          dayOfWeek,
          sourceType: "domain",
          sourceKey: domain.stableKey,
          domainId: domainWrite.id,
          materialId: null,
        });
      }
    }

    for (const rawObject of rawMaterials) {
      const raw = rawObject.payload !== null && typeof rawObject.payload === "object" && !Array.isArray(rawObject.payload)
        ? (rawObject.payload as Record<string, unknown>)
        : {};
      const materialName = typeof raw.name === "string" ? raw.name : rawObject.externalKey;
      const domainName = typeof raw.dropDomainName === "string" ? raw.dropDomainName : null;
      const days = this.farmCalendarNormalizer.normalizeDays(raw.daysOfWeek);

      if (!domainName || days.length === 0) {
        continue;
      }

      const materialId = materialIndex.resolve(materialName);

      if (materialId === null) {
        result.unresolvedMaterials += 1;
        result.specialCases.push(`Unresolved farm calendar material '${materialName}'`);
        continue;
      }

      for (const dayOfWeek of days) {
        const sourceKeys = new Set<string>([
          prefixedStableKey("domain", domainName),
          ...(domainSourceKeysByDropName.get(domainName) ?? []),
        ]);

        for (const sourceKey of sourceKeys) {
          entries.push({
            dayOfWeek,
            sourceType: "domain",
            sourceKey,
            domainId: null,
            materialId,
          });
        }
      }
    }

    const deduped = dedupeFarmCalendarEntries(entries);

    if (options.dryRun) {
      result.farmCalendarEntriesInserted += deduped.length;
      return;
    }

    result.farmCalendarEntriesInserted += await this.repository.replaceFarmCalendarEntries(deduped);
  }

  private toMaterialSourceWrite(
    materialId: number,
    source: NormalizedMaterialSource,
    domainId: number | null,
    enemyId: number | null,
  ): MaterialSourceWrite {
    return {
      materialId,
      sourceType: source.sourceType,
      sourceKey: source.sourceKey,
      sourceName: source.sourceName,
      resinCost: source.resinCost,
      domainId,
      enemyId,
      notes: source.notes,
      rawPayload: source.rawPayload,
    };
  }

  private sourceTypeForEnemy(drop: EnemyDropSource): string {
    const type = (drop.enemyType ?? "").toLowerCase();
    const family = (drop.family ?? "").toLowerCase();

    if (type.includes("boss") && family.includes("note")) {
      return "weekly_boss";
    }

    if (type.includes("boss")) {
      return "boss";
    }

    return "enemy";
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

function dedupeMaterialSources(sources: MaterialSourceWrite[]): MaterialSourceWrite[] {
  const deduped = new Map<string, MaterialSourceWrite>();

  for (const source of sources) {
    const key = [
      source.materialId,
      source.sourceType,
      source.sourceKey ?? "",
      source.sourceName ?? "",
      source.notes ?? "",
      source.domainId ?? "",
      source.enemyId ?? "",
    ].join("|");

    if (!deduped.has(key)) {
      deduped.set(key, source);
    }
  }

  return [...deduped.values()];
}

function dedupeFarmCalendarEntries(entries: FarmCalendarEntryWrite[]): FarmCalendarEntryWrite[] {
  const deduped = new Map<string, FarmCalendarEntryWrite>();

  for (const entry of entries) {
    const key = [entry.dayOfWeek, entry.sourceType, entry.sourceKey, entry.materialId ?? ""].join("|");

    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  }

  return [...deduped.values()];
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
