import type { TalentLevels } from "../services/CharacterRequirementService.js";
import { ResinPlanService, type ResinPlanInput, type ResinPlanResult } from "../services/ResinPlanService.js";
import type { PlanPreferences } from "../preferences/PlanPreferences.js";

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
      ensurePreferences(options).crafting = { ...(ensurePreferences(options).crafting ?? {}), useCrafting: true };
    } else if (arg === "--allow-dust-of-azoth") {
      options.input.allowDustOfAzoth = true;
      ensurePreferences(options).crafting = { ...(ensurePreferences(options).crafting ?? {}), allowDustOfAzoth: true };
    } else if (arg === "--allow-dream-solvent") {
      options.input.allowDreamSolvent = true;
      ensurePreferences(options).crafting = { ...(ensurePreferences(options).crafting ?? {}), allowDreamSolvent: true };
    } else if (arg === "--no-manual-overrides") {
      options.input.includeManualOverrides = false;
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
      ensurePreferences(options).startDate = options.input.startDate;
    } else if (arg === "--days") {
      options.input.days = readNumber(args, ++index, arg);
      ensurePreferences(options).days = options.input.days;
    } else if (arg === "--daily-resin") {
      options.input.dailyResinBudget = readNumber(args, ++index, arg);
      ensurePreferences(options).dailyResinBudget = options.input.dailyResinBudget;
    } else if (arg === "--current-resin") {
      options.input.currentResin = readNumber(args, ++index, arg);
      ensurePreferences(options).currentResin = options.input.currentResin;
    } else if (arg === "--use-current-resin") {
      options.input.useCurrentResinOnFirstDay = true;
      ensurePreferences(options).useCurrentResinOnFirstDay = true;
    } else if (arg === "--discounted-weekly-boss-claims-used") {
      options.input.discountedWeeklyBossClaimsUsed = readNumber(args, ++index, arg);
      ensurePreferences(options).weeklyBosses = {
        ...(ensurePreferences(options).weeklyBosses ?? {}),
        discountedClaimsUsedThisWeek: options.input.discountedWeeklyBossClaimsUsed,
      };
    } else if (arg === "--plan-style") {
      ensurePreferences(options).planStyle = readString(args, ++index, arg) as PlanPreferences["planStyle"];
    } else if (arg === "--blocked-days") {
      ensurePreferences(options).availability = {
        ...(ensurePreferences(options).availability ?? {}),
        blockedDaysOfWeek: readList(args, ++index, arg),
      };
    } else if (arg === "--blocked-dates") {
      ensurePreferences(options).availability = {
        ...(ensurePreferences(options).availability ?? {}),
        blockedDates: readList(args, ++index, arg),
      };
    } else if (arg === "--preferred-days") {
      ensurePreferences(options).availability = {
        ...(ensurePreferences(options).availability ?? {}),
        preferredDaysOfWeek: readList(args, ++index, arg),
      };
    } else if (arg === "--allow-fragile-resin") {
      ensurePreferences(options).fragileResin = {
        ...(ensurePreferences(options).fragileResin ?? { allowed: true }),
        allowed: true,
      };
    } else if (arg === "--max-fragile-resin") {
      ensurePreferences(options).fragileResin = {
        ...(ensurePreferences(options).fragileResin ?? { allowed: true }),
        allowed: true,
        maxToUse: readNumber(args, ++index, arg),
      };
    } else if (arg === "--already-claimed-weekly-bosses") {
      ensurePreferences(options).weeklyBosses = {
        ...(ensurePreferences(options).weeklyBosses ?? {}),
        alreadyClaimedSourceKeys: readList(args, ++index, arg),
      };
    } else if (arg === "--exclude-source-types") {
      ensurePreferences(options).sourceFilters = {
        ...(ensurePreferences(options).sourceFilters ?? {}),
        excludedSourceTypes: readList(args, ++index, arg),
      };
    } else if (arg === "--exclude-source-keys") {
      ensurePreferences(options).sourceFilters = {
        ...(ensurePreferences(options).sourceFilters ?? {}),
        excludedSourceKeys: readList(args, ++index, arg),
      };
    } else if (arg === "--exclude-materials") {
      ensurePreferences(options).manualTaskExclusions = readList(args, ++index, arg).map((materialKey) => ({
        materialKey,
        reason: "Excluded by CLI preference",
      }));
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

function ensurePreferences(options: CliOptions): PlanPreferences {
  options.input.preferences ??= {};
  return options.input.preferences;
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

function readList(args: string[], index: number, option: string): string[] {
  return readString(args, index, option)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
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
  console.log(`Manual overrides applied: ${result.inventoryDiff.overridesApplied ?? 0}`);
  console.log(
    `Goal: level ${result.goal.currentLevel}->${result.goal.targetLevel}; talents normal ${result.goal.currentTalents.normal}->${result.goal.targetTalents.normal}, skill ${result.goal.currentTalents.skill}->${result.goal.targetTalents.skill}, burst ${result.goal.currentTalents.burst}->${result.goal.targetTalents.burst}`,
  );
  console.log(
    `Missing materials: ${result.summary.totalMissingMaterials}; scheduled resin: ${result.summary.scheduledEstimatedResin}; unscheduled resin tasks: ${result.summary.unscheduledResinTasks}`,
  );
  console.log(`Plan style: ${result.preferencesApplied.planStyle}`);
  console.log(`Fragile resin used: ${result.fragileResinUsed.used} (${result.fragileResinUsed.resinAdded} resin)`);
  console.log(`Excluded tasks: ${result.excludedTasks.length}`);
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
  printExcludedTasks(result.excludedTasks);

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function printExcludedTasks(tasks: ResinPlanResult["excludedTasks"]): void {
  if (tasks.length === 0) {
    return;
  }
  console.log("Excluded tasks:");
  for (const task of tasks) {
    console.log(`- ${task.groupKey ?? task.materialKey ?? task.sourceKey ?? task.sourceType}: ${task.reason}`);
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
