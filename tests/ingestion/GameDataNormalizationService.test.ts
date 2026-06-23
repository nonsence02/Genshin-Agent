import { describe, expect, it } from "vitest";
import {
  GameDataNormalizationService,
  type AliasWriteResult,
  type EntityWriteResult,
  type GameDataNormalizationRepository,
} from "../../src/ingestion/services/GameDataNormalizationService.js";
import type { NormalizedAlias, RawGameObjectForNormalization } from "../../src/ingestion/normalizers/types.js";
import { CharacterNormalizer, type NormalizedCharacter } from "../../src/ingestion/normalizers/CharacterNormalizer.js";
import { MaterialNormalizer, type NormalizedMaterial } from "../../src/ingestion/normalizers/MaterialNormalizer.js";

class MockNormalizationRepository implements GameDataNormalizationRepository {
  private readonly characters = new Map<string, number>();
  private readonly materials = new Map<string, number>();
  private readonly aliases = new Map<string, number>();
  private nextId = 1;

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
        : [
            {
              id: 200,
              externalKey: "Teachings of Justice",
              payload: { name: "Teachings of Justice", rarity: 2, category: "AVATAR_MATERIAL" },
              sourceVersion: "5.2.11",
            },
          ];

    return limit ? objects.slice(0, limit) : objects;
  }

  async upsertCharacter(character: NormalizedCharacter): Promise<EntityWriteResult> {
    return this.upsertEntity(this.characters, character.stableKey);
  }

  async upsertMaterial(material: NormalizedMaterial): Promise<EntityWriteResult> {
    return this.upsertEntity(this.materials, material.stableKey);
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
      () => undefined,
    );

    const first = await service.normalize();
    const second = await service.normalize();

    expect(first.characters).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(first.materials).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(first.aliases.created).toBe(2);
    expect(second.characters).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(second.materials).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(second.aliases.updated).toBe(2);
  });

  // TODO: add PostgreSQL integration coverage once test database lifecycle is configured.
});
