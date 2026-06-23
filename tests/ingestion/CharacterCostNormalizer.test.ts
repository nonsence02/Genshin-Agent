import { describe, expect, it } from "vitest";
import { CharacterCostNormalizer } from "../../src/ingestion/normalizers/CharacterCostNormalizer.js";

describe("CharacterCostNormalizer", () => {
  const normalizer = new CharacterCostNormalizer();

  it("extracts ascension costs from a character-like fixture", () => {
    const result = normalizer.extractAscensionCosts({
      id: 1,
      externalKey: "Furina",
      payload: {
        costs: {
          ascend1: [
            { name: "Mora", count: 20000 },
            { name: "Varunada Lazurite Sliver", count: 1 },
            { name: "Lakelight Lily", count: 3 },
          ],
        },
      },
    });

    expect(result.ascensionCosts).toEqual([
      { phase: 1, materialName: "Mora", quantity: 20000 },
      { phase: 1, materialName: "Varunada Lazurite Sliver", quantity: 1 },
      { phase: 1, materialName: "Lakelight Lily", quantity: 3 },
    ]);
    expect(result.warnings).toHaveLength(0);
  });

  it("extracts talent costs from a talent-like fixture", () => {
    const result = normalizer.extractTalentCosts({
      id: 2,
      externalKey: "Furina",
      payload: {
        costs: {
          lvl2: [
            { name: "Mora", count: 12500 },
            { name: "Teachings of Justice", count: 3 },
          ],
        },
      },
    });

    expect(result.talentCosts).toEqual([
      { fromLevel: 1, toLevel: 2, materialName: "Mora", quantity: 12500 },
      { fromLevel: 1, toLevel: 2, materialName: "Teachings of Justice", quantity: 3 },
    ]);
    expect(result.warnings).toHaveLength(0);
  });
});
