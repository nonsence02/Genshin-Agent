import { describe, expect, it } from "vitest";
import { ResinPlanService, type ResinPlanFarmTaskBuilder, type ResinPlanInventoryDiffService } from "../../src/planner/services/ResinPlanService.js";
import type { FarmTaskPlan } from "../../src/planner/services/FarmTaskBuilder.js";
import type { CharacterInventoryDiffResult } from "../../src/planner/services/InventoryDiffService.js";

class MockInventoryDiff implements ResinPlanInventoryDiffService {
  lastInput: Parameters<ResinPlanInventoryDiffService["diffCharacter"]>[0] | null = null;

  constructor(private readonly result = diff()) {}

  async diffCharacter(input: Parameters<ResinPlanInventoryDiffService["diffCharacter"]>[0]): Promise<CharacterInventoryDiffResult> {
    this.lastInput = input;
    return this.result;
  }
}

class MockTaskBuilder implements ResinPlanFarmTaskBuilder {
  constructor(private readonly result: FarmTaskPlan) {}

  async build(): Promise<FarmTaskPlan> {
    return this.result;
  }
}

describe("ResinPlanService", () => {
  it("does not exceed daily resin budget and schedules boss tasks any day", async () => {
    const result = await planWithTasks([
      task("mat_boss", { sourceType: "boss", resinCostPerRun: 40, estimatedRuns: 10, estimatedResin: 400, missing: 25 }),
    ], { days: 2, dailyResinBudget: 80, startDate: "2026-06-22" });

    expect(result.schedule.map((day) => day.plannedResin)).toEqual([80, 80]);
    expect(result.schedule.every((day) => day.plannedResin <= day.resinBudget)).toBe(true);
    expect(result.summary.unscheduledResinTasks).toBe(1);
  });

  it("only schedules domain placeholders on valid calendar days", async () => {
    const result = await planWithTasks([
      task("mat_domain", {
        sourceType: "domain",
        resinCostPerRun: 20,
        estimatedRuns: null,
        calendarDays: ["wednesday"],
      }),
    ], { days: 3, dailyResinBudget: 180, startDate: "2026-06-22" });

    expect(result.schedule[0]?.tasks).toEqual([]);
    expect(result.schedule[1]?.tasks).toEqual([]);
    expect(result.schedule[2]?.dayOfWeek).toBe("wednesday");
    expect(result.schedule[2]?.tasks[0]).toMatchObject({ materialKey: "mat_domain", taskType: "placeholder", resin: 20 });
  });

  it("allows Sunday domain scheduling when Sunday is in calendar days", async () => {
    const result = await planWithTasks([
      task("mat_sunday_domain", {
        sourceType: "domain",
        resinCostPerRun: 20,
        estimatedRuns: null,
        calendarDays: ["sunday"],
      }),
    ], { days: 1, dailyResinBudget: 180, startDate: "2026-06-28" });

    expect(result.schedule[0]?.dayOfWeek).toBe("sunday");
    expect(result.schedule[0]?.tasks[0]?.materialKey).toBe("mat_sunday_domain");
  });

  it("keeps open-world tasks separate and resin-free", async () => {
    const result = await planWithTasks([], {
      farmTasks: {
        resinTasks: [],
        openWorldTasks: [task("mat_local", { sourceType: "local_specialty", openWorld: true, estimatedRuns: 0, estimatedResin: 0 })],
        unknownTasks: [],
        warnings: [],
      },
    });

    expect(result.schedule.every((day) => day.plannedResin === 0)).toBe(true);
    expect(result.openWorldTasks).toHaveLength(1);
    expect(result.summary.openWorldTasks).toBe(1);
  });

  it("applies weekly boss discounted cost policy", async () => {
    const result = await planWithTasks([
      task("mat_weekly", {
        sourceType: "weekly_boss",
        sourceKey: "enemy_weekly",
        weeklyBoss: true,
        estimatedRuns: null,
        resinCostPerRun: null,
      }),
    ], { days: 1, dailyResinBudget: 180, startDate: "2026-06-22", discountedWeeklyBossClaimsUsed: 2 });

    expect(result.schedule[0]?.tasks[0]).toMatchObject({
      taskType: "weekly_boss_claim",
      materialKey: "mat_weekly",
      resin: 30,
    });
  });

  it("sets blocked day resin budget to zero and schedules no resin tasks", async () => {
    const result = await planWithTasks([
      task("mat_boss", { sourceType: "boss", resinCostPerRun: 40, estimatedRuns: 1, estimatedResin: 40 }),
    ], {
      days: 1,
      startDate: "2026-06-24",
      preferences: { availability: { blockedDaysOfWeek: ["wednesday"] } },
    });

    expect(result.schedule[0]).toMatchObject({ dayOfWeek: "wednesday", blocked: true, resinBudget: 0, plannedResin: 0, tasks: [] });
  });

  it("applies daily resin budget and maxResinByDayOfWeek preferences", async () => {
    const result = await planWithTasks([
      task("mat_boss", { sourceType: "boss", resinCostPerRun: 40, estimatedRuns: 10, estimatedResin: 400 }),
    ], {
      days: 1,
      startDate: "2026-06-22",
      preferences: { dailyResinBudget: 160, availability: { maxResinByDayOfWeek: { monday: 80 } } },
    });

    expect(result.schedule[0]).toMatchObject({ resinBudgetBase: 80, plannedResin: 80 });
  });

  it("moves excluded source types to excludedTasks", async () => {
    const result = await planWithTasks([
      task("mat_event", { sourceType: "event", sourceKey: "event_test" }),
    ], { preferences: { sourceFilters: { excludedSourceTypes: ["event"] } } });

    expect(result.excludedTasks).toMatchObject([{ sourceType: "event", reason: "source type event is excluded" }]);
    expect(result.schedule.flatMap((day) => day.tasks)).toEqual([]);
  });

  it("moves excluded materials to excludedTasks", async () => {
    const result = await planWithTasks([
      task("mat_crown_of_insight", { sourceType: "event", sourceKey: "event_test" }),
    ], {
      preferences: {
        manualTaskExclusions: [{ materialKey: "mat_crown_of_insight", reason: "save crowns" }],
      },
    });

    expect(result.excludedTasks).toMatchObject([{ materialKey: "mat_crown_of_insight", reason: "save crowns" }]);
  });

  it("skips already claimed weekly bosses", async () => {
    const result = await planWithTasks([
      task("mat_weekly", {
        sourceType: "weekly_boss",
        sourceKey: "enemy_weekly",
        weeklyBoss: true,
        estimatedRuns: null,
        resinCostPerRun: null,
      }),
    ], { preferences: { weeklyBosses: { alreadyClaimedSourceKeys: ["enemy_weekly"] } } });

    expect(result.excludedTasks[0]).toMatchObject({ sourceKey: "enemy_weekly" });
    expect(result.schedule.flatMap((day) => day.tasks)).toEqual([]);
  });

  it("does not use fragile resin by default", async () => {
    const result = await planWithTasks([
      task("mat_boss", { sourceType: "boss", resinCostPerRun: 40, estimatedRuns: 10, estimatedResin: 400 }),
    ], { days: 1, dailyResinBudget: 80 });

    expect(result.fragileResinUsed).toEqual({ used: 0, resinAdded: 0 });
    expect(result.schedule[0]?.resinBudget).toBe(80);
  });

  it("allowed fragile resin increases available resin deterministically", async () => {
    const result = await planWithTasks([
      task("mat_boss", { sourceType: "boss", resinCostPerRun: 40, estimatedRuns: 10, estimatedResin: 400 }),
    ], { days: 1, dailyResinBudget: 80, preferences: { fragileResin: { allowed: true, maxToUse: 1 } } });

    expect(result.fragileResinUsed).toEqual({ used: 1, resinAdded: 60 });
    expect(result.schedule[0]?.resinBudget).toBe(140);
    expect(result.schedule[0]?.plannedResin).toBe(120);
    expect(result.warnings.some((warning) => warning.includes("Fragile resin is applied greedily"))).toBe(true);
  });

  it("accepts plan style and includes it in output", async () => {
    const result = await planWithTasks([], { preferences: { planStyle: "low_effort" } });

    expect(result.preferencesApplied.planStyle).toBe("low_effort");
    expect(result.warnings.some((warning) => warning.includes("low_effort"))).toBe(true);
  });

  it("creates warnings for unscheduled null-estimate tasks", async () => {
    const result = await planWithTasks([
      task("mat_domain", {
        sourceType: "domain",
        resinCostPerRun: 20,
        estimatedRuns: null,
        calendarDays: ["wednesday"],
      }),
    ], { days: 1, dailyResinBudget: 180, startDate: "2026-06-22" });

    expect(result.summary.unscheduledResinTasks).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("No placeholder could be scheduled"))).toBe(true);
  });

  it("uses deterministic scheduling priority", async () => {
    const result = await planWithTasks([
      task("mat_ley", { sourceType: "ley_line", resinCostPerRun: 20, estimatedRuns: 1, estimatedResin: 20 }),
      task("mat_boss", { sourceType: "boss", resinCostPerRun: 40, estimatedRuns: 1, estimatedResin: 40 }),
      task("mat_weekly", { sourceType: "weekly_boss", sourceKey: "weekly", weeklyBoss: true, estimatedRuns: null, resinCostPerRun: null }),
    ], { days: 1, dailyResinBudget: 90, startDate: "2026-06-22" });

    expect(result.schedule[0]?.tasks.map((scheduled) => scheduled.materialKey)).toEqual(["mat_weekly", "mat_boss", "mat_ley"]);
    expect(result.schedule[0]?.plannedResin).toBe(90);
  });

  it("schedules grouped boss source once instead of duplicating gem and boss material resin", async () => {
    const result = await planWithTasks([
      task("mat_varunada_lazurite_chunk", {
        materialName: "Varunada Lazurite Chunk",
        sourceType: "boss",
        sourceKey: "enemy_aeonblight_drake",
        sourceName: "Aeonblight Drake",
        missing: 9,
        sourceOptions: [
          { sourceType: "boss", sourceKey: "enemy_aeonblight_drake", sourceName: "Aeonblight Drake" },
          { sourceType: "boss", sourceKey: "enemy_hydro_tulpa", sourceName: "Hydro Tulpa" },
        ],
      }),
      task("mat_water_that_failed_to_transcend", {
        materialName: "Water That Failed To Transcend",
        sourceType: "boss",
        sourceKey: "enemy_hydro_tulpa",
        sourceName: "Hydro Tulpa",
        missing: 46,
      }),
    ], { days: 7, dailyResinBudget: 180, startDate: "2026-06-22" });

    const scheduledHydroTulpaTasks = result.schedule.flatMap((day) =>
      day.tasks.filter((scheduled) => scheduled.groupKey === "boss:enemy_hydro_tulpa"),
    );

    expect(result.sourceGroups.find((group) => group.groupKey === "boss:enemy_hydro_tulpa")?.materials).toEqual([
      expect.objectContaining({ materialKey: "mat_water_that_failed_to_transcend", role: "primary" }),
      expect.objectContaining({ materialKey: "mat_varunada_lazurite_chunk", role: "secondary" }),
    ]);
    expect(scheduledHydroTulpaTasks.reduce((sum, scheduled) => sum + (scheduled.runs ?? 0), 0)).toBe(19);
    expect(scheduledHydroTulpaTasks.reduce((sum, scheduled) => sum + (scheduled.resin ?? 0), 0)).toBe(760);
  });

  it("forwards crafting options to the inventory diff layer", async () => {
    const inventoryDiff = new MockInventoryDiff();
    const service = new ResinPlanService(inventoryDiff, new MockTaskBuilder({ resinTasks: [], openWorldTasks: [], unknownTasks: [], warnings: [] }));

    await service.plan({
      playerKey: "default",
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
      useCrafting: true,
      allowDustOfAzoth: true,
      allowDreamSolvent: true,
    });

    expect(inventoryDiff.lastInput).toMatchObject({
      useCrafting: true,
      allowDustOfAzoth: true,
      allowDreamSolvent: true,
    });
  });
});

