import { describe, expect, it } from "vitest";
import {
  CharacterNotFoundError,
  CharacterRequirementError,
  CharacterRequirementService,
  inferAscensionPhaseFromLevel,
  type AscensionCostRow,
  type CharacterRequirementRepository,
  type RequirementCostMaterial,
  type RequirementCharacter,
  type TalentCostRow,
} from "../../src/planner/services/CharacterRequirementService.js";

class MockCharacterRequirementRepository implements CharacterRequirementRepository {
  readonly character: RequirementCharacter = {
    id: 1,
    stableKey: "char_furina",
    name: "Furina",
  };

  private readonly ascensionCosts: AscensionCostRow[] = [
    this.asc(1, "mat_mora", "Mora", 20000),
    this.asc(1, "mat_lakelight_lily", "Lakelight Lily", 3),
    this.asc(2, "mat_mora", "Mora", 40000),
    this.asc(2, "mat_lakelight_lily", "Lakelight Lily", 10),
    this.asc(3, "mat_mora", "Mora", 60000),
    this.asc(3, "mat_lakelight_lily", "Lakelight Lily", 20),
    this.asc(4, "mat_mora", "Mora", 80000),
    this.asc(4, "mat_lakelight_lily", "Lakelight Lily", 30),
    this.asc(5, "mat_mora", "Mora", 100000),
    this.asc(5, "mat_lakelight_lily", "Lakelight Lily", 45),
    this.asc(6, "mat_mora", "Mora", 120000),
    this.asc(6, "mat_lakelight_lily", "Lakelight Lily", 60),
  ];

  private readonly talentCosts: TalentCostRow[] = [
    this.talent(1, 2, "mat_mora", "Mora", 12500),
    this.talent(1, 2, "mat_teachings_of_justice", "Teachings of Justice", 3),
    this.talent(2, 3, "mat_mora", "Mora", 17500),
    this.talent(2, 3, "mat_teachings_of_justice", "Teachings of Justice", 2),
    this.talent(3, 4, "mat_mora", "Mora", 25000),
    this.talent(3, 4, "mat_teachings_of_justice", "Teachings of Justice", 4),
    this.talent(4, 5, "mat_mora", "Mora", 30000),
    this.talent(4, 5, "mat_teachings_of_justice", "Teachings of Justice", 6),
    this.talent(5, 6, "mat_mora", "Mora", 37500),
    this.talent(5, 6, "mat_teachings_of_justice", "Teachings of Justice", 9),
    this.talent(6, 7, "mat_mora", "Mora", 120000),
    this.talent(6, 7, "mat_teachings_of_justice", "Teachings of Justice", 4),
    this.talent(7, 8, "mat_mora", "Mora", 260000),
    this.talent(7, 8, "mat_teachings_of_justice", "Teachings of Justice", 6),
    this.talent(8, 9, "mat_mora", "Mora", 450000),
    this.talent(8, 9, "mat_teachings_of_justice", "Teachings of Justice", 12),
    this.talent(9, 10, "mat_mora", "Mora", 700000),
    this.talent(9, 10, "mat_teachings_of_justice", "Teachings of Justice", 16),
  ];

  constructor(private readonly found = true) {}

  async findCharacterByStableKey(stableKey: string): Promise<RequirementCharacter | null> {
    return this.found && stableKey === this.character.stableKey ? this.character : null;
  }

  async listMaterialsByStableKeys(stableKeys: string[]): Promise<RequirementCostMaterial[]> {
    return stableKeys.map((stableKey) => ({
      id: this.materialId(stableKey),
      stableKey,
      name:
        {
          mat_mora: "Mora",
          mat_heros_wit: "Hero's Wit",
          mat_adventurers_experience: "Adventurer's Experience",
          mat_wanderers_advice: "Wanderer's Advice",
        }[stableKey] ?? stableKey,
    }));
  }

  async listAscensionCosts(_characterId: number, phases: number[]): Promise<AscensionCostRow[]> {
    return this.ascensionCosts.filter((cost) => phases.includes(cost.phase));
  }

  async listTalentCosts(_characterId: number, fromLevel: number, toLevel: number): Promise<TalentCostRow[]> {
    return this.talentCosts.filter((cost) => cost.fromLevel >= fromLevel && cost.toLevel <= toLevel);
  }

  private asc(phase: number, materialStableKey: string, materialName: string, quantity: number): AscensionCostRow {
    return {
      phase,
      materialId: this.materialId(materialStableKey),
      materialStableKey,
      materialName,
      quantity,
    };
  }

  private talent(
    fromLevel: number,
    toLevel: number,
    materialStableKey: string,
    materialName: string,
    quantity: number,
  ): TalentCostRow {
    return {
      fromLevel,
      toLevel,
      materialId: this.materialId(materialStableKey),
      materialStableKey,
      materialName,
      quantity,
    };
  }

