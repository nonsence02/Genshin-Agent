import { describe, expect, it } from "vitest";
import { CharacterLevelCostError, CharacterLevelCostService } from "../../src/planner/services/CharacterLevelCostService.js";

describe("CharacterLevelCostService", () => {
  const service = new CharacterLevelCostService();

  it("returns zero costs when current and target levels match", () => {
    const result = service.calculate({ currentLevel: 90, targetLevel: 90 });

    expect(result.totalExp).toBe(0);
    expect(result.levelUpMora).toBe(0);
    expect(result.overflowExp).toBe(0);
    expect(result.expBooks.map((book) => book.quantity)).toEqual([0, 0, 0]);
  });

  it("calculates deterministic EXP books and Mora for level 20 to 90", () => {
    const result = service.calculate({ currentLevel: 20, targetLevel: 90 });

    expect(result.totalExp).toBe(8_242_475);
    expect(result.levelUpMora).toBe(1_648_600);
    expect(result.overflowExp).toBe(525);
    expect(result.expBooks).toEqual([
      {
        materialKey: "mat_heros_wit",
        name: "Hero's Wit",
        expValue: 20_000,
        quantity: 412,
        totalExp: 8_240_000,
      },
      {
        materialKey: "mat_adventurers_experience",
        name: "Adventurer's Experience",
        expValue: 5_000,
        quantity: 0,
        totalExp: 0,
      },
      {
        materialKey: "mat_wanderers_advice",
        name: "Wanderer's Advice",
        expValue: 1_000,
        quantity: 3,
        totalExp: 3_000,
      },
    ]);
  });

  it("supports a Hero's Wit first strategy for rough planning", () => {
    const result = service.calculate({ currentLevel: 20, targetLevel: 90, expBookStrategy: "hero_wit_first" });

    expect(result.expBooks.map((book) => book.quantity)).toEqual([413, 0, 0]);
    expect(result.overflowExp).toBe(17_525);
    expect(result.warnings).toHaveLength(1);
  });

  it("throws clear errors for invalid levels", () => {
    expect(() => service.calculate({ currentLevel: 0, targetLevel: 90 })).toThrow(CharacterLevelCostError);
    expect(() => service.calculate({ currentLevel: 90, targetLevel: 20 })).toThrow(CharacterLevelCostError);
  });
});
