import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HoyolabProfileNormalizer, type CharacterResolutionEntry, type NormalizedHoyolabCharacter } from "../normalizers/HoyolabProfileNormalizer.js";
import { InventoryKameraGoodNormalizer } from "../normalizers/InventoryKameraGoodNormalizer.js";
import { type MaterialResolutionEntry, type NormalizedInventoryItem } from "../normalizers/InventoryKameraNormalizer.js";
import { InventoryKameraWeaponsNormalizer, type NormalizedPlayerWeapon } from "../normalizers/InventoryKameraWeaponsNormalizer.js";
import { normalizeSearchText, prefixedStableKey } from "../normalizers/normalizeKey.js";
import type { InventoryKameraGoodCharacterRecord } from "../providers/InventoryKameraGoodProvider.js";
import { HoyolabProfileProvider } from "../providers/HoyolabProfileProvider.js";
import { InventoryKameraGoodProvider } from "../providers/InventoryKameraGoodProvider.js";
import { InventoryKameraWeaponsProvider } from "../providers/InventoryKameraWeaponsProvider.js";

export interface PlayerSourceImportOptions {
  playerStableKey: string;
  goodFile?: string;
  weaponsFile?: string;
  hoyolabFile?: string;
  dryRun?: boolean;
}

export interface PlayerSourceImportResult {
  player: { id: number | null; stableKey: string };
  dryRun: boolean;
  sourceFilesProcessed: string[];
  materialsParsed: number;
  materialsResolved: number;
  materialsUnresolved: number;
  goodCharactersParsed: number;
  goodCharactersResolved: number;
  goodCharactersUnresolved: number;
  goodArtifactsParsed: number;
  weaponsParsed: number;
  weaponsResolved: number;
  weaponsUnresolved: number;
  hoyolabCharactersParsed: number;
  hoyolabCharactersResolved: number;
  hoyolabCharactersUnresolved: number;
  warnings: string[];
  examples: {
    resolvedMaterials: Array<{ rawName: string; materialKey?: string; quantity: number }>;
    unresolvedMaterials: Array<{ rawName: string; quantity: number }>;
    weapons: Array<{ key: string; level?: number; location?: string; resolved: boolean }>;
    characters: Array<{ sourceCharacterKey: string; characterKey?: string; level?: number; resolved: boolean }>;
  };
}

export interface PlayerSourceImportRepository {
  findOrCreatePlayer(stableKey: string): Promise<{ id: number; stableKey: string }>;
  listMaterialsForResolution(): Promise<MaterialResolutionEntry[]>;
  listCharactersForResolution(): Promise<CharacterResolutionEntry[]>;
  createInventorySnapshot(input: {
    playerId: number;
    source: string;
    sourceVersion?: string;
    metadata: unknown;
  }): Promise<{ id: number }>;
  replaceInventoryItems(snapshotId: number, items: NormalizedInventoryItem[]): Promise<number>;
  replacePlayerWeapons(playerId: number, source: string, weapons: NormalizedPlayerWeapon[]): Promise<number>;
  replacePlayerCharacters(playerId: number, source: string, characters: NormalizedHoyolabCharacter[]): Promise<number>;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export class PrismaPlayerSourceImportRepository implements PlayerSourceImportRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findOrCreatePlayer(stableKey: string): Promise<{ id: number; stableKey: string }> {
    return this.client.player.upsert({
      where: { stableKey },
      create: { stableKey, displayName: stableKey },
      update: {},
      select: { id: true, stableKey: true },
    });
  }

  async listMaterialsForResolution(): Promise<MaterialResolutionEntry[]> {
    return this.client.material.findMany({
      select: {
        id: true,
        stableKey: true,
        name: true,
        aliases: {
          where: { entityType: "material" },
          select: { alias: true, normalized: true },
        },
      },
    });
  }

