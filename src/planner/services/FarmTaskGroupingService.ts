import type { FarmTask, FarmTaskPlan } from "./FarmTaskBuilder.js";
import { RunEstimateService } from "./RunEstimateService.js";

export interface FarmSourceGroupMaterial {
  materialId: number;
  materialKey: string;
  materialName: string;
  missing: number;
  required?: number;
  owned?: number;
  sourceTypes: string[];
  role: "primary" | "secondary" | "unknown";
  notes: string[];
  warnings: string[];
}

export interface FarmSourceGroup {
  groupKey: string;
  sourceType: string;
  sourceKey?: string;
  sourceName?: string;
  primaryMaterialKey?: string;
  primaryMaterialName?: string;
  materials: FarmSourceGroupMaterial[];
  calendarDays: string[];
  resinCostPerRun?: number | null;
  estimatedRuns?: number | null;
  estimatedResin?: number | null;
  weeklyBoss?: boolean;
  openWorld?: boolean;
  warnings: string[];
}

export interface FarmSourceGroupPlan {
  resinGroups: FarmSourceGroup[];
  openWorldGroups: FarmSourceGroup[];
  unknownGroups: FarmSourceGroup[];
  allGroups: FarmSourceGroup[];
  warnings: string[];
}

const NORMAL_BOSS_SOURCE_TYPES = new Set(["boss", "normal_boss"]);
const DOMAIN_SOURCE_TYPES = new Set(["domain", "talent_domain", "weapon_domain", "artifact_domain"]);
const WEEKLY_BOSS_SOURCE_TYPES = new Set(["weekly_boss", "trounce_domain"]);
const LEY_LINE_SOURCE_TYPES = new Set(["ley_line"]);
const OPEN_WORLD_SOURCE_TYPES = new Set(["enemy", "local_specialty"]);
const GEM_KEYWORDS = [
  "sliver",
  "fragment",
  "chunk",
  "gemstone",
  "agnidus",
  "varunada",
  "vajrada",
  "vayuda",
  "shivada",
  "prithiva",
  "nagadus",
  "brilliant diamond",
];

interface MutableGroup {
  sourceType: string;
  sourceKey?: string;
  sourceName?: string;
  tasks: FarmTask[];
}

export class FarmTaskGroupingService {
  constructor(private readonly runEstimates = new RunEstimateService()) {}

  group(plan: FarmTaskPlan): FarmSourceGroupPlan {
    const warnings = plan.warnings.filter((warning) => !isElementalGemEstimateWarning(warning));
    const resinGroups = this.groupTasks(plan.resinTasks, "resin");
    const openWorldGroups = this.groupTasks(plan.openWorldTasks, "openWorld");
    const unknownGroups = this.groupTasks(plan.unknownTasks, "unknown");
    const allGroups = [...resinGroups, ...openWorldGroups, ...unknownGroups].sort(compareGroups);

    for (const group of allGroups) {
      warnings.push(...group.warnings);
    }

    return {
      resinGroups,
      openWorldGroups,
      unknownGroups,
      allGroups,
      warnings: [...new Set(warnings)],
    };
  }

  private groupTasks(tasks: FarmTask[], kind: "resin" | "openWorld" | "unknown"): FarmSourceGroup[] {
    const mutableGroups = new Map<string, MutableGroup>();

    for (const task of tasks) {
      const identity = sourceIdentityForTask(task, kind);
      const group = mutableGroups.get(identity.groupKey) ?? {
        sourceType: identity.sourceType,
        sourceKey: identity.sourceKey,
        sourceName: identity.sourceName,
        tasks: [],
      };
      group.tasks.push(task);
      mutableGroups.set(identity.groupKey, group);
    }

    reassignBossGemsToSpecificBossGroups(mutableGroups);

    return [...mutableGroups.entries()]
      .filter(([, group]) => group.tasks.length > 0)
      .map(([groupKey, group]) => this.finalizeGroup(groupKey, group))
      .sort(compareGroups);
  }

