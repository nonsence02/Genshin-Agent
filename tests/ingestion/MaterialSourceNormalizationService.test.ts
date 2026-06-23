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
  type MaterialReference,
  type MaterialSourceWrite,
  type TalentCostWrite,
} from "../../src/ingestion/services/GameDataNormalizationService.js";
import type { NormalizedCharacter } from "../../src/ingestion/normalizers/CharacterNormalizer.js";
import type { NormalizedDomain } from "../../src/ingestion/normalizers/DomainNormalizer.js";
import type { NormalizedEnemy } from "../../src/ingestion/normalizers/EnemyNormalizer.js";
import type { NormalizedMaterial } from "../../src/ingestion/normalizers/MaterialNormalizer.js";
import type { NormalizedAlias, RawGameObjectForNormalization } from "../../src/ingestion/normalizers/types.js";

class SourceNormalizationRepository implements GameDataNormalizationRepository {
  materialSources: MaterialSourceWrite[] = [];
  farmEntries: FarmCalendarEntryWrite[] = [];

  async listRawObjects(_source: string, folder: string): Promise<RawGameObjectForNormalization[]> {
    if (folder === "materials") {
      return [
        {
          id: 1,
          externalKey: "Lakelight Lily",
          payload: {
            name: "Lakelight Lily",
            typeText: "Local Specialty (Fontaine)",
            sources: ["Recommendation: Found in Erinnyes Forest", "Dropped by unresolved source"],
          },
        },
      ];
    }

    if (folder === "domains") {
      return [
        {
          id: 2,
          externalKey: "Domain of Mastery: Admonishing Engraving I",
          payload: {
            entranceName: "Pale Forgotten Glory",
            daysOfWeek: ["Tuesday", "Friday", "Sunday"],
            rewardPreview: [{ name: "Teachings of Justice" }],
          },
        },
      ];
    }

    return [];
  }

  async countRawObjects(): Promise<number> {
    return 0;
  }

  async countCharacters(): Promise<number> {
    return 0;
  }

  async countMaterials(): Promise<number> {
    return 3;
  }

  async findCharacterForRaw(): Promise<null> {
    return null;
  }

  async listMaterialsForResolution(): Promise<MaterialReference[]> {
    return [
      { id: 10, stableKey: "mat_lakelight_lily", name: "Lakelight Lily", aliases: [{ alias: "Lakelight Lily", normalized: "lakelight_lily" }] },
      {
        id: 11,
        stableKey: "mat_teachings_of_justice",
        name: "Teachings of Justice",
        aliases: [{ alias: "Teachings of Justice", normalized: "teachings_of_justice" }],
      },
      {
        id: 12,
        stableKey: "mat_whopperflower_nectar",
        name: "Whopperflower Nectar",
        aliases: [{ alias: "Whopperflower Nectar", normalized: "whopperflower_nectar" }],
      },
    ];
  }

  async replaceCharacterAscensionCosts(_characterId: number, costs: AscensionCostWrite[]): Promise<number> {
    return costs.length;
  }

  async replaceCharacterTalentCosts(_characterId: number, costs: TalentCostWrite[]): Promise<number> {
    return costs.length;
  }

  async replaceDomainRewards(_domainId: number, rewards: DomainRewardWrite[]): Promise<number> {
    return rewards.length;
  }

  async replaceEnemyDrops(_enemyId: number, drops: EnemyDropWrite[]): Promise<number> {
    return drops.length;
  }

  async replaceMaterialSources(sources: MaterialSourceWrite[]): Promise<number> {
    this.materialSources = sources;
    return sources.length;
  }

  async replaceFarmCalendarEntries(entries: FarmCalendarEntryWrite[]): Promise<number> {
    this.farmEntries = entries;
    return entries.length;
  }

  async listDomainRewardSources(): Promise<DomainRewardSource[]> {
    return [
      {
        materialId: 11,
        domainId: 20,
        domainStableKey: "domain_pale_forgotten_glory",
        domainName: "Pale Forgotten Glory",
        rewardType: "talent",
        rawPayload: { name: "Teachings of Justice" },
      },
    ];
  }

  async listEnemyDropSources(): Promise<EnemyDropSource[]> {
    return [
      {
        materialId: 12,
        enemyId: 30,
        enemyStableKey: "enemy_cryo_whopperflower",
        enemyName: "Cryo Whopperflower",
        enemyType: "NORMAL",
        family: "Whopperflower",
        rawPayload: { name: "Whopperflower Nectar" },
      },
    ];
  }

  async upsertCharacter(_character: NormalizedCharacter): Promise<EntityWriteResult> {
    return { id: 1, created: true };
  }

  async upsertMaterial(_material: NormalizedMaterial): Promise<EntityWriteResult> {
    return { id: 1, created: true };
  }

  async upsertDomain(_domain: NormalizedDomain): Promise<EntityWriteResult> {
    return { id: 20, created: false };
  }

  async upsertEnemy(_enemy: NormalizedEnemy): Promise<EntityWriteResult> {
    return { id: 30, created: false };
  }

  async upsertAlias(_input: { entityType: "character" | "material"; entityId: number; alias: NormalizedAlias }): Promise<AliasWriteResult> {
    return { created: true, updated: false, skipped: false };
  }
}

describe("material source normalization service", () => {
  it("creates material sources from material payloads, domain rewards, and enemy drops", async () => {
    const repository = new SourceNormalizationRepository();
    const service = new GameDataNormalizationService(repository, undefined, undefined, undefined, () => undefined);

    const result = await service.normalize({ sections: ["material-sources"] });

    expect(result.materialSourcesInserted).toBe(3);
    expect(result.unresolvedSourceReferences).toBe(1);
    expect(repository.materialSources.map((source) => source.sourceType)).toEqual(["local_specialty", "domain", "enemy"]);
  });

  it("replaces material sources idempotently on repeated runs", async () => {
    const repository = new SourceNormalizationRepository();
    const service = new GameDataNormalizationService(repository, undefined, undefined, undefined, () => undefined);

    await service.normalize({ sections: ["material-sources"] });
    await service.normalize({ sections: ["material-sources"] });

    expect(repository.materialSources).toHaveLength(3);
  });

  it("creates farm calendar entries from domain days", async () => {
    const repository = new SourceNormalizationRepository();
    const service = new GameDataNormalizationService(repository, undefined, undefined, undefined, () => undefined);

    const result = await service.normalize({ sections: ["farm-calendar"] });

    expect(result.farmCalendarEntriesInserted).toBe(3);
    expect(repository.farmEntries.map((entry) => entry.dayOfWeek)).toEqual(["tuesday", "friday", "sunday"]);
  });
});
