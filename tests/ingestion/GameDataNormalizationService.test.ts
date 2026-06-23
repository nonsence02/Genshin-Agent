import { describe, expect, it } from "vitest";
import {
  GameDataNormalizationService,
  type AliasWriteResult,
  type AscensionCostWrite,
  type DomainRewardSource,
  type DomainRewardWrite,
  type EnemyDropSource,
  type EnemyDropWrite,
  type EntityWriteResult,
  type FarmCalendarEntryWrite,
  type GameDataNormalizationRepository,
  type MaterialSourceWrite,
  type MaterialReference,
  type TalentCostWrite,
} from "../../src/ingestion/services/GameDataNormalizationService.js";
import type { NormalizedAlias, RawGameObjectForNormalization } from "../../src/ingestion/normalizers/types.js";
import { CharacterNormalizer, type NormalizedCharacter } from "../../src/ingestion/normalizers/CharacterNormalizer.js";
import { CharacterCostNormalizer } from "../../src/ingestion/normalizers/CharacterCostNormalizer.js";
import { MaterialNormalizer, type NormalizedMaterial } from "../../src/ingestion/normalizers/MaterialNormalizer.js";
import type { NormalizedDomain } from "../../src/ingestion/normalizers/DomainNormalizer.js";
import type { NormalizedEnemy } from "../../src/ingestion/normalizers/EnemyNormalizer.js";

class MockNormalizationRepository implements GameDataNormalizationRepository {
  private readonly characters = new Map<string, number>();
  private readonly materials = new Map<string, number>();
  private readonly aliases = new Map<string, number>();
  ascensionWrites: AscensionCostWrite[] = [];
  talentWrites: TalentCostWrite[] = [];
  domainRewardWrites: DomainRewardWrite[] = [];
  enemyDropWrites: EnemyDropWrite[] = [];
  materialSourceWrites: MaterialSourceWrite[] = [];
  farmCalendarWrites: FarmCalendarEntryWrite[] = [];
  private nextId = 1;

  constructor(private readonly exposeMaterials = true) {}

  async listRawObjects(_source: string, folder: string, limit?: number): Promise<RawGameObjectForNormalization[]> {
    const objects =
      folder === "characters"
        ? [
            {
              id: 100,
              externalKey: "Furina",
              payload: { name: "Furina", rarity: 5, elementText: "Hydro", weaponText: "Sword" },
              sourceVersion: "5.2.11",
            },
          ]
        : folder === "materials"
          ? [
            {
              id: 200,
              externalKey: "Teachings of Justice",
              payload: { name: "Teachings of Justice", rarity: 2, category: "AVATAR_MATERIAL" },
              sourceVersion: "5.2.11",
            },
          ]
          : [
              {
                id: 300,
                externalKey: "Furina",
                payload: { name: "Furina", costs: { lvl2: [{ name: "Teachings of Justice", count: 3 }] } },
                sourceVersion: "5.2.11",
              },
            ];

    return limit ? objects.slice(0, limit) : objects;
  }

  async countRawObjects(_source: string, folder: string): Promise<number> {
    return (await this.listRawObjects("genshin-db", folder)).length;
  }

  async countCharacters(): Promise<number> {
    return this.characters.size;
  }

  async countMaterials(): Promise<number> {
    return this.materials.size;
  }

  async findCharacterForRaw(rawObject: RawGameObjectForNormalization) {
    const id = this.characters.get(`char_${rawObject.externalKey.toLowerCase()}`);
    return id ? { id, stableKey: `char_${rawObject.externalKey.toLowerCase()}`, name: rawObject.externalKey } : null;
  }

  async listMaterialsForResolution(): Promise<MaterialReference[]> {
    const materialId = this.materials.get("mat_teachings_of_justice");
    return materialId && this.exposeMaterials
      ? [
          {
            id: materialId,
            stableKey: "mat_teachings_of_justice",
            name: "Teachings of Justice",
            aliases: [{ alias: "Teachings of Justice", normalized: "teachings_of_justice" }],
          },
        ]
      : [];
  }

  async replaceCharacterAscensionCosts(characterId: number, costs: AscensionCostWrite[]): Promise<number> {
    this.ascensionWrites = this.ascensionWrites.filter((cost) => cost.characterId !== characterId).concat(costs);
    return costs.length;
  }

  async replaceCharacterTalentCosts(characterId: number, costs: TalentCostWrite[]): Promise<number> {
    this.talentWrites = this.talentWrites.filter((cost) => cost.characterId !== characterId).concat(costs);
    return costs.length;
  }