  private materialId(stableKey: string): number {
    return {
      mat_mora: 1,
      mat_lakelight_lily: 2,
      mat_teachings_of_justice: 3,
      mat_heros_wit: 4,
      mat_adventurers_experience: 5,
      mat_wanderers_advice: 6,
    }[stableKey] ?? 999;
  }
}

function materialQuantity(result: Awaited<ReturnType<CharacterRequirementService["calculate"]>>, stableKey: string): number {
  return result.materials.find((material) => material.stableKey === stableKey)?.quantity ?? 0;
}

describe("CharacterRequirementService", () => {
  it("infers ascension phases from levels", () => {
    expect(inferAscensionPhaseFromLevel(1)).toBe(0);
    expect(inferAscensionPhaseFromLevel(20)).toBe(0);
    expect(inferAscensionPhaseFromLevel(21)).toBe(1);
    expect(inferAscensionPhaseFromLevel(40)).toBe(1);
    expect(inferAscensionPhaseFromLevel(90)).toBe(6);
  });

  it("currentLevel 20 to targetLevel 90 includes phases 1..6", async () => {
    const result = await new CharacterRequirementService(new MockCharacterRequirementRepository()).calculate({
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
    });

    expect(result.ascension.includedPhases).toEqual([1, 2, 3, 4, 5, 6]);
    expect(materialQuantity(result, "mat_lakelight_lily")).toBe(168);
    expect(materialQuantity(result, "mat_heros_wit")).toBe(412);
    expect(materialQuantity(result, "mat_wanderers_advice")).toBe(3);
  });

  it("currentLevel 40 with currentAscensionPhase 1 to targetLevel 50 includes phase 2", async () => {
    const result = await new CharacterRequirementService(new MockCharacterRequirementRepository()).calculate({
      characterKey: "char_furina",
      currentLevel: 40,
      targetLevel: 50,
      currentAscensionPhase: 1,
    });

    expect(result.ascension.includedPhases).toEqual([2]);
  });

  it("skill 1 to 9 includes levels 2..9", async () => {
    const result = await new CharacterRequirementService(new MockCharacterRequirementRepository()).calculate({
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 20,
      targetTalents: {
        skill: 9,
      },
    });

    expect(result.talents.skill.includedLevels).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("aggregates separate skill and burst talent tracks", async () => {
    const result = await new CharacterRequirementService(new MockCharacterRequirementRepository()).calculate({
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 20,
      targetTalents: {
        skill: 9,
        burst: 10,
      },
    });

    expect(materialQuantity(result, "mat_teachings_of_justice")).toBe(108);
    expect(result.materials.find((material) => material.stableKey === "mat_teachings_of_justice")?.sources).toEqual([
      "talent_skill",
      "talent_burst",
    ]);
  });

  it("merges Mora across ascension and talents", async () => {
    const result = await new CharacterRequirementService(new MockCharacterRequirementRepository()).calculate({
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
      targetTalents: {
        skill: 9,
      },
    });

    expect(result.materials[0]?.stableKey).toBe("mat_mora");
    expect(materialQuantity(result, "mat_mora")).toBe(3021100);
    expect(result.materials.find((material) => material.stableKey === "mat_mora")?.sources).toEqual([
      "level_mora",
      "ascension",
      "talent_skill",
    ]);
  });

  it("adds character EXP books as level_exp requirements", async () => {
    const result = await new CharacterRequirementService(new MockCharacterRequirementRepository()).calculate({
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
    });

    expect(result.materials.find((material) => material.stableKey === "mat_heros_wit")).toMatchObject({
      quantity: 412,
      sources: ["level_exp"],
    });
    expect(result.materials.find((material) => material.stableKey === "mat_wanderers_advice")).toMatchObject({
      quantity: 3,
      sources: ["level_exp"],
    });
    expect(result.materials.find((material) => material.stableKey === "mat_adventurers_experience")).toBeUndefined();
  });

  it("throws clear errors for invalid input", async () => {
    await expect(
      new CharacterRequirementService(new MockCharacterRequirementRepository()).calculate({
        characterKey: "char_furina",
        currentLevel: 91,
        targetLevel: 90,
      }),
    ).rejects.toThrow(CharacterRequirementError);
  });

  it("throws a typed error when the character is missing", async () => {
    await expect(
      new CharacterRequirementService(new MockCharacterRequirementRepository(false)).calculate({
        characterKey: "char_unknown",
        currentLevel: 1,
        targetLevel: 20,
      }),
    ).rejects.toThrow(CharacterNotFoundError);
  });
});