  private finalizeGroup(groupKey: string, group: MutableGroup): FarmSourceGroup {
    const primary = choosePrimaryTask(group.tasks);
    const materials = group.tasks
      .map((task) => ({
        materialId: task.materialId,
        materialKey: task.materialKey,
        materialName: task.materialName,
        missing: task.missing,
        required: task.required,
        owned: task.owned,
        sourceTypes: task.sourceTypes ?? [task.sourceType],
        role: task.materialKey === primary?.materialKey ? "primary" as const : materialRole(task, group.tasks),
        notes: task.notes,
        warnings: task.warnings,
      }))
      .sort((left, right) => roleRank(left.role) - roleRank(right.role) || left.materialKey.localeCompare(right.materialKey));
    const warnings = [...new Set(group.tasks.flatMap((task) => task.warnings).filter((warning) => !isElementalGemEstimateWarning(warning)))];
    const base: FarmSourceGroup = {
      groupKey,
      sourceType: group.sourceType,
      sourceKey: group.sourceKey,
      sourceName: group.sourceName,
      primaryMaterialKey: primary?.materialKey,
      primaryMaterialName: primary?.materialName,
      materials,
      calendarDays: mergeCalendarDays(group.tasks),
      resinCostPerRun: group.tasks.find((task) => task.resinCostPerRun !== undefined)?.resinCostPerRun ?? null,
      weeklyBoss: group.tasks.some((task) => task.weeklyBoss) || WEEKLY_BOSS_SOURCE_TYPES.has(group.sourceType),
      openWorld: group.tasks.some((task) => task.openWorld) || OPEN_WORLD_SOURCE_TYPES.has(group.sourceType),
      warnings,
    };

    applyGroupEstimate(base, primary, this.runEstimates);
    return base;
  }
}

