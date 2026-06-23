import { describe, expect, it } from "vitest";
import { FarmTaskGroupingService } from "../../src/planner/services/FarmTaskGroupingService.js";
import type { FarmTask, FarmTaskPlan } from "../../src/planner/services/FarmTaskBuilder.js";

describe("FarmTaskGroupingService", () => {
  const service = new FarmTaskGroupingService();

  it("groups boss unique material and elemental gems by the same boss source", () => {
    const result = service.group(plan([
      task("mat_varunada_lazurite_chunk", "Varunada Lazurite Chunk", {
        sourceType: "boss",
        sourceKey: "enemy_aeonblight_drake",
        sourceName: "Aeonblight Drake",
        sourceOptions: [
          { sourceType: "boss", sourceKey: "enemy_aeonblight_drake", sourceName: "Aeonblight Drake" },
          { sourceType: "boss", sourceKey: "enemy_hydro_tulpa", sourceName: "Hydro Tulpa" },
        ],
        missing: 9,
      }),
      task("mat_water_that_failed_to_transcend", "Water That Failed To Transcend", {
        sourceType: "boss",
        sourceKey: "enemy_hydro_tulpa",
        sourceName: "Hydro Tulpa",
        missing: 46,
      }),
    ]));

    const hydroTulpa = result.resinGroups.find((group) => group.groupKey === "boss:enemy_hydro_tulpa");

    expect(hydroTulpa).toBeDefined();
    expect(hydroTulpa?.primaryMaterialKey).toBe("mat_water_that_failed_to_transcend");
    expect(hydroTulpa?.estimatedRuns).toBe(19);
    expect(hydroTulpa?.estimatedResin).toBe(760);
    expect(hydroTulpa?.materials).toEqual([
      expect.objectContaining({ materialKey: "mat_water_that_failed_to_transcend", role: "primary" }),
      expect.objectContaining({ materialKey: "mat_varunada_lazurite_chunk", role: "secondary" }),
    ]);
    expect(hydroTulpa?.warnings.some((warning) => warning.includes("Elemental gem drops"))).toBe(true);
  });

  it("groups domain books from the same domain and preserves calendar days", () => {
    const result = service.group(plan([
      task("mat_teachings_of_justice", "Teachings of Justice", domainTask()),
      task("mat_guide_to_justice", "Guide to Justice", domainTask({ missing: 42 })),
      task("mat_philosophies_of_justice", "Philosophies of Justice", domainTask({ missing: 60 })),
    ]));
    const domain = result.resinGroups[0];

    expect(domain?.groupKey).toBe("domain:domain_pale_forgotten_glory");
    expect(domain?.materials.map((material) => material.materialKey)).toEqual([
      "mat_philosophies_of_justice",
      "mat_guide_to_justice",
      "mat_teachings_of_justice",
    ]);
    expect(domain?.calendarDays).toEqual(["tuesday", "friday", "sunday"]);
    expect(domain?.estimatedRuns).toBeNull();
  });

  it("groups Mora and EXP ley lines separately", () => {
    const result = service.group(plan([
      task("mat_mora", "Mora", { sourceType: "ley_line", sourceKey: "ley_line_mora", sourceName: "Blossom of Wealth" }),
      task("mat_heros_wit", "Hero's Wit", { sourceType: "ley_line", sourceKey: "ley_line_exp", sourceName: "Blossom of Revelation" }),
      task("mat_wanderers_advice", "Wanderer's Advice", { sourceType: "ley_line", sourceKey: "ley_line_exp", sourceName: "Blossom of Revelation" }),
    ]));

    expect(result.resinGroups.map((group) => group.groupKey)).toEqual(["ley_line:ley_line_exp", "ley_line:ley_line_mora"]);
    expect(result.resinGroups.find((group) => group.groupKey === "ley_line:ley_line_exp")?.materials).toHaveLength(2);
  });

  it("keeps local specialties per material and groups enemy drops by source", () => {
    const result = service.group({
      resinTasks: [],
      openWorldTasks: [
        task("mat_lakelight_lily", "Lakelight Lily", { sourceType: "local_specialty", sourceKey: undefined, sourceName: "Erinnyes Forest", openWorld: true }),
        task("mat_enemy_a", "Enemy A", { sourceType: "enemy", sourceKey: "enemy_whopperflower", sourceName: "Whopperflower", openWorld: true }),
        task("mat_enemy_b", "Enemy B", { sourceType: "enemy", sourceKey: "enemy_whopperflower", sourceName: "Whopperflower", openWorld: true }),
      ],
      unknownTasks: [],
      warnings: [],
    });

    expect(result.openWorldGroups.map((group) => group.groupKey)).toEqual([
      "enemy:enemy_whopperflower",
      "local_specialty:material:mat_lakelight_lily",
    ]);
    expect(result.openWorldGroups[0]?.materials).toHaveLength(2);
  });

  it("sorts groups deterministically by farm priority and source key", () => {
    const result = service.group(plan([
      task("mat_ley", "Ley", { sourceType: "ley_line", sourceKey: "ley_line_exp" }),
      task("mat_domain", "Domain", { sourceType: "domain", sourceKey: "domain_books" }),
      task("mat_boss", "Boss", { sourceType: "boss", sourceKey: "enemy_boss" }),
      task("mat_weekly", "Weekly", { sourceType: "weekly_boss", sourceKey: "enemy_weekly", weeklyBoss: true }),
    ]));

    expect(result.resinGroups.map((group) => group.groupKey)).toEqual([
      "weekly_boss:enemy_weekly",
      "boss:enemy_boss",
      "domain:domain_books",
      "ley_line:ley_line_exp",
    ]);
  });
});

function plan(resinTasks: FarmTask[]): FarmTaskPlan {
  return {
    resinTasks,
    openWorldTasks: [],
    unknownTasks: [],
    warnings: [],
  };
}

function domainTask(overrides: Partial<FarmTask> = {}): Partial<FarmTask> {
  return {
    sourceType: "domain",
    sourceKey: "domain_pale_forgotten_glory",
    sourceName: "Pale Forgotten Glory",
    resinCostPerRun: 20,
    calendarDays: ["tuesday", "friday", "sunday"],
    ...overrides,
  };
}

function task(materialKey: string, materialName: string, overrides: Partial<FarmTask> = {}): FarmTask {
  return {
    materialId: materialKey.length,
    materialKey,
    materialName,
    required: 10,
    owned: 0,
    missing: 10,
    sourceType: "boss",
    sourceKey: "enemy_test",
    sourceName: "Test Enemy",
    sourceTypes: [overrides.sourceType ?? "boss"],
    sourceOptions: [],
    resinCostPerRun: overrides.sourceType === "ley_line" || overrides.sourceType === "domain" ? 20 : 40,
    estimatedRuns: null,
    estimatedResin: null,
    calendarDays: [],
    weeklyBoss: false,
    openWorld: false,
    notes: [],
    warnings: [],
    ...overrides,
  };
}
