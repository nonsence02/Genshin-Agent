import type { CraftingRule, CraftingRuleMaterial } from "./CraftingRuleService.js";

export interface InventoryProjectionOptions {
  allowTierUpgrades?: boolean;
  allowDustOfAzoth?: boolean;
  allowDreamSolvent?: boolean;
  preserveLowerTierMaterials?: boolean;
}

export interface InventoryProjectionMaterial extends CraftingRuleMaterial {
  required: number;
  directQuantity: number;
}

export interface ProjectedInventoryItem {
  materialId: number;
  stableKey: string;
  name: string;
  directQuantity: number;
  projectedQuantity: number;
  consumedQuantity: number;
  producedQuantity: number;
}

export interface CraftingAction {
  ruleId: string;
  type: string;
  inputMaterialKey: string;
  inputMaterialName: string;
  inputQuantity: number;
  outputMaterialKey: string;
  outputMaterialName: string;
  outputQuantity: number;
  catalystMaterialKey?: string;
  catalystMaterialName?: string;
  catalystQuantity?: number;
  reason: string;
  warnings: string[];
}

export interface InventoryProjectionResult {
  items: ProjectedInventoryItem[];
  effectiveOwnedByMaterialKey: Map<string, number>;
  missingBeforeByMaterialKey: Map<string, number>;
  missingAfterByMaterialKey: Map<string, number>;
  craftingActions: CraftingAction[];
  conversionActions: CraftingAction[];
  warnings: string[];
}

const DEFAULT_OPTIONS: Required<InventoryProjectionOptions> = {
  allowTierUpgrades: true,
  allowDustOfAzoth: false,
  allowDreamSolvent: false,
  preserveLowerTierMaterials: false,
};

export class InventoryProjectionService {
  project(
    materials: InventoryProjectionMaterial[],
    rules: CraftingRule[],
    options: InventoryProjectionOptions = {},
  ): InventoryProjectionResult {
    const resolved = { ...DEFAULT_OPTIONS, ...options };
    const materialByKey = new Map(materials.map((material) => [material.stableKey, material]));
    const quantities = new Map(materials.map((material) => [material.stableKey, material.directQuantity]));
    const consumed = new Map<string, number>();
    const produced = new Map<string, number>();
    const required = new Map(materials.map((material) => [material.stableKey, material.required]));
    const craftingActions: CraftingAction[] = [];
    const conversionActions: CraftingAction[] = [];
    const warnings: string[] = [];

    const targetKeys = new Set(materials.filter((material) => material.required > 0).map((material) => material.stableKey));

    if (resolved.allowTierUpgrades) {
      for (const target of sortTargetsHighestTierFirst([...targetKeys], rules)) {
        applyRulesForTarget({
          target,
          type: "tier_upgrade",
          rules,
          quantities,
          consumed,
          produced,
          required,
          materialByKey,
          actions: craftingActions,
          warnings,
          preserveLowerTierMaterials: resolved.preserveLowerTierMaterials,
        });
      }
    }

    if (resolved.allowDustOfAzoth) {
      for (const target of sortTargetsHighestTierFirst([...targetKeys], rules)) {
        applyRulesForTarget({
          target,
          type: "dust_of_azoth_conversion",
          rules,
          quantities,
          consumed,
          produced,
          required,
          materialByKey,
          actions: conversionActions,
          warnings,
          preserveLowerTierMaterials: true,
        });
      }
    }

    if (resolved.allowDreamSolvent) {
      for (const target of sortTargetsHighestTierFirst([...targetKeys], rules)) {
        applyRulesForTarget({
          target,
          type: "dream_solvent_conversion",
          rules,
          quantities,
          consumed,
          produced,
          required,
          materialByKey,
          actions: conversionActions,
          warnings,
          preserveLowerTierMaterials: true,
        });
      }
    }

    const items = materials.map((material) => ({
      materialId: material.materialId,
      stableKey: material.stableKey,
      name: material.name,
      directQuantity: material.directQuantity,
      projectedQuantity: quantities.get(material.stableKey) ?? 0,
      consumedQuantity: consumed.get(material.stableKey) ?? 0,
      producedQuantity: produced.get(material.stableKey) ?? 0,
    }));
    const missingBeforeByMaterialKey = new Map(
      materials.map((material) => [material.stableKey, Math.max(0, material.required - material.directQuantity)]),
    );
    const missingAfterByMaterialKey = new Map(
      materials.map((material) => [material.stableKey, Math.max(0, material.required - (quantities.get(material.stableKey) ?? 0))]),
    );

    return {
      items,
      effectiveOwnedByMaterialKey: new Map(items.map((item) => [item.stableKey, item.projectedQuantity])),
      missingBeforeByMaterialKey,
      missingAfterByMaterialKey,
      craftingActions,
      conversionActions,
      warnings: [...new Set(warnings)],
    };
  }
}