function isElementalGemEstimateWarning(warning: string): boolean {
  const lower = warning.toLowerCase();
  return lower.startsWith("estimated ") && GEM_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function sourceIdentityForTask(task: FarmTask, kind: "resin" | "openWorld" | "unknown"): {
  groupKey: string;
  sourceType: string;
  sourceKey?: string;
  sourceName?: string;
} {
  const sourceType = task.sourceType;

  if (sourceType === "local_specialty" && !task.sourceKey) {
    return {
      groupKey: `${sourceType}:material:${task.materialKey}`,
      sourceType,
      sourceKey: task.sourceKey,
      sourceName: task.sourceName,
    };
  }

  if (sourceType === "ley_line") {
    const key = task.sourceKey ?? inferLeyLineKey(task);
    return {
      groupKey: `ley_line:${key}`,
      sourceType,
      sourceKey: key,
      sourceName: task.sourceName,
    };
  }

  if (task.sourceKey) {
    return { groupKey: `${sourceType}:${task.sourceKey}`, sourceType, sourceKey: task.sourceKey, sourceName: task.sourceName };
  }

  if (task.sourceName) {
    return { groupKey: `${sourceType}:${normalizeSourceName(task.sourceName)}`, sourceType, sourceName: task.sourceName };
  }

  return {
    groupKey: `${sourceType}:unknown:${kind === "unknown" ? task.materialKey : task.materialKey}`,
    sourceType,
  };
}

function inferLeyLineKey(task: FarmTask): string {
  if (task.materialKey === "mat_mora") {
    return "ley_line_mora";
  }
  if (["mat_heros_wit", "mat_adventurers_experience", "mat_wanderers_advice"].includes(task.materialKey)) {
    return "ley_line_exp";
  }
  return "ley_line";
}

function normalizeSourceName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function reassignBossGemsToSpecificBossGroups(groups: Map<string, MutableGroup>): void {
  const bossGroupsWithSpecificMaterials = [...groups.entries()]
    .filter(([, group]) => NORMAL_BOSS_SOURCE_TYPES.has(group.sourceType) && group.tasks.some((task) => !isElementalGem(task)));

  if (bossGroupsWithSpecificMaterials.length === 0) {
    return;
  }

  for (const [fromKey, group] of [...groups.entries()]) {
    if (!NORMAL_BOSS_SOURCE_TYPES.has(group.sourceType)) {
      continue;
    }

    for (const task of [...group.tasks]) {
      if (!isElementalGem(task)) {
        continue;
      }

      const target = bossGroupsWithSpecificMaterials.find(([, candidate]) =>
        candidate.sourceKey !== undefined && taskCanDropFromSource(task, candidate.sourceKey),
      );

      if (!target || target[0] === fromKey) {
        continue;
      }

      group.tasks = group.tasks.filter((item) => item !== task);
      target[1].tasks.push(task);
    }
  }
}

function taskCanDropFromSource(task: FarmTask, sourceKey: string): boolean {
  return (task.sourceOptions ?? []).some((source) => source.sourceType === task.sourceType && source.sourceKey === sourceKey);
}

function choosePrimaryTask(tasks: FarmTask[]): FarmTask | undefined {
  return [...tasks].sort(comparePrimaryCandidates)[0];
}

function comparePrimaryCandidates(left: FarmTask, right: FarmTask): number {
  return (
    primaryRank(left) - primaryRank(right) ||
    right.missing - left.missing ||
    left.materialKey.localeCompare(right.materialKey)
  );
}

function primaryRank(task: FarmTask): number {
  if (NORMAL_BOSS_SOURCE_TYPES.has(task.sourceType) && !isElementalGem(task)) {
    return 0;
  }
  if (!isElementalGem(task)) {
    return 1;
  }
  return 2;
}

function materialRole(task: FarmTask, groupTasks: FarmTask[]): "secondary" | "unknown" {
  if (NORMAL_BOSS_SOURCE_TYPES.has(task.sourceType) && isElementalGem(task) && groupTasks.some((candidate) => !isElementalGem(candidate))) {
    return "secondary";
  }
  return "unknown";
}

function isElementalGem(task: FarmTask): boolean {
  const haystack = `${task.materialKey} ${task.materialName}`.toLowerCase();
  return GEM_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function roleRank(role: FarmSourceGroupMaterial["role"]): number {
  return role === "primary" ? 0 : role === "secondary" ? 1 : 2;
}

function mergeCalendarDays(tasks: FarmTask[]): string[] {
  const order = new Map([
    ["monday", 0],
    ["tuesday", 1],
    ["wednesday", 2],
    ["thursday", 3],
    ["friday", 4],
    ["saturday", 5],
    ["sunday", 6],
  ]);

  return [...new Set(tasks.flatMap((task) => task.calendarDays))]
    .sort((left, right) => (order.get(left) ?? 99) - (order.get(right) ?? 99) || left.localeCompare(right));
}

function applyGroupEstimate(group: FarmSourceGroup, primary: FarmTask | undefined, runEstimates: RunEstimateService): void {
  if (!primary) {
    group.estimatedRuns = null;
    group.estimatedResin = null;
    return;
  }

  if (NORMAL_BOSS_SOURCE_TYPES.has(group.sourceType)) {
    const estimate = runEstimates.estimate({
      materialKey: primary.materialKey,
      materialName: primary.materialName,
      missing: primary.missing,
      sourceType: group.sourceType,
      resinCostPerRun: group.resinCostPerRun,
    });
    group.estimatedRuns = estimate.estimatedRuns;
    group.estimatedResin = estimate.estimatedResin;
    group.warnings = [...new Set([
      ...group.warnings,
      ...estimate.warnings,
      ...(group.materials.some((material) => material.role === "secondary")
        ? ["Elemental gem drops are treated as secondary coverage from boss farming and may need manual correction."]
        : []),
    ])];
    return;
  }

  if (DOMAIN_SOURCE_TYPES.has(group.sourceType) || LEY_LINE_SOURCE_TYPES.has(group.sourceType)) {
    const estimate = runEstimates.estimate({
      materialKey: primary.materialKey,
      materialName: primary.materialName,
      missing: primary.missing,
      sourceType: group.sourceType,
      resinCostPerRun: group.resinCostPerRun,
    });
    group.estimatedRuns = estimate.estimatedRuns;
    group.estimatedResin = estimate.estimatedResin;
    group.warnings = [...new Set([...group.warnings, ...estimate.warnings])];
    return;
  }

  if (group.openWorld) {
    group.estimatedRuns = null;
    group.estimatedResin = 0;
    return;
  }

  group.estimatedRuns = null;
  group.estimatedResin = null;
}

function compareGroups(left: FarmSourceGroup, right: FarmSourceGroup): number {
  return groupRank(left) - groupRank(right) || left.groupKey.localeCompare(right.groupKey);
}

function groupRank(group: FarmSourceGroup): number {
  if (group.weeklyBoss || WEEKLY_BOSS_SOURCE_TYPES.has(group.sourceType)) {
    return 0;
  }
  if (NORMAL_BOSS_SOURCE_TYPES.has(group.sourceType)) {
    return 1;
  }
  if (DOMAIN_SOURCE_TYPES.has(group.sourceType)) {
    return 2;
  }
  if (LEY_LINE_SOURCE_TYPES.has(group.sourceType)) {
    return 3;
  }
  if (group.openWorld) {
    return 4;
  }
  return 9;
}
