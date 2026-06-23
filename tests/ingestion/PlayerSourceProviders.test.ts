import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { HoyolabProfileProvider } from "../../src/ingestion/providers/HoyolabProfileProvider.js";
import { InventoryKameraWeaponsProvider } from "../../src/ingestion/providers/InventoryKameraWeaponsProvider.js";

describe("player source providers", () => {
  it("parses Inventory Kamera weapons.json shape", async () => {
    const snapshot = await new InventoryKameraWeaponsProvider().readSnapshot("tests/fixtures/inventory-kamera-weapons.sample.json");

    expect(snapshot.weapons).toHaveLength(1);
    expect(snapshot.weapons[0]).toMatchObject({
      key: "AstralVulturesCrimsonPlumage",
      level: 90,
      ascension: 6,
      refinement: 1,
      location: "Chasca",
      lock: false,
      inventorySourceId: 0,
    });
  });

  it("parses HoYoLAB profile and maps talent names", async () => {
    const snapshot = await new HoyolabProfileProvider().readSnapshot("tests/fixtures/hoyolab-profile.sample.json");
    const skirk = snapshot.characters.find((character) => character.sourceCharacterKey === "skirk");

    expect(skirk).toMatchObject({
      sourceCharacterKey: "skirk",
      level: 90,
      constellation: 0,
      talents: {
        normalAttack: 1,
        elementalSkill: 10,
        elementalBurst: 1,
      },
    });
  });

  it("gitignore protects private user import JSON files", async () => {
    const gitignore = await readFile(".gitignore", "utf-8");

    expect(gitignore).toContain("data/raw/user_imports/*.json");
  });
});