async function planWithTasks(
  resinTasks: FarmTaskPlan["resinTasks"],
  options: Partial<Parameters<ResinPlanService["plan"]>[0]> & { farmTasks?: FarmTaskPlan } = {},
) {
  const farmTasks: FarmTaskPlan = options.farmTasks ?? {
    resinTasks,
    openWorldTasks: [],
    unknownTasks: [],
    warnings: [],
  };
  const service = new ResinPlanService(new MockInventoryDiff(), new MockTaskBuilder(farmTasks));

  return service.plan({
    playerKey: "default",
    characterKey: "char_furina",
    currentLevel: 20,
    targetLevel: 90,
    startDate: "2026-06-22",
    days: 7,
    ...options,
  });
}

function diff(): CharacterInventoryDiffResult {
  return {
    player: { id: 1, stableKey: "default" },
    character: { id: 1, stableKey: "char_furina", name: "Furina" },
    inventorySnapshot: { id: 1, source: "test", createdAt: "2026-06-23T00:00:00.000Z" },
    goal: {
      currentLevel: 20,
      targetLevel: 90,
      currentTalents: { normal: 1, skill: 1, burst: 1 },
      targetTalents: { normal: 1, skill: 9, burst: 10 },
    },
    summary: {
      totalMaterials: 1,
      satisfiedMaterials: 0,
      missingMaterials: 1,
      totalRequiredQuantity: 1,
      totalOwnedQuantityForRequiredMaterials: 0,
    },
    materials: [],
    warnings: [],
  };
}

function task(
  materialKey: string,
  overrides: Partial<FarmTaskPlan["resinTasks"][number]> = {},
): FarmTaskPlan["resinTasks"][number] {
  return {
    materialId: 1,
    materialKey,
    materialName: materialKey,
    missing: 10,
    sourceType: "boss",
    sourceName: materialKey,
    sourceKey: materialKey,
    resinCostPerRun: 40,
    estimatedRuns: 1,
    estimatedResin: 40,
    calendarDays: [],
    weeklyBoss: false,
    openWorld: false,
    notes: [],
    warnings: [],
    ...overrides,
  };
}
