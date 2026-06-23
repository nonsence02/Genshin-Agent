export type CraftingRuleType = "tier_upgrade" | "dust_of_azoth_conversion" | "dream_solvent_conversion";

export interface CraftingRuleMaterial {
  materialId: number;
  stableKey: string;
  name: string;
  sourceTypes?: string[];
  sourceOptions?: Array<{
    sourceType: string;
    sourceKey?: string;
    sourceName?: string;
  }>;
}

export interface CraftingRule {
  id: string;
  type: CraftingRuleType;
  inputMaterialKey: string;
  outputMaterialKey: string;
  inputQuantity: number;
  outputQuantity: number;
  catalystMaterialKey?: string;
  catalystQuantity?: number;
  familyKey?: string;
  notes?: string;
}

const TALENT_PREFIXES = ["Teachings of ", "Guide to ", "Philosophies of "];
const GEM_TIERS = ["Sliver", "Fragment", "Chunk", "Gemstone"];
const GEM_FAMILIES = [
  "Agnidus Agate",
  "Varunada Lazurite",
  "Vajrada Amethyst",
  "Vayuda Turquoise",
  "Shivada Jade",
  "Prithiva Topaz",
  "Nagadus Emerald",
  "Brilliant Diamond",
];

const CURATED_THREE_TIER_FAMILIES: string[][] = [
  ["Whopperflower Nectar", "Shimmering Nectar", "Energy Nectar"],
  ["Damaged Mask", "Stained Mask", "Ominous Mask"],
  ["Firm Arrowhead", "Sharp Arrowhead", "Weathered Arrowhead"],
  ["Recruit's Insignia", "Sergeant's Insignia", "Lieutenant's Insignia"],
  ["Divining Scroll", "Sealed Scroll", "Forbidden Curse Scroll"],
  ["Old Handguard", "Kageuchi Handguard", "Famed Handguard"],
  ["Fungal Spores", "Luminescent Pollen", "Crystalline Cyst Dust"],
  ["Meshing Gear", "Mechanical Spur Gear", "Artificed Dynamic Gear"],
  ["Transoceanic Pearl", "Transoceanic Chunk", "Xenochromatic Crystal"],
  ["Drop of Tainted Water", "Scoop of Tainted Water", "Newborn Tainted Hydro Phantasm"],
];

export class CraftingRuleService {
  buildRules(materials: CraftingRuleMaterial[]): CraftingRule[] {
    const materialByName = new Map(materials.map((material) => [normalizeName(material.name), material]));
    const rules: CraftingRule[] = [];

    rules.push(...buildTalentBookRules(materials));
    rules.push(...buildElementalGemRules(materials));
    rules.push(...buildCuratedThreeTierRules(materialByName));
    rules.push(...buildDustOfAzothRules(materials));
    rules.push(...buildDreamSolventRules(materials));

    return uniqueRules(rules);
  }
}

function buildTalentBookRules(materials: CraftingRuleMaterial[]): CraftingRule[] {
  const byFamily = new Map<string, CraftingRuleMaterial[]>();

  for (const material of materials) {
    const prefix = TALENT_PREFIXES.find((candidate) => material.name.startsWith(candidate));
    if (!prefix) {
      continue;
    }

    const familyKey = `talent:${material.name.slice(prefix.length).toLowerCase()}`;
    const current = byFamily.get(familyKey) ?? [];
    current.push(material);
    byFamily.set(familyKey, current);
  }

  return [...byFamily.entries()].flatMap(([familyKey, family]) => {
    const suffix = family[0]?.name.replace(TALENT_PREFIXES.find((prefix) => family[0]?.name.startsWith(prefix)) ?? "", "");
    return suffix ? adjacentTierRules(familyKey, family, TALENT_PREFIXES.map((prefix) => `${prefix}${suffix}`)) : [];
  });
}

function buildElementalGemRules(materials: CraftingRuleMaterial[]): CraftingRule[] {
  const rules: CraftingRule[] = [];

  for (const family of GEM_FAMILIES) {
    const tierMaterials = GEM_TIERS
      .map((tier) => materials.find((material) => material.name === `${family} ${tier}`))
      .filter((material): material is CraftingRuleMaterial => material !== undefined);

    rules.push(...adjacentTierRules(`gem:${normalizeName(family)}`, tierMaterials, GEM_TIERS.map((tier) => `${family} ${tier}`)));
  }

  return rules;
}

