import { ResinPolicy } from "../policies/ResinPolicy.js";
import { WeeklyBossPolicy } from "../policies/WeeklyBossPolicy.js";
import type { PlanPreferences, PlanPreferencesResolved } from "../preferences/PlanPreferences.js";
import type { TalentLevels } from "./CharacterRequirementService.js";
import { FarmTaskBuilder, type FarmTask, type FarmTaskPlan } from "./FarmTaskBuilder.js";
import { FarmTaskGroupingService, type FarmSourceGroup, type FarmSourceGroupPlan } from "./FarmTaskGroupingService.js";
import { InventoryDiffService, type CharacterInventoryDiffResult, type CharacterInventoryDiffInput } from "./InventoryDiffService.js";
import { PlanPreferenceResolver } from "./PlanPreferenceResolver.js";

export interface ResinPlanInput {
  playerKey: string;
  characterKey: string;
  inventorySnapshotId?: number;
  usePlayerState?: boolean;
  currentLevel?: number;
  targetLevel: number;
  currentAscensionPhase?: number;
  targetAscensionPhase?: number;
  currentTalents?: TalentLevels;
  targetTalents?: TalentLevels;
  startDate?: string;
  days?: number;
  dailyResinBudget?: number;
  currentResin?: number;
  includeOpenWorld?: boolean;
  discountedWeeklyBossClaimsUsed?: number;
  useCrafting?: boolean;
  allowDustOfAzoth?: boolean;
  allowDreamSolvent?: boolean;
  includeManualOverrides?: boolean;
  planStyle?: PlanPreferences["planStyle"];
  useCurrentResinOnFirstDay?: boolean;
  preferences?: PlanPreferences;
}

export interface ScheduledResinTask {
  taskType: string;
  groupKey?: string;
  materialKey: string;
  materialName: string;
  primaryMaterialKey?: string;
  primaryMaterialName?: string;
  sourceType: string;
  sourceName?: string;
  materials?: Array<{
    materialKey: string;
    materialName: string;
    missing: number;
    role: "primary" | "secondary" | "unknown";
  }>;
  runs?: number | null;
  resin?: number | null;
  reason: string;
  estimated: boolean;
  warnings: string[];
}

export interface ResinPlanDay {
  date: string;
  dayOfWeek: string;
  resinBudget: number;
  resinBudgetBase: number;
  resinBudgetEffective: number;
  plannedResin: number;
  blocked: boolean;
  fragileResinUsed: number;
  tasks: ScheduledResinTask[];
  notes: string[];
}

export interface ExcludedPlannerTask {
  groupKey?: string;
  materialKey?: string;
  sourceType?: string;
  sourceKey?: string;
  reason: string;
}

export interface ResinPlanResult {
  goal: CharacterInventoryDiffResult["goal"] & {
    playerKey: string;
    characterKey: string;
  };
  inventoryDiff: CharacterInventoryDiffResult;
  farmTasks: FarmTaskPlan;
  sourceGroups: FarmSourceGroup[];
  schedule: ResinPlanDay[];
  openWorldTasks: FarmTask[];
  unknownTasks: FarmTask[];
  openWorldGroups: FarmSourceGroup[];
  unknownGroups: FarmSourceGroup[];
  preferencesApplied: PlanPreferencesResolved;
  excludedTasks: ExcludedPlannerTask[];
  fragileResinUsed: {
    used: number;
    resinAdded: number;
  };
  summary: {
    totalMissingMaterials: number;
    totalEstimatedResin: number | null;
    scheduledEstimatedResin: number;
    unscheduledResinTasks: number;
    openWorldTasks: number;
    unknownTasks: number;
  };
  warnings: string[];
}

interface RemainingTask {
  group: FarmSourceGroup;
  remainingRuns: number | null;
  placeholderScheduled: boolean;
}

export interface ResinPlanInventoryDiffService {
  diffCharacter(input: CharacterInventoryDiffInput): Promise<CharacterInventoryDiffResult>;
}

