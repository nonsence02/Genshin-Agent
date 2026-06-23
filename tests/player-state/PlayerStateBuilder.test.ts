import { describe, expect, it } from "vitest";
import { PlayerStateBuilder } from "../../src/player-state/services/PlayerStateBuilder.js";

function buildService() {
  return new PlayerStateBuilder({
    async loadPlayerStateData() {
      return {
        player: { id: 1, stableKey: "default" },
        knownCharacters: [
          { id: 10, stableKey: "char_furina", name: "Furina", aliases: [{ alias: "furina", normalized: "furina" }] },
          { id: 11, stableKey: "char_kaeya", name: "Kaeya", aliases: [{ alias: "Kaeya", normalized: "kaeya" }] },
        ],
        latestGoodSnapshot: {
          rawPayload: {
            artifacts: [
              { key: "flower", setKey: "golden_troupe", slot: "flower", level: 20, rarity: 5, location: "Kaeya", mainStatKey: "hp" },
            ],
          },
        },
        characters: [
          {
            id: 1,
            source: "inventory-kamera-good",
            sourceCharacterKey: "Kaeya",
            name: "Kaeya",
            level: 50,
            ascension: 3,
            constellation: 1,
            talentNormal: 2,
            talentSkill: 2,
            talentBurst: 2,
            equippedWeaponName: null,
            equippedWeaponLevel: null,
            equippedWeaponRefinement: null,
            rawPayload: {},
            character: { id: 11, stableKey: "char_kaeya", name: "Kaeya" },
          },
          {
            id: 2,
            source: "hoyolab_profile",
            sourceCharacterKey: "kaeya",
            name: "Kaeya",
            level: 51,
            ascension: null,
            constellation: 2,
            talentNormal: 3,
            talentSkill: 4,
            talentBurst: 5,
            equippedWeaponName: null,
            equippedWeaponLevel: null,
            equippedWeaponRefinement: null,
            rawPayload: {},
            character: { id: 11, stableKey: "char_kaeya", name: "Kaeya" },
          },
        ],
        weapons: [
          {
            source: "inventory-kamera-weapons",
            sourceWeaponKey: "CoolSword",
            level: 80,
            refinement: 2,
            location: "Kaeya",
            rawPayload: {},
            weapon: { stableKey: "weapon_cool_sword", name: "Cool Sword", rarity: 4 },
          },
        ],
      };
    },
  });
}

describe("PlayerStateBuilder", () => {
  it("uses GOOD ascension when hoyolab has no ascension", async () => {
    const result = await buildService().getCharacterState({ playerKey: "default", characterKey: "char_kaeya" });

    expect(result.ascension).toBe(3);
    expect(result.sources.ascension).toBe("inventory-kamera-good");
  });

  it("uses hoyolab level and talents over GOOD values", async () => {
    const result = await buildService().getCharacterState({ playerKey: "default", characterKey: "char_kaeya" });

    expect(result.level).toBe(51);
    expect(result.talents).toEqual({ normal: 3, skill: 4, burst: 5 });
    expect(result.sources.level).toBe("hoyolab_profile");
  });

  it("attaches GOOD artifacts by location", async () => {
    const result = await buildService().getCharacterState({ playerKey: "default", characterKey: "char_kaeya" });

    expect(result.equippedArtifacts).toMatchObject([{ slot: "flower", source: "inventory-kamera-good", confidence: "high" }]);
  });

  it("uses weapons.json location as equipped weapon fallback", async () => {
    const result = await buildService().getCharacterState({ playerKey: "default", characterKey: "char_kaeya" });

    expect(result.equippedWeapon).toMatchObject({ stableKey: "weapon_cool_sword", source: "inventory-kamera-weapons" });
  });

  it("reports conflicts when sources disagree", async () => {
    const result = await buildService().getCharacterState({ playerKey: "default", characterKey: "char_kaeya" });

    expect(result.conflicts.map((conflict) => conflict.field)).toContain("level");
  });
});