  async listCharactersForResolution(): Promise<CharacterResolutionEntry[]> {
    return this.client.character.findMany({
      select: {
        id: true,
        stableKey: true,
        name: true,
        aliases: {
          where: { entityType: "character" },
          select: { alias: true, normalized: true },
        },
      },
    });
  }

  async createInventorySnapshot(input: {
    playerId: number;
    source: string;
    sourceVersion?: string;
    metadata: unknown;
  }): Promise<{ id: number }> {
    return this.client.inventorySnapshot.create({
      data: {
        playerId: input.playerId,
        source: input.source,
        capturedAt: new Date(),
        sourceVersion: input.sourceVersion,
        rawPayload: toPrismaJson(input.metadata),
      },
      select: { id: true },
    });
  }

  async replaceInventoryItems(snapshotId: number, items: NormalizedInventoryItem[]): Promise<number> {
    await this.client.inventoryItem.deleteMany({ where: { snapshotId } });

    if (items.length === 0) {
      return 0;
    }

    return (
      await this.client.inventoryItem.createMany({
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
      })
    ).count;
  }

  async replacePlayerWeapons(playerId: number, source: string, weapons: NormalizedPlayerWeapon[]): Promise<number> {
    await this.client.playerWeapon.deleteMany({ where: { playerId, source } });

    if (weapons.length === 0) {
      return 0;
    }

    return (
      await this.client.playerWeapon.createMany({
        data: weapons.map((weapon) => ({
          playerId,
          source,
          weaponId: weapon.weaponId,
          sourceWeaponKey: weapon.sourceWeaponKey,
          level: weapon.level,
          ascension: weapon.ascension,
          refinement: weapon.refinement,
          location: weapon.location,
          lock: weapon.lock,
          inventoryItemId: weapon.inventorySourceId,
          rawPayload: toPrismaJson(weapon.sourcePayload),
        })),
      })
    ).count;
  }

  async replacePlayerCharacters(
    playerId: number,
    source: string,
    characters: NormalizedHoyolabCharacter[],
  ): Promise<number> {
    await this.client.playerCharacter.deleteMany({ where: { playerId, source } });
    const uniqueCharacters = [...new Map(characters.map((character) => [character.sourceCharacterKey, character])).values()];

    if (uniqueCharacters.length === 0) {
      return 0;
    }

    return (
      await this.client.playerCharacter.createMany({
        data: uniqueCharacters.map((character) => ({
          playerId,
          source,
          characterId: character.characterId,
          sourceCharacterKey: character.sourceCharacterKey,
          name: character.name,
          nameRu: character.nameRu,
          level: character.level,
          ascension: character.ascension,
          constellation: character.constellation,
          talentNormal: character.normalTalentLevel,
          talentSkill: character.skillTalentLevel,
          talentBurst: character.burstTalentLevel,
          equippedWeaponName: character.equippedWeaponName,
          equippedWeaponLevel: character.equippedWeaponLevel,
          equippedWeaponRefinement: character.equippedWeaponRefinement,
          rawPayload: toPrismaJson({
            sourcePayload: character.sourcePayload,
            equippedArtifacts: character.equippedArtifacts,
          }),
        })),
      })
    ).count;
  }
}

function normalizeGoodCharacters(
  characters: InventoryKameraGoodCharacterRecord[],
  knownCharacters: CharacterResolutionEntry[],
): {
  characters: NormalizedHoyolabCharacter[];
  resolved: NormalizedHoyolabCharacter[];
  unresolved: NormalizedHoyolabCharacter[];
} {
  const index = new GoodCharacterResolutionIndex(knownCharacters);
  const normalized = characters.map((character) => {
    const resolved = index.resolve(character.key);
    const output: NormalizedHoyolabCharacter = {
      sourceCharacterKey: character.key,
      normalizedCharacterKey: normalizeSearchText(character.key),
      characterId: resolved?.id,
      characterKey: resolved?.stableKey,
      name: resolved?.name,
      level: character.level,
      ascension: character.ascension,
      constellation: character.constellation,
      normalTalentLevel: character.talents.normal,
      skillTalentLevel: character.talents.skill,
      burstTalentLevel: character.talents.burst,
      equippedArtifacts: [],
      sourcePayload: character.sourcePayload,
    };
    return output;
  });

  return {
    characters: normalized,
    resolved: normalized.filter((character) => character.characterId !== undefined),
    unresolved: normalized.filter((character) => character.characterId === undefined),
  };
}