export interface ResinPlanFarmTaskBuilder {
  build(diff: CharacterInventoryDiffResult): Promise<FarmTaskPlan>;
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const WEEKLY_BOSS_SOURCE_TYPES = new Set(["weekly_boss", "trounce_domain"]);

export class ResinPlanService {
  constructor(
    private readonly inventoryDiff: ResinPlanInventoryDiffService = new InventoryDiffService(),
    private readonly taskBuilder: ResinPlanFarmTaskBuilder = new FarmTaskBuilder(),
    private readonly taskGrouping = new FarmTaskGroupingService(),
    private readonly resinPolicy = new ResinPolicy(),
    private readonly weeklyBossPolicy = new WeeklyBossPolicy(),
    private readonly preferenceResolver = new PlanPreferenceResolver(),
  ) {}

  async plan(input: ResinPlanInput): Promise<ResinPlanResult> {
    validateInput(input);
    const preferences = this.preferenceResolver.resolve(input);

    const inventoryDiff = await this.inventoryDiff.diffCharacter(toDiffInput(input, preferences));
    const farmTasks = await this.taskBuilder.build(inventoryDiff);
    const sourceGroupPlan = this.taskGrouping.group(farmTasks);
    const days = buildPlanDays(preferences, this.resinPolicy);
    const excludedTasks: ExcludedPlannerTask[] = [];
    const warnings = [...sourceGroupPlan.warnings, ...preferences.warnings];
    const excludedGroupKeys = new Set<string>();
    const filteredAllGroups = filterSourceGroups(sourceGroupPlan.allGroups, preferences, excludedTasks, warnings, excludedGroupKeys);
    const filteredGroups = sourceGroupPlan.resinGroups.filter((group) => !excludedGroupKeys.has(group.groupKey));
    const filteredOpenWorldGroups = sourceGroupPlan.openWorldGroups.filter((group) => !excludedGroupKeys.has(group.groupKey));
    const filteredUnknownGroups = sourceGroupPlan.unknownGroups.filter((group) => !excludedGroupKeys.has(group.groupKey));
    const filteredOpenWorldTasks = farmTasks.openWorldTasks.filter((task) => !isTaskExcluded(task, preferences));
    const filteredUnknownTasks = farmTasks.unknownTasks.filter((task) => !isTaskExcluded(task, preferences));
    const remainingGroups = filteredGroups.sort((left, right) => compareResinGroups(left, right, preferences)).map((group) => ({
      group,
      remainingRuns: group.estimatedRuns ?? null,
      placeholderScheduled: false,
    }));
    const weeklyBossesScheduledThisWeek = new Set<string>();
    let discountedWeeklyBossClaimsUsed = preferences.weeklyBosses.discountedClaimsUsedThisWeek;
    let remainingFragileResin = preferences.fragileResin.allowed
      ? preferences.fragileResin.maxToUse * preferences.fragileResin.resinPerFragile
      : 0;
    let fragileResinAdded = 0;
    if (preferences.fragileResin.allowed && remainingFragileResin > 0) {
      warnings.push("Fragile resin is applied greedily in v1: at most one configured fragile resin unit is added to each eligible early day.");
    }

    for (const day of days) {
      if (day.blocked) {
        warnings.push(`${day.date} ${day.dayOfWeek} is blocked by plan preferences.`);
        continue;
      }

      if (preferences.fragileResin.allowed && remainingFragileResin > 0 && remainingGroups.some(groupHasRemaining)) {
        const added = Math.min(remainingFragileResin, preferences.fragileResin.resinPerFragile);
        day.resinBudget += added;
        day.resinBudgetEffective += added;
        day.fragileResinUsed += added;
        remainingFragileResin -= added;
        fragileResinAdded += added;
      }

      for (const remaining of remainingGroups) {
        if (!canScheduleOnDay(remaining.group, day.dayOfWeek)) {
          continue;
        }

        if (shouldSkipWeeklyBoss(remaining.group, preferences, excludedTasks, warnings)) {
          remaining.placeholderScheduled = true;
          continue;
        }

        if (remaining.group.weeklyBoss || WEEKLY_BOSS_SOURCE_TYPES.has(remaining.group.sourceType)) {
          const scheduled = scheduleWeeklyBossTask(
            remaining,
            day,
            this.weeklyBossPolicy,
            discountedWeeklyBossClaimsUsed,
            weeklyBossesScheduledThisWeek,
            warnings,
          );
          discountedWeeklyBossClaimsUsed += scheduled.discountedClaimsApplied;
          continue;
        }

        if (remaining.remainingRuns === null) {
          schedulePlaceholderTask(remaining, day, warnings);
          continue;
        }

        scheduleEstimatedRuns(remaining, day);
      }
    }

    for (const remaining of remainingGroups) {
      if (remaining.remainingRuns === null && !remaining.placeholderScheduled) {
        warnings.push(`No placeholder could be scheduled for ${remaining.group.groupKey}; resin budget or calendar did not allow it.`);
      } else if (remaining.remainingRuns !== null && remaining.remainingRuns > 0) {
        warnings.push(`${remaining.group.groupKey} has ${remaining.remainingRuns} estimated runs left after the plan window.`);
      }
    }

    const totalEstimatedResin = sourceGroupPlan.resinGroups.some((group) => group.estimatedResin === null || group.estimatedResin === undefined)
      ? null
      : sourceGroupPlan.resinGroups.reduce((sum, group) => sum + (group.estimatedResin ?? 0), 0);
    const scheduledEstimatedResin = days.reduce((sum, day) => sum + day.plannedResin, 0);

    return {
      goal: {
        ...inventoryDiff.goal,
        playerKey: input.playerKey,
        characterKey: input.characterKey,
      },
      inventoryDiff,
      farmTasks,
      sourceGroups: filteredAllGroups,
      schedule: days,
      openWorldTasks: input.includeOpenWorld === false ? [] : filteredOpenWorldTasks,
      unknownTasks: filteredUnknownTasks,
      openWorldGroups: input.includeOpenWorld === false ? [] : filteredOpenWorldGroups,
      unknownGroups: filteredUnknownGroups,
      preferencesApplied: preferences,
      excludedTasks,
      fragileResinUsed: {
        used: Math.ceil(fragileResinAdded / preferences.fragileResin.resinPerFragile),
        resinAdded: fragileResinAdded,
      },
      summary: {
        totalMissingMaterials: inventoryDiff.summary.missingMaterials,
        totalEstimatedResin,
        scheduledEstimatedResin,
        unscheduledResinTasks: remainingGroups.filter((item) =>
          item.remainingRuns === null ? !item.placeholderScheduled : item.remainingRuns > 0,
        ).length,
        openWorldTasks: input.includeOpenWorld === false ? 0 : filteredOpenWorldGroups.length,
        unknownTasks: filteredUnknownGroups.length,
      },
      warnings: [...new Set(warnings)],
    };
  }
}

function toDiffInput(input: ResinPlanInput, preferences: PlanPreferencesResolved): CharacterInventoryDiffInput {
  return {
    playerKey: input.playerKey,
    characterKey: input.characterKey,
    inventorySnapshotId: input.inventorySnapshotId,
    usePlayerState: input.usePlayerState,
    currentLevel: input.currentLevel,
    targetLevel: input.targetLevel,
    currentAscensionPhase: input.currentAscensionPhase,
    targetAscensionPhase: input.targetAscensionPhase,
    currentTalents: input.currentTalents,
    targetTalents: input.targetTalents,
    useCrafting: preferences.crafting.useCrafting,
    allowDustOfAzoth: preferences.crafting.allowDustOfAzoth,
    allowDreamSolvent: preferences.crafting.allowDreamSolvent,
    includeManualOverrides: input.includeManualOverrides,
  };
}

function validateInput(input: ResinPlanInput): void {
  if (!input.playerKey.trim()) {
    throw new Error("playerKey is required");
  }
  if (!input.characterKey.trim()) {
    throw new Error("characterKey is required");
  }
  if (!Number.isInteger(input.targetLevel)) {
    throw new Error("targetLevel is required");
  }
  if (input.days !== undefined && (!Number.isInteger(input.days) || input.days < 1)) {
    throw new Error("days must be a positive integer");
  }
  if (input.dailyResinBudget !== undefined && (!Number.isFinite(input.dailyResinBudget) || input.dailyResinBudget < 0)) {
    throw new Error("dailyResinBudget must be a non-negative number");
  }
  if (input.currentResin !== undefined && (!Number.isFinite(input.currentResin) || input.currentResin < 0)) {
    throw new Error("currentResin must be a non-negative number");
  }
}

function buildPlanDays(preferences: PlanPreferencesResolved, resinPolicy: ResinPolicy): ResinPlanDay[] {
  const startDate = parseStartDate(preferences.startDate);
  const dayCount = preferences.days;
  const dailyBudget = preferences.dailyResinBudget ?? resinPolicy.config.naturalResinPerDay;

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const dateKey = formatDate(date);
    const dayOfWeek = DAY_NAMES[date.getDay()];
    const blocked = preferences.availability.blockedDaysOfWeek.includes(dayOfWeek) || preferences.availability.blockedDates.includes(dateKey);
    const cappedDailyBudget = Math.min(
      dailyBudget,
      preferences.availability.maxResinByDate[dateKey] ?? Number.POSITIVE_INFINITY,
      preferences.availability.maxResinByDayOfWeek[dayOfWeek] ?? Number.POSITIVE_INFINITY,
    );
    const resinBudgetBase =
      index === 0 && preferences.useCurrentResinOnFirstDay && preferences.currentResin !== undefined
        ? Math.min(resinPolicy.config.resinCap, cappedDailyBudget + preferences.currentResin)
        : cappedDailyBudget;
    const resinBudget = blocked ? 0 : resinBudgetBase;

    return {
      date: dateKey,
      dayOfWeek,
      resinBudget,
      resinBudgetBase,
      resinBudgetEffective: resinBudget,
      plannedResin: 0,
      blocked,
      fragileResinUsed: 0,
      tasks: [],
      notes:
        index === 0 && preferences.useCurrentResinOnFirstDay && preferences.currentResin !== undefined
          ? [`First day budget includes currentResin and is capped at ${resinPolicy.config.resinCap}.`]
          : [],
    };
  });
}

