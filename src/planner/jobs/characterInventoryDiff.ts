import { InventoryDiffService, type CharacterInventoryDiffResult } from "../services/InventoryDiffService.js";
import type { TalentLevels } from "../services/CharacterRequirementService.js";

interface CliOptions {
  playerKey?: string;
  characterKey?: string;
  inventorySnapshotId?: number;
  usePlayerState: boolean;
  currentLevel?: number;
  targetLevel?: number;
  currentAscensionPhase?: number;
  targetAscensionPhase?: number;
  currentTalents: TalentLevels;
  targetTalents: TalentLevels;
  json: boolean;
  onlyMissing: boolean;
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    usePlayerState: false,
    currentTalents: {},
    targetTalents: {},
    json: false,
    onlyMissing: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--only-missing") {
      options.onlyMissing = true;
    } else if (arg === "--use-player-state") {
      options.usePlayerState = true;
    } else if (arg === "--player") {
      options.playerKey = readString(args, ++index, arg);
    } else if (arg === "--character") {
      options.characterKey = readString(args, ++index, arg);
    } else if (arg === "--snapshot-id") {
      options.inventorySnapshotId = readNumber(args, ++index, arg);
    } else if (arg === "--current-level") {
      options.currentLevel = readNumber(args, ++index, arg);
    } else if (arg === "--target-level") {
      options.targetLevel = readNumber(args, ++index, arg);
    } else if (arg === "--current-ascension-phase") {
      options.currentAscensionPhase = readNumber(args, ++index, arg);
    } else if (arg === "--target-ascension-phase") {
      options.targetAscensionPhase = readNumber(args, ++index, arg);
    } else if (arg === "--current-normal") {
      options.currentTalents.normal = readNumber(args, ++index, arg);
    } else if (arg === "--current-skill") {
      options.currentTalents.skill = readNumber(args, ++index, arg);
    } else if (arg === "--current-burst") {
      options.currentTalents.burst = readNumber(args, ++index, arg);
    } else if (arg === "--normal") {
      options.targetTalents.normal = readNumber(args, ++index, arg);
    } else if (arg === "--skill") {
      options.targetTalents.skill = readNumber(args, ++index, arg);
    } else if (arg === "--burst") {
      options.targetTalents.burst = readNumber(args, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.playerKey || !options.characterKey || options.targetLevel === undefined) {
    throw new Error(
      "Usage: npm run diff:character -- --player default --character char_furina --target-level 90 [--current-level 20|--use-player-state] [--skill 9] [--burst 10]",
    );
  }

  return options;
}

function readString(args: string[], index: number, option: string): string {
  const value = args[index];

  if (!value) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function readNumber(args: string[], index: number, option: string): number {
  const value = Number(args[index]);

  if (!Number.isInteger(value)) {
    throw new Error(`${option} requires an integer`);
  }

  return value;
}

function compactTalents(talents: TalentLevels): TalentLevels | undefined {
  return Object.values(talents).some((value) => value !== undefined) ? talents : undefined;
}

function printReadable(result: CharacterInventoryDiffResult, onlyMissing: boolean): void {
  console.log(`${result.character.name} (${result.character.stableKey})`);
  console.log(`Player: ${result.player.stableKey}`);
  console.log(
    `Inventory snapshot: #${result.inventorySnapshot.id} ${result.inventorySnapshot.source} ${result.inventorySnapshot.createdAt}`,
  );
  console.log(
    `Goal: level ${result.goal.currentLevel}->${result.goal.targetLevel}; talents normal ${result.goal.currentTalents.normal}->${result.goal.targetTalents.normal}, skill ${result.goal.currentTalents.skill}->${result.goal.targetTalents.skill}, burst ${result.goal.currentTalents.burst}->${result.goal.targetTalents.burst}`,
  );
  console.log(
    `Summary: ${result.summary.satisfiedMaterials}/${result.summary.totalMaterials} satisfied, ${result.summary.missingMaterials} missing`,
  );

  const missing = result.materials.filter((material) => material.status === "missing");
  const satisfied = result.materials.filter((material) => material.status === "satisfied");

  printMaterials("Missing materials", missing);

  if (!onlyMissing) {
    printMaterials("Satisfied materials", satisfied);
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function printMaterials(label: string, materials: CharacterInventoryDiffResult["materials"]): void {
  console.log(`${label}:`);

  if (materials.length === 0) {
    console.log("- none");
    return;
  }

  for (const material of materials) {
    console.log(`- ${material.name} (${material.stableKey}): required ${material.required}, owned ${material.owned}, missing ${material.missing}`);
  }
}

try {
  const options = parseOptions(process.argv.slice(2));
  const service = new InventoryDiffService();

  service
    .diffCharacter({
      playerKey: options.playerKey!,
      characterKey: options.characterKey!,
      inventorySnapshotId: options.inventorySnapshotId,
      usePlayerState: options.usePlayerState,
      currentLevel: options.currentLevel,
      targetLevel: options.targetLevel!,
      currentAscensionPhase: options.currentAscensionPhase,
      targetAscensionPhase: options.targetAscensionPhase,
      currentTalents: compactTalents(options.currentTalents),
      targetTalents: compactTalents(options.targetTalents),
    })
    .then((result) => {
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printReadable(result, options.onlyMissing);
      }
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