  async replaceDomainRewards(domainId: number, rewards: DomainRewardWrite[]): Promise<number> {
    this.domainRewardWrites = this.domainRewardWrites.filter((reward) => reward.domainId !== domainId).concat(rewards);
    return rewards.length;
  }

  async replaceEnemyDrops(enemyId: number, drops: EnemyDropWrite[]): Promise<number> {
    this.enemyDropWrites = this.enemyDropWrites.filter((drop) => drop.enemyId !== enemyId).concat(drops);
    return drops.length;
  }

  async replaceMaterialSources(sources: MaterialSourceWrite[]): Promise<number> {
    this.materialSourceWrites = sources;
    return sources.length;
  }

  async replaceFarmCalendarEntries(entries: FarmCalendarEntryWrite[]): Promise<number> {
    this.farmCalendarWrites = entries;
    return entries.length;
  }

  async listDomainRewardSources(): Promise<DomainRewardSource[]> {
    return [];
  }

  async listEnemyDropSources(): Promise<EnemyDropSource[]> {
    return [];
  }

  async upsertCharacter(character: NormalizedCharacter): Promise<EntityWriteResult> {
    return this.upsertEntity(this.characters, character.stableKey);
  }

  async upsertMaterial(material: NormalizedMaterial): Promise<EntityWriteResult> {
    return this.upsertEntity(this.materials, material.stableKey);
  }

  async upsertDomain(domain: NormalizedDomain): Promise<EntityWriteResult> {
    return this.upsertEntity(new Map([[domain.stableKey, 900]]), domain.stableKey);
  }

  async upsertEnemy(enemy: NormalizedEnemy): Promise<EntityWriteResult> {
    return this.upsertEntity(new Map([[enemy.stableKey, 901]]), enemy.stableKey);
  }

  async upsertAlias(input: {
    entityType: "character" | "material";
    entityId: number;
    alias: NormalizedAlias;
  }): Promise<AliasWriteResult> {
    const key = `${input.entityType}:${input.alias.normalized}`;
    const existing = this.aliases.get(key);

    if (existing === undefined) {
      this.aliases.set(key, input.entityId);
      return { created: true, updated: false, skipped: false };
    }

    return existing === input.entityId
      ? { created: false, updated: true, skipped: false }
      : { created: false, updated: false, skipped: true };
  }

  private upsertEntity(store: Map<string, number>, stableKey: string): EntityWriteResult {
    const existing = store.get(stableKey);

    if (existing !== undefined) {
      return { id: existing, created: false };
    }

    const id = this.nextId;
    this.nextId += 1;
    store.set(stableKey, id);
    return { id, created: true };
  }
}

describe("GameDataNormalizationService", () => {
  it("normalizes raw characters and materials idempotently with aliases", async () => {
    const repository = new MockNormalizationRepository();
    const service = new GameDataNormalizationService(
      repository,
      new CharacterNormalizer(),
      new MaterialNormalizer(),
      new CharacterCostNormalizer(),
      () => undefined,
    );

    const first = await service.normalize({ sections: ["characters", "materials"] });
    const second = await service.normalize({ sections: ["characters", "materials"] });

    expect(first.characters).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(first.materials).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(first.aliases.created).toBe(2);
    expect(second.characters).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(second.materials).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(second.aliases.updated).toBe(2);
  });

  it("replaces character cost rows idempotently", async () => {
    const repository = new MockNormalizationRepository();
    const service = new GameDataNormalizationService(
      repository,
      new CharacterNormalizer(),
      new MaterialNormalizer(),
      new CharacterCostNormalizer(),
      () => undefined,
    );

    await service.normalize({ sections: ["characters", "materials"] });
    const first = await service.normalize({ sections: ["character-costs"] });
    const second = await service.normalize({ sections: ["character-costs"] });

    expect(first.characterTalentCosts.created).toBe(1);
    expect(second.characterTalentCosts.created).toBe(1);
    expect(repository.talentWrites).toHaveLength(1);
  });

  it("reports unresolved materials without failing the whole run", async () => {
    const repository = new MockNormalizationRepository(false);
    const service = new GameDataNormalizationService(
      repository,
      new CharacterNormalizer(),
      new MaterialNormalizer(),
      new CharacterCostNormalizer(),
      () => undefined,
    );

    await service.normalize({ sections: ["characters", "materials"] });
    const result = await service.normalize({ sections: ["character-costs"] });

    expect(result.unresolvedMaterials).toBe(1);
    expect(result.characterTalentCosts.created).toBe(0);
    expect(result.specialCases.some((warning) => warning.includes("Unresolved talent material"))).toBe(true);
  });

  // TODO: add PostgreSQL integration coverage once test database lifecycle is configured.
});