class GoodCharacterResolutionIndex {
  private readonly byAlias = new Map<string, CharacterResolutionEntry>();
  private readonly byStableKey = new Map<string, CharacterResolutionEntry>();
  private readonly byName = new Map<string, CharacterResolutionEntry>();

  constructor(characters: CharacterResolutionEntry[]) {
    for (const character of characters) {
      this.byStableKey.set(character.stableKey, character);
      this.byName.set(normalizeSearchText(character.name), character);

      for (const alias of character.aliases) {
        this.byAlias.set(alias.normalized, character);
      }
    }
  }

  resolve(sourceCharacterKey: string): CharacterResolutionEntry | undefined {
    const normalized = normalizeSearchText(sourceCharacterKey);
    const stableKey = prefixedStableKey("char", sourceCharacterKey);
    return this.byAlias.get(normalized) ?? this.byStableKey.get(stableKey) ?? this.byName.get(normalized);
  }
}

export class PlayerSourceImportService {
  constructor(
    private readonly repository: PlayerSourceImportRepository = new PrismaPlayerSourceImportRepository(),
    private readonly goodProvider = new InventoryKameraGoodProvider(),
    private readonly weaponsProvider = new InventoryKameraWeaponsProvider(),
    private readonly hoyolabProvider = new HoyolabProfileProvider(),
    private readonly goodNormalizer = new InventoryKameraGoodNormalizer(),
    private readonly weaponsNormalizer = new InventoryKameraWeaponsNormalizer(),
    private readonly hoyolabNormalizer = new HoyolabProfileNormalizer(),
  ) {}

  async importSources(options: PlayerSourceImportOptions): Promise<PlayerSourceImportResult> {
    const dryRun = options.dryRun ?? false;
    const result: PlayerSourceImportResult = {
      player: { id: null, stableKey: options.playerStableKey },
      dryRun,
      sourceFilesProcessed: [],
      materialsParsed: 0,
      materialsResolved: 0,
      materialsUnresolved: 0,
      goodCharactersParsed: 0,
      goodCharactersResolved: 0,
      goodCharactersUnresolved: 0,
      goodArtifactsParsed: 0,
      weaponsParsed: 0,
      weaponsResolved: 0,
      weaponsUnresolved: 0,
      hoyolabCharactersParsed: 0,
      hoyolabCharactersResolved: 0,
      hoyolabCharactersUnresolved: 0,
      warnings: [],
      examples: {
        resolvedMaterials: [],
        unresolvedMaterials: [],
        weapons: [],
        characters: [],
      },
    };

    const player = dryRun ? { id: null, stableKey: options.playerStableKey } : await this.repository.findOrCreatePlayer(options.playerStableKey);
    result.player = player;

    if (options.goodFile) {
      await this.importGood(options.goodFile, player.id, result);
    }

    if (options.weaponsFile) {
      await this.importWeapons(options.weaponsFile, player.id, result);
    }

    if (options.hoyolabFile) {
      await this.importHoyolab(options.hoyolabFile, player.id, result);
    }

    return result;
  }

