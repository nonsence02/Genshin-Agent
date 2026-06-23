import { describe, expect, it } from "vitest";
import { CharacterNormalizer } from "../../src/ingestion/normalizers/CharacterNormalizer.js";

describe("CharacterNormalizer", () => {
  it("normalizes a Furina-like raw object", () => {
    const normalized = new CharacterNormalizer().normalize({
      id: 10,
      externalKey: "Furina",
      sourceVersion: "5.2.11",
      payload: {
        name: "Furina",
        rarity: 5,
        elementText: "Hydro",
        weaponText: "Sword",
        affiliation: "Court of Fontaine",
        birthday: "October 13",
        constellation: "Animula Choragi",
      },
    });

    expect(normalized).toMatchObject({
      stableKey: "char_furina",
      name: "Furina",
      rarity: 5,
      element: "Hydro",
      weaponType: "Sword",
      region: null,
      affiliation: "Court of Fontaine",
      birthday: "October 13",
      constellation: "Animula Choragi",
      sourceExternalKey: "Furina",
      rawGameObjectId: 10,
    });
    expect(normalized.aliases).toContainEqual({
      alias: "Furina",
      normalized: "furina",
    });
  });
});
