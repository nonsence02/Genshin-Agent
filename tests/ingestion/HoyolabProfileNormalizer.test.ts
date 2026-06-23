import { describe, expect, it } from "vitest";
import { HoyolabProfileNormalizer } from "../../src/ingestion/normalizers/HoyolabProfileNormalizer.js";

describe("HoyolabProfileNormalizer", () => {
  it("resolves by source key to char_<key> and maps talents", () => {
    const result = new HoyolabProfileNormalizer().normalize(
      [
        {
          sourceCharacterKey: "skirk",
          nameRu: "Skirk RU",
          level: 90,
          rarity: 5,
          constellation: 0,
          talents: { normalAttack: 1, elementalSkill: 10, elementalBurst: 1 },
          equippedWeapon: { name: "Azurelight", level: 90, refinement: 1, rarity: 5 },
          equippedArtifacts: [],
          sourcePayload: {},
        },
      ],
      [{ id: 1, stableKey: "char_skirk", name: "Skirk", aliases: [{ alias: "Skirk", normalized: "skirk" }] }],
    );

    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]).toMatchObject({
      characterId: 1,
      characterKey: "char_skirk",
      normalTalentLevel: 1,
      skillTalentLevel: 10,
      burstTalentLevel: 1,
    });
  });

  it("leaves unknown Russian-only characters unresolved", () => {
    const result = new HoyolabProfileNormalizer().normalize(
      [
        {
          sourceCharacterKey: "unknown_ru_only",
          nameRu: "Unknown RU",
          level: 70,
          talents: {},
          equippedArtifacts: [],
          sourcePayload: {},
        },
      ],
      [],
    );

    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]?.characterId).toBeUndefined();
  });
});
