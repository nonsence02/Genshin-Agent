import { describe, expect, it } from "vitest";
import { MaterialNormalizer } from "../../src/ingestion/normalizers/MaterialNormalizer.js";

describe("MaterialNormalizer", () => {
  it("normalizes a material-like raw object", () => {
    const normalized = new MaterialNormalizer().normalize({
      id: 20,
      externalKey: "Teachings of Justice",
      sourceVersion: "5.2.11",
      payload: {
        name: "Teachings of Justice",
        rarity: 2,
        category: "AVATAR_MATERIAL",
        typeText: "Character Talent Material",
      },
    });

    expect(normalized).toMatchObject({
      stableKey: "mat_teachings_of_justice",
      name: "Teachings of Justice",
      rarity: 2,
      category: "AVATAR_MATERIAL",
      typeText: "Character Talent Material",
      sourceExternalKey: "Teachings of Justice",
      rawGameObjectId: 20,
    });
    expect(normalized.aliases).toContainEqual({
      alias: "Teachings of Justice",
      normalized: "teachings_of_justice",
    });
  });
});
