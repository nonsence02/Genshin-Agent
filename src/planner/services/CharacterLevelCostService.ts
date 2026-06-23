import {
  CHARACTER_CUMULATIVE_EXP_BY_LEVEL,
  CHARACTER_EXP_BOOKS,
  CHARACTER_LEVEL_MAX,
  CHARACTER_LEVEL_MIN,
} from "../data/characterLevelCurve.js";

export type ExpBookStrategy = "minimal_waste" | "hero_wit_first";

export interface CharacterLevelCostInput {
  currentLevel: number;
  targetLevel: number;
  expBookStrategy?: ExpBookStrategy;
}

export interface CharacterLevelCostResult {
  currentLevel: number;
  targetLevel: number;
  totalExp: number;
  levelUpMora: number;
  expBooks: Array<{
    materialKey: string;
    name: string;
    expValue: number;
    quantity: number;
    totalExp: number;
  }>;
  overflowExp: number;
  warnings: string[];
}

export class CharacterLevelCostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterLevelCostError";
  }
}

export class CharacterLevelCostService {
  calculate(input: CharacterLevelCostInput): CharacterLevelCostResult {
    validateLevel("currentLevel", input.currentLevel);
    validateLevel("targetLevel", input.targetLevel);

    if (input.targetLevel < input.currentLevel) {
      throw new CharacterLevelCostError("targetLevel must be greater than or equal to currentLevel");
    }

    const totalExp =
      CHARACTER_CUMULATIVE_EXP_BY_LEVEL[input.targetLevel] -
      CHARACTER_CUMULATIVE_EXP_BY_LEVEL[input.currentLevel];
    const strategy = input.expBookStrategy ?? "minimal_waste";
    const expBooks = strategy === "hero_wit_first" ? heroWitFirst(totalExp) : minimalWaste(totalExp);
    const bookExp = expBooks.reduce((sum, book) => sum + book.totalExp, 0);

    return {
      currentLevel: input.currentLevel,
      targetLevel: input.targetLevel,
      totalExp,
      levelUpMora: bookExp / 5,
      expBooks,
      overflowExp: bookExp - totalExp,
      warnings:
        strategy === "minimal_waste"
          ? []
          : ["hero_wit_first may use more EXP book overflow than minimal_waste."],
    };
  }
}

function validateLevel(label: string, value: number): void {
  if (!Number.isInteger(value) || value < CHARACTER_LEVEL_MIN || value > CHARACTER_LEVEL_MAX) {
    throw new CharacterLevelCostError(`${label} must be an integer from ${CHARACTER_LEVEL_MIN} to ${CHARACTER_LEVEL_MAX}`);
  }
}

function minimalWaste(totalExp: number): CharacterLevelCostResult["expBooks"] {
  if (totalExp === 0) {
    return withBookMetadata([0, 0, 0]);
  }

  const targetBookExp = Math.ceil(totalExp / 1_000) * 1_000;
  const heroWits = Math.floor(targetBookExp / 20_000);
  const afterHero = targetBookExp - heroWits * 20_000;
  const adventurersExperience = Math.floor(afterHero / 5_000);
  const afterAdventurer = afterHero - adventurersExperience * 5_000;
  const wanderersAdvice = afterAdventurer / 1_000;

  return withBookMetadata([heroWits, adventurersExperience, wanderersAdvice]);
}

function heroWitFirst(totalExp: number): CharacterLevelCostResult["expBooks"] {
  if (totalExp === 0) {
    return withBookMetadata([0, 0, 0]);
  }

  return withBookMetadata([Math.ceil(totalExp / 20_000), 0, 0]);
}

function withBookMetadata(quantities: number[]): CharacterLevelCostResult["expBooks"] {
  return CHARACTER_EXP_BOOKS.map((book, index) => ({
    materialKey: book.materialKey,
    name: book.name,
    expValue: book.expValue,
    quantity: quantities[index] ?? 0,
    totalExp: (quantities[index] ?? 0) * book.expValue,
  }));
}
