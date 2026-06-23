import { ResinPolicy } from "../policies/ResinPolicy.js";
import type { CharacterInventoryDiffResult } from "./InventoryDiffService.js";
import { MaterialDemandClassifier, type ClassifiedMaterialDemand } from "./MaterialDemandClassifier.js";
import { MaterialSourceService, type MaterialSourceLookupResult } from "./MaterialSourceService.js";
import { RunEstimateService } from "./RunEstimateService.js";

export interface FarmTask {
  materialId: number;
  materialKey: string;
  materialName: string;
  missing: number;
  sourceType: string;
  sourceName?: string;
  sourceKey?: string;
  resinCostPerRun?: number | null;
  estimatedRuns?: number | null;
  estimatedResin?: number | null;
  calendarDays: string[];
  weeklyBoss?: boolean;
  openWorld?: boolean;
  notes: string[];
  warnings: string[];
}

export interface FarmTaskPlan {
  resinTasks: FarmTask[];
  openWorldTasks: FarmTask[];
  unknownTasks: FarmTask[];
  warnings: string[];
}

export interface FarmTaskMaterialSourceLookup {
  lookup(input: { materialKey?: string; materialId?: number; includeCalendar?: boolean }): Promise<MaterialSourceLookupResult>;
}

export interface FarmTaskClassifier {
  classify(input: Parameters<MaterialDemandClassifier["classify"]>[0]): ClassifiedMaterialDemand;
}

export interface FarmTaskRunEstimator {
  estimate(input: Parameters<RunEstimateService["estimate"]>[0]): ReturnType<RunEstimateService["estimate"]>;
}

const OPEN_WORLD_SOURCE_TYPES = new Set(["enemy", "local_specialty"]);
const WEEKLY_BOSS_SOURCE_TYPES = new Set(["weekly_boss", "trounce_domain"]);

export class FarmTaskBuilder {
  constructor(
    private readonly materialSources: FarmTaskMaterialSourceLookup = new MaterialSourceService(),
    private readonly classifier: FarmTaskClassifier = new MaterialDemandClassifier(),
    private readonly resinPolicy = new ResinPolicy(),
    private readonly runEstimates: FarmTaskRunEstimator = new RunEstimateService(),
  ) {}

  async build(diff: CharacterInventoryDiffResult): Promise<FarmTaskPlan> {
    const resinTasks: FarmTask[] = [];
    const openWorldTasks: FarmTask[] = [];
    const unknownTasks: FarmTask[] = [];
    const warnings: string[] = [...diff.warnings];

    for (const material of diff.materials.filter((item) => item.missing > 0)) {
      let lookup: MaterialSourceLookupResult | undefined;
      let classification: ClassifiedMaterialDemand;

      try {
        lookup = await this.materialSources.lookup({ materialKey: material.stableKey, includeCalendar: true });
        classification = this.classifier.classify({
          material: {
            materialId: material.materialId,
            stableKey: material.stableKey,
            name: material.name,
            required: material.required,
            owned: material.owned,
            missing: material.missing,
            status: material.status,
          },
          sourceLookup: lookup,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        classification = this.classifier.classify({
          material: {
            materialId: material.materialId,
            stableKey: material.stableKey,
            name: material.name,
            required: material.required,
            owned: material.owned,
            missing: material.missing,
            status: material.status,
          },
        });
        classification.warnings.push(message);
      }

      const task = this.createTask(material, lookup, classification);
      warnings.push(...task.warnings);

      if (classification.resinGated) {
        resinTasks.push(task);
      } else if (classification.openWorld || OPEN_WORLD_SOURCE_TYPES.has(task.sourceType)) {
        openWorldTasks.push(task);
      } else {
        unknownTasks.push({
          ...task,
          warnings: [...task.warnings, `Task is not resin-gated or open-world classified: ${material.stableKey}`],
        });
      }
    }

    return {
      resinTasks: resinTasks.sort(compareFarmTasks),
      openWorldTasks: openWorldTasks.sort(compareFarmTasks),
      unknownTasks: unknownTasks.sort(compareFarmTasks),
      warnings: [...new Set(warnings)],
    };
  }

  private createTask(
    material: CharacterInventoryDiffResult["materials"][number],
    lookup: MaterialSourceLookupResult | undefined,
    classification: ClassifiedMaterialDemand,
  ): FarmTask {
    const source = pickSource(lookup, classification.primarySourceType);
    const sourceType = classification.primarySourceType ?? source?.sourceType ?? "unknown";
    const resinCostPerRun =
      classification.weeklyBoss
        ? null
        : classification.resinCostPerRun ?? source?.resinCost ?? this.resinPolicy.getBaseCostForSourceType(sourceType);
    const estimate = this.runEstimates.estimate({
      materialKey: material.stableKey,
      materialName: material.name,
      missing: material.missing,
      sourceType,
      resinCostPerRun,
    });
    const warnings = [...classification.warnings, ...estimate.warnings];

    if (classification.weeklyBoss && !source?.sourceKey) {
      warnings.push(`Weekly boss task for ${material.stableKey} has no source identity; scheduling will be cautious.`);
    }

    return {
      materialId: material.materialId,
      materialKey: material.stableKey,
      materialName: material.name,
      missing: material.missing,
      sourceType,
      sourceName: source?.sourceName,
      sourceKey: source?.sourceKey,
      resinCostPerRun,
      estimatedRuns: estimate.estimatedRuns,
      estimatedResin: estimate.estimatedResin,
      calendarDays: classification.calendarDays,
      weeklyBoss: classification.weeklyBoss || WEEKLY_BOSS_SOURCE_TYPES.has(sourceType),
      openWorld: classification.openWorld,
      notes: classification.notes,
      warnings,
    };
  }
}

function pickSource(
  lookup: MaterialSourceLookupResult | undefined,
  primarySourceType: string | null,
): MaterialSourceLookupResult["sources"][number] | undefined {
  if (!lookup || lookup.sources.length === 0) {
    return undefined;
  }

  return lookup.sources.find((source) => source.sourceType === primarySourceType) ?? lookup.sources[0];
}

function compareFarmTasks(left: FarmTask, right: FarmTask): number {
  return (
    taskRank(left) - taskRank(right) ||
    left.materialKey.localeCompare(right.materialKey) ||
    left.sourceType.localeCompare(right.sourceType)
  );
}

function taskRank(task: FarmTask): number {
  if (task.weeklyBoss || WEEKLY_BOSS_SOURCE_TYPES.has(task.sourceType)) {
    return 0;
  }
  if (task.sourceType === "boss" || task.sourceType === "normal_boss") {
    return 1;
  }
  if (task.sourceType.includes("domain")) {
    return 2;
  }
  if (task.sourceType === "ley_line") {
    return 3;
  }
  if (task.openWorld) {
    return 4;
  }
  return 9;
}
