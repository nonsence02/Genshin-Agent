import { ResinPolicy } from "../policies/ResinPolicy.js";
import type { MaterialDiffStatus } from "./InventoryDiffService.js";
import type { MaterialSourceLookupResult } from "./MaterialSourceService.js";

export interface MaterialDemandInput {
  materialId: number;
  stableKey: string;
  name: string;
  required?: number;
  owned?: number;
  missing?: number;
  status?: MaterialDiffStatus;
}

export interface ClassifiedMaterialDemand {
  materialId: number;
  stableKey: string;
  name: string;
  required?: number;
  owned?: number;
  missing?: number;
  status?: MaterialDiffStatus;
  sourceTypes: string[];
  primarySourceType: string | null;
  resinGated: boolean;
  resinCostPerRun: number | null;
  weeklyBoss: boolean;
  openWorld: boolean;
  calendarDays: string[];
  notes: string[];
  warnings: string[];
}

export interface MaterialDemandClassifierInput {
  material: MaterialDemandInput;
  sourceLookup?: MaterialSourceLookupResult;
}

const PRIMARY_SOURCE_ORDER = [
  "boss",
  "normal_boss",
  "weekly_boss",
  "trounce_domain",
  "domain",
  "talent_domain",
  "weapon_domain",
  "artifact_domain",
  "enemy",
  "local_specialty",
  "ley_line",
  "shop",
  "crafting",
  "expedition",
  "event",
  "unknown",
];

const OPEN_WORLD_SOURCE_TYPES = new Set(["enemy", "local_specialty"]);
const WEEKLY_BOSS_SOURCE_TYPES = new Set(["weekly_boss", "trounce_domain"]);
const LEY_LINE_PRIMARY_MATERIAL_KEYS = new Set([
  "mat_mora",
  "mat_heros_wit",
  "mat_adventurers_experience",
  "mat_wanderers_advice",
]);

export class MaterialDemandClassifier {
  constructor(private readonly resinPolicy = new ResinPolicy()) {}

  classify(input: MaterialDemandClassifierInput): ClassifiedMaterialDemand {
    const sources = input.sourceLookup?.sources ?? [];
    const sourceTypes = [...new Set(sources.map((source) => source.sourceType))].sort(compareSourceTypes);
    const primarySourceType =
      LEY_LINE_PRIMARY_MATERIAL_KEYS.has(input.material.stableKey) && sourceTypes.includes("ley_line")
        ? "ley_line"
        : (sourceTypes[0] ?? null);
    const resinCostPerRun = primarySourceType ? this.resinPolicy.getBaseCostForSourceType(primarySourceType) : null;
    const warnings = [...(input.sourceLookup?.warnings ?? [])];

    if (sourceTypes.length === 0) {
      warnings.push(`No normalized sources available for ${input.material.stableKey}`);
    }

    if (sourceTypes.includes("unknown")) {
      warnings.push(`Unknown source type present for ${input.material.stableKey}`);
    }

    return {
      ...input.material,
      sourceTypes,
      primarySourceType,
      resinGated: primarySourceType ? this.resinPolicy.isResinGatedSourceType(primarySourceType) : false,
      resinCostPerRun,
      weeklyBoss: primarySourceType ? WEEKLY_BOSS_SOURCE_TYPES.has(primarySourceType) : false,
      openWorld: sourceTypes.some((sourceType) => OPEN_WORLD_SOURCE_TYPES.has(sourceType)),
      calendarDays: uniqueSortedDays(sources.flatMap((source) => source.days ?? [])),
      notes: sources.map((source) => source.notes).filter((note): note is string => note !== undefined),
      warnings,
    };
  }
}

function compareSourceTypes(left: string, right: string): number {
  return sourceRank(left) - sourceRank(right) || left.localeCompare(right);
}

function sourceRank(sourceType: string): number {
  const index = PRIMARY_SOURCE_ORDER.indexOf(sourceType);
  return index === -1 ? PRIMARY_SOURCE_ORDER.length : index;
}

function uniqueSortedDays(days: string[]): string[] {
  const order = new Map([
    ["monday", 0],
    ["tuesday", 1],
    ["wednesday", 2],
    ["thursday", 3],
    ["friday", 4],
    ["saturday", 5],
    ["sunday", 6],
  ]);

  return [...new Set(days)].sort((left, right) => (order.get(left) ?? 99) - (order.get(right) ?? 99) || left.localeCompare(right));
}