function buildCuratedThreeTierRules(materialByName: Map<string, CraftingRuleMaterial>): CraftingRule[] {
  return CURATED_THREE_TIER_FAMILIES.flatMap((family) => {
    const materials = family.map((name) => materialByName.get(normalizeName(name))).filter((material): material is CraftingRuleMaterial => material !== undefined);
    return adjacentTierRules(`curated:${normalizeName(family[0] ?? "unknown")}`, materials, family);
  });
}

function adjacentTierRules(familyKey: string, materials: CraftingRuleMaterial[], orderedNames: string[]): CraftingRule[] {
  const byName = new Map(materials.map((material) => [normalizeName(material.name), material]));
  const rules: CraftingRule[] = [];

  for (let index = 0; index < orderedNames.length - 1; index += 1) {
    const input = byName.get(normalizeName(orderedNames[index]!));
    const output = byName.get(normalizeName(orderedNames[index + 1]!));

    if (!input || !output) {
      continue;
    }

    rules.push({
      id: `tier:${input.stableKey}->${output.stableKey}`,
      type: "tier_upgrade",
      inputMaterialKey: input.stableKey,
      outputMaterialKey: output.stableKey,
      inputQuantity: 3,
      outputQuantity: 1,
      familyKey,
      notes: "Mora craft cost is not modeled in v1 and is treated as 0. TODO: normalize craft costs.",
    });
  }

  return rules;
}

function buildDustOfAzothRules(materials: CraftingRuleMaterial[]): CraftingRule[] {
  const gems = materials.filter((material) => isKnownElementalGem(material.name));
  const rules: CraftingRule[] = [];

  for (const output of gems) {
    const tier = GEM_TIERS.find((candidate) => output.name.endsWith(` ${candidate}`));
    if (!tier) {
      continue;
    }

    for (const input of gems.filter((candidate) => candidate.stableKey !== output.stableKey && candidate.name.endsWith(` ${tier}`))) {
      rules.push({
        id: `dust:${input.stableKey}->${output.stableKey}`,
        type: "dust_of_azoth_conversion",
        inputMaterialKey: input.stableKey,
        outputMaterialKey: output.stableKey,
        inputQuantity: 1,
        outputQuantity: 1,
        catalystMaterialKey: "mat_dust_of_azoth",
        catalystQuantity: dustCostForTier(tier),
        familyKey: `gem-tier:${tier.toLowerCase()}`,
      });
    }
  }

  return rules;
}

function buildDreamSolventRules(materials: CraftingRuleMaterial[]): CraftingRule[] {
  const weeklyDrops = materials.filter((material) => !isKnownElementalGem(material.name) && material.sourceOptions?.some((source) => source.sourceType === "weekly_boss"));
  const bySource = new Map<string, CraftingRuleMaterial[]>();

  for (const material of weeklyDrops) {
    for (const source of material.sourceOptions?.filter((candidate) => candidate.sourceType === "weekly_boss" && candidate.sourceKey) ?? []) {
      const current = bySource.get(source.sourceKey!) ?? [];
      current.push(material);
      bySource.set(source.sourceKey!, current);
    }
  }

  return [...bySource.entries()].flatMap(([sourceKey, family]) =>
    family.flatMap((output) =>
      family
        .filter((input) => input.stableKey !== output.stableKey)
        .map((input) => ({
          id: `dream:${sourceKey}:${input.stableKey}->${output.stableKey}`,
          type: "dream_solvent_conversion" as const,
          inputMaterialKey: input.stableKey,
          outputMaterialKey: output.stableKey,
          inputQuantity: 1,
          outputQuantity: 1,
          catalystMaterialKey: "mat_dream_solvent",
          catalystQuantity: 1,
          familyKey: `weekly:${sourceKey}`,
        })),
    ),
  );
}

function isKnownElementalGem(name: string): boolean {
  return GEM_FAMILIES.some((family) => GEM_TIERS.some((tier) => name === `${family} ${tier}`));
}

function dustCostForTier(tier: string): number {
  return {
    Sliver: 1,
    Fragment: 3,
    Chunk: 9,
    Gemstone: 27,
  }[tier] ?? 0;
}

function uniqueRules(rules: CraftingRule[]): CraftingRule[] {
  return [...new Map(rules.map((rule) => [rule.id, rule])).values()].sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