  private async importGood(filePath: string, playerId: number | null, result: PlayerSourceImportResult): Promise<void> {
    const snapshot = await this.goodProvider.readSnapshot(filePath);
    const materials = await this.repository.listMaterialsForResolution();
    const knownCharacters = await this.repository.listCharactersForResolution();
    const normalized = this.goodNormalizer.normalize(snapshot.items, materials);
    const normalizedCharacters = normalizeGoodCharacters(snapshot.characters, knownCharacters);
    result.sourceFilesProcessed.push(filePath);
    result.materialsParsed += snapshot.items.length;
    result.materialsResolved += normalized.resolvedItems.length;
    result.materialsUnresolved += normalized.unresolvedItems.length;
    result.goodCharactersParsed += normalizedCharacters.characters.length;
    result.goodCharactersResolved += normalizedCharacters.resolved.length;
    result.goodCharactersUnresolved += normalizedCharacters.unresolved.length;
    result.goodArtifactsParsed += snapshot.artifacts.length;
    result.warnings.push(...snapshot.warnings);
    result.examples.resolvedMaterials.push(
      ...normalized.resolvedItems.slice(0, 10).map((item) => ({
        rawName: item.rawName,
        materialKey: item.materialKey,
        quantity: item.quantity,
      })),
    );
    result.examples.unresolvedMaterials.push(
      ...normalized.unresolvedItems.slice(0, 10).map((item) => ({ rawName: item.rawName, quantity: item.quantity })),
    );

    if (!result.dryRun && playerId !== null) {
      const dbSnapshot = await this.repository.createInventorySnapshot({
        playerId,
        source: snapshot.source,
        sourceVersion: String(snapshot.metadata.version ?? ""),
        metadata: {
          ...snapshot.metadata,
          filePath: snapshot.filePath,
          fileHash: snapshot.fileHash,
          characters: snapshot.characters,
          artifacts: snapshot.artifacts,
          unresolvedItems: result.examples.unresolvedMaterials,
        },
      });
      await this.repository.replaceInventoryItems(dbSnapshot.id, normalized.items);
      await this.repository.replacePlayerCharacters(playerId, snapshot.source, normalizedCharacters.characters);
    }
  }

  private async importWeapons(filePath: string, playerId: number | null, result: PlayerSourceImportResult): Promise<void> {
    const snapshot = await this.weaponsProvider.readSnapshot(filePath);
    const normalized = this.weaponsNormalizer.normalize(snapshot.weapons);
    result.sourceFilesProcessed.push(filePath);
    result.weaponsParsed += normalized.weapons.length;
    result.weaponsResolved += normalized.resolved.length;
    result.weaponsUnresolved += normalized.unresolved.length;
    result.warnings.push(...snapshot.warnings);
    result.examples.weapons.push(
      ...normalized.weapons.slice(0, 10).map((weapon) => ({
        key: weapon.sourceWeaponKey,
        level: weapon.level,
        location: weapon.location,
        resolved: weapon.weaponId !== undefined,
      })),
    );

    if (!result.dryRun && playerId !== null) {
      await this.repository.replacePlayerWeapons(playerId, snapshot.source, normalized.weapons);
    }
  }

  private async importHoyolab(filePath: string, playerId: number | null, result: PlayerSourceImportResult): Promise<void> {
    const snapshot = await this.hoyolabProvider.readSnapshot(filePath);
    const knownCharacters = await this.repository.listCharactersForResolution();
    const normalized = this.hoyolabNormalizer.normalize(snapshot.characters, knownCharacters);
    result.sourceFilesProcessed.push(filePath);
    result.hoyolabCharactersParsed += normalized.characters.length;
    result.hoyolabCharactersResolved += normalized.resolved.length;
    result.hoyolabCharactersUnresolved += normalized.unresolved.length;
    result.warnings.push(...snapshot.warnings);
    result.examples.characters.push(
      ...normalized.characters.slice(0, 10).map((character) => ({
        sourceCharacterKey: character.sourceCharacterKey,
        characterKey: character.characterKey,
        level: character.level,
        resolved: character.characterId !== undefined,
      })),
    );

    if (!result.dryRun && playerId !== null) {
      await this.repository.replacePlayerCharacters(playerId, snapshot.source, normalized.characters);
    }
  }
}
