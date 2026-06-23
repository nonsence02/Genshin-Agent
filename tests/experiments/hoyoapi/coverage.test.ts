import { describe, expect, it } from "vitest";
import { detectHoyoApiFieldCoverage } from "../../../src/experiments/hoyoapi/sanitizeHoyoApiOutput.js";

describe("detectHoyoApiFieldCoverage", () => {
  it("identifies nested character, weapon, talent, and artifact fields", () => {
    const coverage = detectHoyoApiFieldCoverage([
      {
        characters: [
          {
            level: 90,
            rarity: 5,
            actived_constellation_num: 2,
            skill_list: [{ level: 10 }],
            weapon: { level: 90 },
            reliquaries: [
              {
                set_name: "Golden Troupe",
                pos: "flower",
                level: 20,
                rarity: 5,
                main_stat: { name: "HP" },
                substats: [{ name: "CRIT Rate" }],
              },
            ],
          },
        ],
      },
    ]);

    expect(coverage).toEqual({
      level: true,
      rarity: true,
      constellation: true,
      talents: true,
      equippedWeapon: true,
      equippedArtifacts: true,
      artifactSet: true,
      artifactSlot: true,
      artifactLevel: true,
      artifactRarity: true,
      artifactMainStat: true,
      artifactSubstats: true,
    });
  });
});