function parseStartDate(value: string | undefined): Date {
  if (!value) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("startDate must use YYYY-MM-DD");
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function canScheduleOnDay(group: FarmSourceGroup, dayOfWeek: string): boolean {
  return group.calendarDays.length === 0 || group.calendarDays.includes(dayOfWeek);
}

function filterSourceGroups(
  groups: FarmSourceGroup[],
  preferences: PlanPreferencesResolved,
  excludedTasks: ExcludedPlannerTask[],
  warnings: string[],
  excludedGroupKeys: Set<string> = new Set<string>(),
): FarmSourceGroup[] {
  return groups.filter((group) => {
    const reason = exclusionReason(group, preferences);

    if (!reason) {
      return true;
    }

    excludedTasks.push({
      groupKey: group.groupKey,
      materialKey: group.primaryMaterialKey,
      sourceType: group.sourceType,
      sourceKey: group.sourceKey,
      reason,
    });
    excludedGroupKeys.add(group.groupKey);
    warnings.push(`Excluded ${group.groupKey}: ${reason}`);
    return false;
  });
}

function isTaskExcluded(task: FarmTask, preferences: PlanPreferencesResolved): boolean {
  if (preferences.sourceFilters.excludedSourceTypes.includes(task.sourceType)) {
    return true;
  }
  if (task.sourceKey && preferences.sourceFilters.excludedSourceKeys.includes(task.sourceKey)) {
    return true;
  }
  return preferences.manualTaskExclusions.some((exclusion) =>
    (!exclusion.materialKey || task.materialKey === exclusion.materialKey) &&
    (!exclusion.sourceKey || task.sourceKey === exclusion.sourceKey) &&
    (!exclusion.sourceType || task.sourceType === exclusion.sourceType),
  );
}

function exclusionReason(group: FarmSourceGroup, preferences: PlanPreferencesResolved): string | null {
  if (preferences.sourceFilters.excludedSourceTypes.includes(group.sourceType)) {
    return `source type ${group.sourceType} is excluded`;
  }
  if (group.sourceKey && preferences.sourceFilters.excludedSourceKeys.includes(group.sourceKey)) {
    return `source key ${group.sourceKey} is excluded`;
  }

  for (const exclusion of preferences.manualTaskExclusions) {
    const materialMatches = !exclusion.materialKey || group.materials.some((material) => material.materialKey === exclusion.materialKey);
    const sourceKeyMatches = !exclusion.sourceKey || group.sourceKey === exclusion.sourceKey;
    const sourceTypeMatches = !exclusion.sourceType || group.sourceType === exclusion.sourceType;
    if (materialMatches && sourceKeyMatches && sourceTypeMatches) {
      return exclusion.reason ?? "manual task exclusion";
    }
  }

  return null;
}

function shouldSkipWeeklyBoss(
  group: FarmSourceGroup,
  preferences: PlanPreferencesResolved,
  excludedTasks: ExcludedPlannerTask[],
  warnings: string[],
): boolean {
  if (!group.weeklyBoss && !WEEKLY_BOSS_SOURCE_TYPES.has(group.sourceType)) {
    return false;
  }

  const sourceKey = group.sourceKey ?? group.groupKey;
  const blocked = preferences.weeklyBosses.blockedWeeklyBossSourceKeys.includes(sourceKey);
  const claimed = preferences.weeklyBosses.alreadyClaimedSourceKeys.includes(sourceKey);
  if (!blocked && !claimed) {
    return false;
  }

  const reason = blocked ? `weekly boss ${sourceKey} is blocked` : `weekly boss ${sourceKey} already claimed`;
  excludedTasks.push({
    groupKey: group.groupKey,
    materialKey: group.primaryMaterialKey,
    sourceType: group.sourceType,
    sourceKey,
    reason,
  });
  warnings.push(`Skipped ${group.groupKey}: ${reason}`);
  return true;
}

function groupHasRemaining(remaining: RemainingTask): boolean {
  return remaining.remainingRuns === null ? !remaining.placeholderScheduled : remaining.remainingRuns > 0;
}

function compareResinGroups(left: FarmSourceGroup, right: FarmSourceGroup, preferences?: PlanPreferencesResolved): number {
  const preferred = comparePreferredSourceTypes(left, right, preferences);
  if (preferred !== 0) {
    return preferred;
  }

  return (
    resinGroupRank(left) - resinGroupRank(right) ||
    left.groupKey.localeCompare(right.groupKey) ||
    left.sourceType.localeCompare(right.sourceType)
  );
}

function comparePreferredSourceTypes(left: FarmSourceGroup, right: FarmSourceGroup, preferences: PlanPreferencesResolved | undefined): number {
  const preferred = preferences?.sourceFilters.preferSourceTypes ?? [];
  if (preferred.length === 0) {
    return 0;
  }
  const leftIndex = preferred.indexOf(left.sourceType);
  const rightIndex = preferred.indexOf(right.sourceType);
  const leftRank = leftIndex === -1 ? preferred.length + 1 : leftIndex;
  const rightRank = rightIndex === -1 ? preferred.length + 1 : rightIndex;
  return leftRank - rightRank;
}

function resinGroupRank(group: FarmSourceGroup): number {
  if (group.weeklyBoss || WEEKLY_BOSS_SOURCE_TYPES.has(group.sourceType)) {
    return 0;
  }
  if (group.sourceType === "boss" || group.sourceType === "normal_boss") {
    return 1;
  }
  if (group.sourceType.includes("domain")) {
    return 2;
  }
  if (group.sourceType === "ley_line") {
    return 3;
  }
  return 9;
}

function availableResin(day: ResinPlanDay): number {
  return Math.max(0, day.resinBudget - day.plannedResin);
}

function scheduleEstimatedRuns(remaining: RemainingTask, day: ResinPlanDay): void {
  if (remaining.remainingRuns === null || remaining.remainingRuns <= 0) {
    return;
  }

  const cost = remaining.group.resinCostPerRun ?? 0;
  if (cost <= 0) {
    return;
  }

  const runs = Math.min(remaining.remainingRuns, Math.floor(availableResin(day) / cost));
  if (runs <= 0) {
    return;
  }

  const resin = runs * cost;
  remaining.remainingRuns -= runs;
  day.plannedResin += resin;
  day.tasks.push({
    taskType: "estimated_runs",
    groupKey: remaining.group.groupKey,
    materialKey: remaining.group.primaryMaterialKey ?? remaining.group.groupKey,
    materialName: remaining.group.primaryMaterialName ?? remaining.group.groupKey,
    primaryMaterialKey: remaining.group.primaryMaterialKey,
    primaryMaterialName: remaining.group.primaryMaterialName,
    sourceType: remaining.group.sourceType,
    sourceName: remaining.group.sourceName,
    materials: scheduledMaterials(remaining.group),
    runs,
    resin,
    reason: "Scheduled rough estimated runs within daily resin budget.",
    estimated: true,
    warnings: remaining.group.warnings,
  });
}

function schedulePlaceholderTask(remaining: RemainingTask, day: ResinPlanDay, warnings: string[]): void {
  if (remaining.placeholderScheduled) {
    return;
  }

  const cost = remaining.group.resinCostPerRun ?? 0;
  if (cost <= 0 || availableResin(day) < cost) {
    return;
  }

  remaining.placeholderScheduled = true;
  day.plannedResin += cost;
  day.tasks.push({
    taskType: "placeholder",
    groupKey: remaining.group.groupKey,
    materialKey: remaining.group.primaryMaterialKey ?? remaining.group.groupKey,
    materialName: remaining.group.primaryMaterialName ?? remaining.group.groupKey,
    primaryMaterialKey: remaining.group.primaryMaterialKey,
    primaryMaterialName: remaining.group.primaryMaterialName,
    sourceType: remaining.group.sourceType,
    sourceName: remaining.group.sourceName,
    materials: scheduledMaterials(remaining.group),
    runs: null,
    resin: cost,
    reason: "One placeholder run scheduled because no reliable drop model exists yet.",
    estimated: true,
    warnings: remaining.group.warnings,
  });
  warnings.push(`Scheduled placeholder for ${remaining.group.groupKey}; exact run count is unknown.`);
}

function scheduleWeeklyBossTask(
  remaining: RemainingTask,
  day: ResinPlanDay,
  weeklyBossPolicy: WeeklyBossPolicy,
  discountedClaimsUsedThisWeek: number,
  weeklyBossesScheduledThisWeek: Set<string>,
  warnings: string[],
): { discountedClaimsApplied: number } {
  if (remaining.placeholderScheduled) {
    return { discountedClaimsApplied: 0 };
  }

  const sourceIdentity = remaining.group.sourceKey ?? remaining.group.groupKey;
  if (weeklyBossesScheduledThisWeek.has(sourceIdentity)) {
    return { discountedClaimsApplied: 0 };
  }

  const cost = weeklyBossPolicy.calculateCost({
    plannedClaims: 1,
    discountedClaimsUsedThisWeek,
  });
  const resin = cost.perClaimCosts[0] ?? 0;

  if (availableResin(day) < resin) {
    return { discountedClaimsApplied: 0 };
  }

  weeklyBossesScheduledThisWeek.add(sourceIdentity);
  remaining.placeholderScheduled = true;
  day.plannedResin += resin;
  day.tasks.push({
    taskType: "weekly_boss_claim",
    groupKey: remaining.group.groupKey,
    materialKey: remaining.group.primaryMaterialKey ?? remaining.group.groupKey,
    materialName: remaining.group.primaryMaterialName ?? remaining.group.groupKey,
    primaryMaterialKey: remaining.group.primaryMaterialKey,
    primaryMaterialName: remaining.group.primaryMaterialName,
    sourceType: remaining.group.sourceType,
    sourceName: remaining.group.sourceName,
    materials: scheduledMaterials(remaining.group),
    runs: 1,
    resin,
    reason: "Scheduled one weekly boss reward claim; each boss source is scheduled at most once per week in v1.",
    estimated: true,
    warnings: remaining.group.warnings,
  });
  warnings.push(`Weekly boss ${remaining.group.groupKey} scheduled as one cautious claim; exact drops are not estimated.`);

  return { discountedClaimsApplied: cost.discountedClaimsApplied };
}

function scheduledMaterials(group: FarmSourceGroup): ScheduledResinTask["materials"] {
  return group.materials.map((material) => ({
    materialKey: material.materialKey,
    materialName: material.materialName,
    missing: material.missing,
    role: material.role,
  }));
}
