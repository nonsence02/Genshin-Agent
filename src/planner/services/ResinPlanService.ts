import { ResinPolicy } from "../policies/ResinPolicy.js";
import { WeeklyBossPolicy } from "../policies/WeeklyBossPolicy.js";
import type { TalentLevels } from "./CharacterRequirementService.js";
import { FarmTaskBuilder, type FarmTask, type FarmTaskPlan } from "./FarmTaskBuilder.js";
import { FarmTaskGroupingService, type FarmSourceGroup, type FarmSourceGroupPlan } from "./FarmTaskGroupingService.js";
import { InventoryDiffService, type CharacterInventoryDiffResult, type CharacterInventoryDiffInput } from "./InventoryDiffService.js";

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
  plannedResin: number;
  tasks: ScheduledResinTask[];
  notes: string[];
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
  ) {}

  async plan(input: ResinPlanInput): Promise<ResinPlanResult> {
    validateInput(input);

    const inventoryDiff = await this.inventoryDiff.diffCharacter(toDiffInput(input));
    const farmTasks = await this.taskBuilder.build(inventoryDiff);
    const sourceGroupPlan = this.taskGrouping.group(farmTasks);
    const days = buildPlanDays(input, this.resinPolicy);
    const warnings = [...sourceGroupPlan.warnings];
    const remainingGroups = [...sourceGroupPlan.resinGroups].sort(compareResinGroups).map((group) => ({
      group,
      remainingRuns: group.estimatedRuns ?? null,
      placeholderScheduled: false,
    }));
    const weeklyBossesScheduledThisWeek = new Set<string>();
    let discountedWeeklyBossClaimsUsed = input.discountedWeeklyBossClaimsUsed ?? 0;

    for (const day of days) {
      for (const remaining of remainingGroups) {
        if (!canScheduleOnDay(remaining.group, day.dayOfWeek)) {
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
      sourceGroups: sourceGroupPlan.allGroups,
      schedule: days,
      openWorldTasks: input.includeOpenWorld === false ? [] : farmTasks.openWorldTasks,
      unknownTasks: farmTasks.unknownTasks,
      openWorldGroups: input.includeOpenWorld === false ? [] : sourceGroupPlan.openWorldGroups,
      unknownGroups: sourceGroupPlan.unknownGroups,
      summary: {
        totalMissingMaterials: inventoryDiff.summary.missingMaterials,
        totalEstimatedResin,
        scheduledEstimatedResin,
        unscheduledResinTasks: remainingGroups.filter((item) =>
          item.remainingRuns === null ? !item.placeholderScheduled : item.remainingRuns > 0,
        ).length,
        openWorldTasks: input.includeOpenWorld === false ? 0 : sourceGroupPlan.openWorldGroups.length,
        unknownTasks: sourceGroupPlan.unknownGroups.length,
      },
      warnings: [...new Set(warnings)],
    };
  }
}

function toDiffInput(input: ResinPlanInput): CharacterInventoryDiffInput {
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
    useCrafting: input.useCrafting,
    allowDustOfAzoth: input.allowDustOfAzoth,
    allowDreamSolvent: input.allowDreamSolvent,
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

function buildPlanDays(input: ResinPlanInput, resinPolicy: ResinPolicy): ResinPlanDay[] {
  const startDate = parseStartDate(input.startDate);
  const dayCount = input.days ?? 7;
  const dailyBudget = input.dailyResinBudget ?? resinPolicy.config.naturalResinPerDay;

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    const resinBudget =
      index === 0 && input.currentResin !== undefined
        ? Math.min(resinPolicy.config.resinCap, dailyBudget + input.currentResin)
        : dailyBudget;

    return {
      date: formatDate(date),
      dayOfWeek: DAY_NAMES[date.getDay()],
      resinBudget,
      plannedResin: 0,
      tasks: [],
      notes:
        index === 0 && input.currentResin !== undefined
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

function compareResinGroups(left: FarmSourceGroup, right: FarmSourceGroup): number {
  return (
    resinGroupRank(left) - resinGroupRank(right) ||
    left.groupKey.localeCompare(right.groupKey) ||
    left.sourceType.localeCompare(right.sourceType)
  );
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
