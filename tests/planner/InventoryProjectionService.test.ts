import { describe, expect, it } from "vitest";
import { CraftingRuleService, type CraftingRuleMaterial } from "../../src/planner/services/CraftingRuleService.js";
import { InventoryProjectionService, type InventoryProjectionMaterial } from "../../src/planner/services/InventoryProjectionService.js";

describe("InventoryProjectionService", () => {
  const rules = new CraftingRuleService();
  const projection = new InventoryProjectionService();

  it("applies 3:1 talent book upgrades", () => {
    const result = project([
      material("mat_teachings_of_justice", "Teachings of Justice", 0, 3),
      material("mat_guide_to_justice", "Guide to Justice", 1, 0),
    ]);

    expect(result.craftingActions).toHaveLength(1);
    expect(result.effectiveOwnedByMaterialKey.get("mat_guide_to_justice")).toBe(1);
    expect(result.missingAfterByMaterialKey.get("mat_guide_to_justice")).toBe(0);
  });

  it("applies 3:1 enemy drop upgrades", () => {
    const result = project([
      material("mat_whopperflower_nectar", "Whopperflower Nectar", 0, 3),
      material("mat_shimmering_nectar", "Shimmering Nectar", 1, 0),
    ]);

    expect(result.craftingActions[0]).toMatchObject({
      inputMaterialKey: "mat_whopperflower_nectar",
      outputMaterialKey: "mat_shimmering_nectar",
      inputQuantity: 3,
      outputQuantity: 1,
    });
  });

  it("applies 3:1 elemental gem upgrades", () => {
    const result = project([
      material("mat_varunada_lazurite_fragment", "Varunada Lazurite Fragment", 0, 3),
      material("mat_varunada_lazurite_chunk", "Varunada Lazurite Chunk", 1, 0),
    ]);

    expect(result.effectiveOwnedByMaterialKey.get("mat_varunada_lazurite_chunk")).toBe(1);
  });

  it("does not consume lower-tier materials that are also required and would become missing", () => {
    const result = project([
      material("mat_teachings_of_justice", "Teachings of Justice", 3, 3),
      material("mat_guide_to_justice", "Guide to Justice", 1, 0),
    ]);

    expect(result.craftingActions).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("preserve required lower-tier"))).toBe(true);
    expect(result.missingAfterByMaterialKey.get("mat_guide_to_justice")).toBe(1);
  });

  it("keeps Dust of Azoth conversion disabled by default", () => {
    const result = project([
      material("mat_agnidus_agate_chunk", "Agnidus Agate Chunk", 0, 1),
      material("mat_varunada_lazurite_chunk", "Varunada Lazurite Chunk", 1, 0),
      material("mat_dust_of_azoth", "Dust of Azoth", 0, 9),
    ]);

    expect(result.conversionActions).toEqual([]);
    expect(result.missingAfterByMaterialKey.get("mat_varunada_lazurite_chunk")).toBe(1);
  });

  it("Dust of Azoth conversion consumes correct tier amounts", () => {
    const cases = [
      ["Sliver", 1],
      ["Fragment", 3],
      ["Chunk", 9],
      ["Gemstone", 27],
    ] as const;

    for (const [tier, cost] of cases) {
      const result = project(
        [
          material(`mat_agnidus_${tier.toLowerCase()}`, `Agnidus Agate ${tier}`, 0, 1),
          material(`mat_varunada_${tier.toLowerCase()}`, `Varunada Lazurite ${tier}`, 1, 0),
          material("mat_dust_of_azoth", "Dust of Azoth", 0, cost),
        ],
        { allowDustOfAzoth: true },
      );

      expect(result.conversionActions[0]?.catalystQuantity).toBe(cost);
      expect(result.missingAfterByMaterialKey.get(`mat_varunada_${tier.toLowerCase()}`)).toBe(0);
    }
  });

  it("Dust conversion warns when catalyst is insufficient", () => {
    const result = project(
      [
        material("mat_agnidus_agate_chunk", "Agnidus Agate Chunk", 0, 1),
        material("mat_varunada_lazurite_chunk", "Varunada Lazurite Chunk", 1, 0),
        material("mat_dust_of_azoth", "Dust of Azoth", 0, 8),
      ],
      { allowDustOfAzoth: true },
    );

    expect(result.conversionActions).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes("not enough catalyst"))).toBe(true);
  });

  it("Dream Solvent is opt-in and only converts within the same weekly boss", () => {
    const sameBoss = [
      material("mat_a", "Drop A", 0, 1, [{ sourceType: "weekly_boss", sourceKey: "weekly_1" }]),
      material("mat_b", "Drop B", 1, 0, [{ sourceType: "weekly_boss", sourceKey: "weekly_1" }]),
      material("mat_dream_solvent", "Dream Solvent", 0, 1),
    ];
    const disabled = project(sameBoss);
    const enabled = project(sameBoss, { allowDreamSolvent: true });
    const differentBoss = project(
      [
        material("mat_a", "Drop A", 0, 1, [{ sourceType: "weekly_boss", sourceKey: "weekly_1" }]),
        material("mat_b", "Drop B", 1, 0, [{ sourceType: "weekly_boss", sourceKey: "weekly_2" }]),
        material("mat_dream_solvent", "Dream Solvent", 0, 1),
      ],
      { allowDreamSolvent: true },
    );

    expect(disabled.conversionActions).toEqual([]);
    expect(enabled.conversionActions[0]).toMatchObject({ catalystMaterialKey: "mat_dream_solvent", catalystQuantity: 1 });
    expect(differentBoss.conversionActions).toEqual([]);
    expect(differentBoss.missingAfterByMaterialKey.get("mat_b")).toBe(1);
  });

  function project(materials: InventoryProjectionMaterial[], options = {}) {
    return projection.project(materials, rules.buildRules(materials), options);
  }
});

function material(
  stableKey: string,
  name: string,
  required: number,
  directQuantity: number,
  sourceOptions: CraftingRuleMaterial["sourceOptions"] = [],
): InventoryProjectionMaterial {
  return {
    materialId: stableKey.length,
    stableKey,
    name,
    required,
    directQuantity,
    sourceTypes: sourceOptions.map((source) => source.sourceType),
    sourceOptions,
  };
}