function applyRulesForTarget(input: {
  target: string;
  type: CraftingRule["type"];
  rules: CraftingRule[];
  quantities: Map<string, number>;
  consumed: Map<string, number>;
  produced: Map<string, number>;
  required: Map<string, number>;
  materialByKey: Map<string, InventoryProjectionMaterial>;
  actions: CraftingAction[];
  warnings: string[];
  preserveLowerTierMaterials: boolean;
}): void {
  let missing = Math.max(0, (input.required.get(input.target) ?? 0) - (input.quantities.get(input.target) ?? 0));

  while (missing > 0) {
    const rule = input.rules.find((candidate) => candidate.type === input.type && candidate.outputMaterialKey === input.target);
    if (!rule) {
      return;
    }

    const catalystAvailable = rule.catalystMaterialKey ? input.quantities.get(rule.catalystMaterialKey) ?? 0 : Number.POSITIVE_INFINITY;
    const catalystMax = rule.catalystQuantity ? Math.floor(catalystAvailable / rule.catalystQuantity) : Number.POSITIVE_INFINITY;
    const inputAvailable = input.quantities.get(rule.inputMaterialKey) ?? 0;
    const reserved = input.preserveLowerTierMaterials ? input.required.get(rule.inputMaterialKey) ?? 0 : Math.min(input.required.get(rule.inputMaterialKey) ?? 0, inputAvailable);
    const usable = Math.max(0, inputAvailable - reserved);
    const maxCrafts = Math.min(Math.floor(usable / rule.inputQuantity), catalystMax, missing);

    if (maxCrafts <= 0) {
      if (inputAvailable >= rule.inputQuantity && usable < rule.inputQuantity) {
        input.warnings.push(`Skipped ${rule.id} to preserve required lower-tier material ${rule.inputMaterialKey}.`);
      }
      if (rule.catalystMaterialKey && catalystMax <= 0) {
        input.warnings.push(`Skipped ${rule.id}; not enough catalyst ${rule.catalystMaterialKey}.`);
      }
      return;
    }

    const inputQty = maxCrafts * rule.inputQuantity;
    const outputQty = maxCrafts * rule.outputQuantity;
    input.quantities.set(rule.inputMaterialKey, inputAvailable - inputQty);
    input.quantities.set(input.target, (input.quantities.get(input.target) ?? 0) + outputQty);
    input.consumed.set(rule.inputMaterialKey, (input.consumed.get(rule.inputMaterialKey) ?? 0) + inputQty);
    input.produced.set(input.target, (input.produced.get(input.target) ?? 0) + outputQty);

    if (rule.catalystMaterialKey && rule.catalystQuantity) {
      input.quantities.set(rule.catalystMaterialKey, catalystAvailable - maxCrafts * rule.catalystQuantity);
      input.consumed.set(rule.catalystMaterialKey, (input.consumed.get(rule.catalystMaterialKey) ?? 0) + maxCrafts * rule.catalystQuantity);
    }

    input.actions.push(toAction(rule, inputQty, outputQty, maxCrafts, input.materialByKey));
    missing = Math.max(0, (input.required.get(input.target) ?? 0) - (input.quantities.get(input.target) ?? 0));
  }
}

function toAction(
  rule: CraftingRule,
  inputQuantity: number,
  outputQuantity: number,
  crafts: number,
  materialByKey: Map<string, InventoryProjectionMaterial>,
): CraftingAction {
  const input = materialByKey.get(rule.inputMaterialKey);
  const output = materialByKey.get(rule.outputMaterialKey);
  const catalyst = rule.catalystMaterialKey ? materialByKey.get(rule.catalystMaterialKey) : undefined;

  return {
    ruleId: rule.id,
    type: rule.type,
    inputMaterialKey: rule.inputMaterialKey,
    inputMaterialName: input?.name ?? rule.inputMaterialKey,
    inputQuantity,
    outputMaterialKey: rule.outputMaterialKey,
    outputMaterialName: output?.name ?? rule.outputMaterialKey,
    outputQuantity,
    catalystMaterialKey: rule.catalystMaterialKey,
    catalystMaterialName: catalyst?.name,
    catalystQuantity: rule.catalystQuantity ? crafts * rule.catalystQuantity : undefined,
    reason: rule.type === "tier_upgrade" ? "Crafted virtually to reduce current requirement missing quantity." : "Converted virtually by explicit opt-in option.",
    warnings: rule.notes ? [rule.notes] : [],
  };
}

function sortTargetsHighestTierFirst(targets: string[], rules: CraftingRule[]): string[] {
  const incomingCount = new Map<string, number>();
  for (const rule of rules) {
    incomingCount.set(rule.outputMaterialKey, (incomingCount.get(rule.outputMaterialKey) ?? 0) + 1);
  }

  return [...targets].sort((left, right) => (incomingCount.get(right) ?? 0) - (incomingCount.get(left) ?? 0) || left.localeCompare(right));
}
