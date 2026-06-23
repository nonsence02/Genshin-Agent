import { describe, expect, it } from "vitest";
import type { CharacterInventoryDiffResult } from "../../src/planner/services/InventoryDiffService.js";
import { FarmTaskBuilder } from "../../src/planner/services/FarmTaskBuilder.js";
import { MaterialDemandClassifier } from "../../src/planner/services/MaterialDemandClassifier.js";
import type { MaterialSourceLookupResult } from "../../src/planner/services/MaterialSourceService.js";
import { ResinPolicy } from "../../src/planner/policies/ResinPolicy.js";
import { RunEstimateService } from "../../src/planner/services/RunEstimateService.js";

class MockSourceLookup {
  constructor(private readonly lookups: Record<string, MaterialSourceLookupResult>) {}

  async lookup(input: { materialKey?: string }): Promise<MaterialSourceLookupResult> {
    const lookup = input.materialKey ? this.lookups[input.materialKey] : undefined;

    if (!lookup) {
      throw new Error(`Missing mock lookup for ${input.materialKey}`);
    }

    return lookup;
  }
}

describe("FarmTaskBuilder", () => {
  it("creates boss, domain, open-world, enemy, and ley line tasks", async () => {
    const builder = new FarmTaskBuilder(
      new MockSourceLookup({
        mat_boss: lookup("mat_boss", "Boss Drop", [{ sourceType: "boss", sourceKey: "enemy_boss", sourceName: "Boss" }]),
        mat_domain: lookup("mat_domain", "Domain Book", [
          { sourceType: "domain", sourceKey: "domain_books", sourceName: "Book Domain", days: ["tuesday", "friday", "sunday"] },
        ]),
        mat_local: lookup("mat_local", "Local Specialty", [{ sourceType: "local_specialty", sourceName: "Open World" }]),
        mat_enemy: lookup("mat_enemy", "Enemy Drop", [{ sourceType: "enemy", sourceName: "Enemy" }]),
        mat_mora: lookup("mat_mora", "Mora", [{ sourceType: "ley_line", sourceName: "Blossom of Wealth", resinCost: 20 }]),
      }),
      new MaterialDemandClassifier(),
      new ResinPolicy(),
      new RunEstimateService(),
    );

    const result = await builder.build(diff(["mat_boss", "mat_domain", "mat_local", "mat_enemy", "mat_mora"]));

    expect(result.resinTasks.find((task) => task.materialKey === "mat_boss")).toMatchObject({
      sourceType: "boss",
      resinCostPerRun: 40,
      estimatedRuns: 4,
      estimatedResin: 160,
    });
    expect(result.resinTasks.find((task) => task.materialKey === "mat_domain")).toMatchObject({
      sourceType: "domain",
      resinCostPerRun: 20,
      estimatedRuns: null,
      calendarDays: ["tuesday", "friday", "sunday"],
    });
    expect(result.resinTasks.find((task) => task.materialKey === "mat_mora")).toMatchObject({
      sourceType: "ley_line",
      resinCostPerRun: 20,
      estimatedRuns: null,
    });
    expect(result.openWorldTasks.map((task) => task.materialKey)).toEqual(["mat_enemy", "mat_local"]);
    expect(result.unknownTasks).toEqual([]);
  });
});

function diff(keys: string[]): CharacterInventoryDiffResult {
  return {
    player: { id: 1, stableKey: "default" },
    character: { id: 1, stableKey: "char_test", name: "Test" },
    inventorySnapshot: { id: 1, source: "test", createdAt: "2026-06-23T00:00:00.000Z" },
    goal: {
      currentLevel: 20,
      targetLevel: 90,
      currentTalents: { normal: 1, skill: 1, burst: 1 },
      targetTalents: { normal: 1, skill: 9, burst: 10 },
    },
    summary: {
      totalMaterials: keys.length,
      satisfiedMaterials: 0,
      missingMaterials: keys.length,
      totalRequiredQuantity: 10 * keys.length,
      totalOwnedQuantityForRequiredMaterials: 0,
    },
    materials: keys.map((key, index) => ({
      materialId: index + 1,
      stableKey: key,
      name: key,
      required: 10,
      owned: 0,
      missing: 10,
      status: "missing" as const,
      sources: ["ascension"],
      breakdown: [],
    })),
    warnings: [],
  };
}

function lookup(
  stableKey: string,
  name: string,
  sources: MaterialSourceLookupResult["sources"],
): MaterialSourceLookupResult {
  return {
    material: { id: 1, stableKey, name },
    sources,
    warnings: [],
  };
}
