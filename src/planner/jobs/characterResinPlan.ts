import type { TalentLevels } from "../services/CharacterRequirementService.js";
import { ResinPlanService, type ResinPlanInput, type ResinPlanResult } from "../services/ResinPlanService.js";

interface CliOptions {
  input: Partial<ResinPlanInput>;
  currentTalents: TalentLevels;
  targetTalents: TalentLevels;
  json: boolean;
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    input: {},
    currentTalents: {},
    targetTalents: {},
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--use-player-state") {
      options.input.usePlayerState = true;
    } else if (arg === "--use-crafting") {
      options.input.useCrafting = true;
    } else if (arg === "--allow-dust-of-azoth") {
      options.input.allowDustOfAzoth = true;
    } else if (arg === "--allow-dream-solvent") {
      options.input.allowDreamSolvent = true;
    } else if (arg === "--player") {
      options.input.playerKey = readString(args, ++index, arg);
    } else if (arg === "--character") {
      options.input.characterKey = readString(args, ++index, arg);
    } else if (arg === "--snapshot-id") {
      options.input.inventorySnapshotId = readNumber(args, ++index, arg);
    } else if (arg === "--current-level") {
      options.input.currentLevel = readNumber(args, ++index, arg);
    } else if (arg === "--target-level") {
      options.input.targetLevel = readNumber(args, ++index, arg);
    } else if (arg === "--current-ascension-phase") {
      options.input.currentAscensionPhase = readNumber(args, ++index, arg);
    } else if (arg === "--target-ascension-phase") {
      options.input.targetAscensionPhase = readNumber(args, ++index, arg);
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
    } else if (arg === "--start-date") {
      options.input.startDate = readString(args, ++index, arg);
    } else if (arg === "--days") {
      options.input.days = readNumber(args, ++index, arg);
    } else if (arg === "--daily-resin") {
      options.input.dailyResinBudget = readNumber(args, ++index, arg);
    } else if (arg === "--current-resin") {
      options.input.currentResin = readNumber(args, ++index, arg);
    } else if (arg === "--discounted-weekly-boss-claims-used") {
      options.input.discountedWeeklyBossClaimsUsed = readNumber(args, ++index, arg);
    } else if (arg === "--only-missing") {
      continue;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.input.playerKey || !options.input.characterKey || options.input.targetLevel === undefined) {
    throw new Error(
      "Usage: npm run plan:character -- --player default --character char_furina --target-level 90 [--current-level 20|--use-player-state] [--skill 9] [--burst 10]",
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

function printReadable(result: ResinPlanResult): void {
  console.log(`${result.inventoryDiff.character.name} (${result.inventoryDiff.character.stableKey})`);
  console.log(`Player: ${result.inventoryDiff.player.stableKey}`);
  console.log(
    `Inventory snapshot: #${result.inventoryDiff.inventorySnapshot.id} ${result.inventoryDiff.inventorySnapshot.source} ${result.inventoryDiff.inventorySnapshot.createdAt}`,
  );
  console.log(
    `Goal: level ${result.goal.currentLevel}->${result.goal.targetLevel}; talents normal ${result.goal.currentTalents.normal}->${result.goal.targetTalents.normal}, skill ${result.goal.currentTalents.skill}->${result.goal.targetTalents.skill}, burst ${result.goal.currentTalents.burst}->${result.goal.targetTalents.burst}`,
  );
  console.log(
    `Missing materials: ${result.summary.totalMissingMaterials}; scheduled resin: ${result.summary.scheduledEstimatedResin}; unscheduled resin tasks: ${result.summary.unscheduledResinTasks}`,
  );
  console.log(`Source groups: ${result.sourceGroups.length}`);
  printActions("Crafting actions", result.inventoryDiff.craftingActions ?? []);
  printActions("Conversion actions", result.inventoryDiff.conversionActions ?? []);

  console.log("Daily resin schedule:");
  for (const day of result.schedule) {
    console.log(`- ${day.date} ${day.dayOfWeek}: ${day.plannedResin}/${day.resinBudget} resin`);

    if (day.tasks.length === 0) {
      console.log("  - none");
      continue;
    }

    for (const task of day.tasks) {
      console.log(
        `  - ${task.sourceType}${task.sourceName ? `:${task.sourceName}` : ""} [${task.groupKey ?? task.materialKey}]; primary=${task.primaryMaterialName ?? task.materialName}; runs=${task.runs ?? "unknown"} resin=${task.resin ?? "unknown"}; ${task.reason}`,
      );
      for (const material of task.materials ?? []) {
        console.log(`    - ${material.materialName} (${material.materialKey}): missing ${material.missing}, ${material.role}`);
      }
    }
  }

  printGroups("Open-world groups", result.openWorldGroups);
  printGroups("Unknown/event groups", result.unknownGroups);

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function printActions(label: string, actions: NonNullable<ResinPlanResult["inventoryDiff"]["craftingActions"]>): void {
  if (actions.length === 0) {
    return;
  }

  console.log(`${label}:`);
  for (const action of actions) {
    const catalyst = action.catalystMaterialKey ? `, catalyst ${action.catalystMaterialName ?? action.catalystMaterialKey} x${action.catalystQuantity}` : "";
    console.log(`- ${action.inputMaterialName} x${action.inputQuantity} -> ${action.outputMaterialName} x${action.outputQuantity}${catalyst}`);
  }
}

function printGroups(label: string, groups: ResinPlanResult["openWorldGroups"]): void {
  console.log(`${label}:`);

  if (groups.length === 0) {
    console.log("- none");
    return;
  }

  for (const group of groups) {
    const source = group.sourceName ?? group.sourceKey ?? group.sourceType;
    console.log(`- ${source} [${group.groupKey}]`);
    for (const material of group.materials) {
      console.log(`  - ${material.materialName} (${material.materialKey}): missing ${material.missing}, ${material.role}`);
    }
  }
}

try {
  const options = parseOptions(process.argv.slice(2));
  const service = new ResinPlanService();

  service
    .plan({
      ...(options.input as ResinPlanInput),
      currentTalents: compactTalents(options.currentTalents),
      targetTalents: compactTalents(options.targetTalents),
    })
    .then((result) => {
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printReadable(result);
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
