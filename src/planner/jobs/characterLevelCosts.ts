import { CharacterLevelCostService, type ExpBookStrategy } from "../services/CharacterLevelCostService.js";

interface CliOptions {
  currentLevel: number;
  targetLevel: number;
  strategy?: ExpBookStrategy;
  json: boolean;
}

function readNumber(args: string[], index: number, option: string): number {
  const value = Number(args[index + 1]);

  if (!Number.isFinite(value)) {
    throw new Error(`Missing or invalid number for ${option}`);
  }

  return value;
}

function parseOptions(args: string[]): CliOptions {
  let currentLevel: number | undefined;
  let targetLevel: number | undefined;
  let strategy: ExpBookStrategy | undefined;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--current-level") {
      currentLevel = readNumber(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--target-level") {
      targetLevel = readNumber(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--strategy") {
      const value = args[index + 1];

      if (value !== "minimal_waste" && value !== "hero_wit_first") {
        throw new Error("--strategy must be minimal_waste or hero_wit_first");
      }

      strategy = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (currentLevel === undefined || targetLevel === undefined) {
    throw new Error("Usage: npm run costs:level -- --current-level 20 --target-level 90 [--strategy minimal_waste] [--json]");
  }

  return {
    currentLevel,
    targetLevel,
    strategy,
    json,
  };
}

function printReadable(result: ReturnType<CharacterLevelCostService["calculate"]>): void {
  console.log(`Character level costs: ${result.currentLevel}->${result.targetLevel}`);
  console.log(`Total EXP: ${result.totalExp}`);
  console.log(`Level-up Mora: ${result.levelUpMora}`);
  console.log(`Overflow EXP: ${result.overflowExp}`);
  console.log("EXP books:");

  for (const book of result.expBooks) {
    console.log(`- ${book.name} (${book.materialKey}): ${book.quantity}`);
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");

    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

try {
  const options = parseOptions(process.argv.slice(2));
  const service = new CharacterLevelCostService();
  const result = service.calculate({
    currentLevel: options.currentLevel,
    targetLevel: options.targetLevel,
    expBookStrategy: options.strategy,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReadable(result);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
