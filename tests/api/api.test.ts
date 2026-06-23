import { describe, expect, it } from "vitest";
import { createApp, type ApiServices } from "../../src/api/createApp.js";

const requirementPayload = {
  characterKey: "char_furina",
  currentLevel: 20,
  targetLevel: 90,
  currentTalents: { normal: 1, skill: 1, burst: 1 },
  targetTalents: { normal: 1, skill: 9, burst: 10 },
};

const diffPayload = {
  playerKey: "default",
  ...requirementPayload,
  inventorySnapshotId: 2,
  usePlayerState: false,
  useCrafting: true,
};

function mockServices(): ApiServices {
  return {
    materialSources: {
      async lookup() {
        return {
          material: { id: 1, stableKey: "mat_water_that_failed_to_transcend", name: "Water That Failed To Transcend" },
          sources: [
            {
              sourceType: "boss",
              sourceKey: "enemy_hydro_tulpa",
              sourceName: "Hydro Tulpa",
              resinCost: 40,
              days: ["monday"],
            },
          ],
          warnings: [],
        };
      },
    },
    materialClassifier: {
      classify(input) {
        return {
          ...input.material,
          sourceTypes: ["boss"],
          primarySourceType: "boss",
          resinGated: true,
          resinCostPerRun: 40,
          weeklyBoss: false,
          openWorld: false,
          calendarDays: ["monday"],
          notes: [],
          warnings: [],
        };
      },
    },
    characterRequirements: {
      async calculate(input) {
        return {
          character: { id: 37, stableKey: input.characterKey, name: "Furina" },
          ascension: { currentPhase: 0, targetPhase: 6, includedPhases: [1, 2, 3, 4, 5, 6] },
          talents: {
            normal: { current: 1, target: 1, includedLevels: [] },
            skill: { current: 1, target: 9, includedLevels: [2, 3, 4, 5, 6, 7, 8, 9] },
            burst: { current: 1, target: 10, includedLevels: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
          },
          materials: [{ materialId: 1, stableKey: "mat_mora", name: "Mora", quantity: 100, sources: ["level_mora"], breakdown: [] }],
          warnings: [],
        };
      },
    },
    inventoryDiff: {
      async diffCharacter(input) {
        return {
          player: { id: 1, stableKey: input.playerKey },
          character: { id: 37, stableKey: input.characterKey, name: "Furina" },
          inventorySnapshot: { id: input.inventorySnapshotId ?? 1, source: "test", createdAt: "2026-06-23T00:00:00.000Z" },
          goal: {
            currentLevel: input.currentLevel ?? 20,
            targetLevel: input.targetLevel,
            currentTalents: { normal: 1, skill: 1, burst: 1 },
            targetTalents: { normal: 1, skill: 9, burst: 10 },
          },
          summary: {
            totalMaterials: 1,
            satisfiedMaterials: 1,
            missingMaterials: 0,
            totalRequiredQuantity: 1,
            totalOwnedQuantityForRequiredMaterials: 1,
          },
          materials: [],
          craftingActions: input.useCrafting ? [] : undefined,
          conversionActions: [],
          warnings: [],
        };
      },
    },
    resinPlan: {
      async plan(input) {
        return {
          goal: {
            playerKey: input.playerKey,
            characterKey: input.characterKey,
            currentLevel: input.currentLevel ?? 20,
            targetLevel: input.targetLevel,
            currentTalents: { normal: 1, skill: 1, burst: 1 },
            targetTalents: { normal: 1, skill: 9, burst: 10 },
          },
          inventoryDiff: await mockServices().inventoryDiff.diffCharacter(input),
          farmTasks: { resinTasks: [], openWorldTasks: [], unknownTasks: [], warnings: [] },
          sourceGroups: [],
          schedule: [],
          openWorldTasks: [],
          unknownTasks: [],
          openWorldGroups: [],
          unknownGroups: [],
          summary: {
            totalMissingMaterials: 0,
            totalEstimatedResin: 0,
            scheduledEstimatedResin: 0,
            unscheduledResinTasks: 0,
            openWorldTasks: 0,
            unknownTasks: 0,
          },
          warnings: [],
        };
      },
    },
    levelCosts: {
      calculate(input) {
        return {
          currentLevel: input.currentLevel,
          targetLevel: input.targetLevel,
          totalExp: 1000,
          levelUpMora: 200,
          expBooks: [],
          overflowExp: 0,
          warnings: [],
        };
      },
    },
    effectiveInventory: {
      async resolve(input) {
        return {
          player: { id: 1, stableKey: input.playerKey },
          snapshot: { id: input.inventorySnapshotId ?? 2, source: "test", createdAt: "2026-06-23T00:00:00.000Z" },
          items: [
            {
              materialId: 1,
              stableKey: "mat_heros_wit",
              name: "Hero's Wit",
              snapshotQuantity: 26,
              overrideMode: "absolute",
              overrideQuantity: 40,
              effectiveQuantity: 40,
              overrideActive: true,
            },
          ],
          overridesApplied: input.includeManualOverrides === false ? 0 : 1,
          warnings: [],
        };
      },
    },
    manualInventoryOverrides: {
      async listOverrides(playerKey) {
        return [
          {
            id: 1,
            player: { id: 1, stableKey: playerKey },
            material: { id: 1, stableKey: "mat_heros_wit", name: "Hero's Wit" },
            mode: "absolute",
            quantity: 40,
            reason: "manual correction",
            active: true,
            createdAt: "2026-06-23T00:00:00.000Z",
            updatedAt: "2026-06-23T00:00:00.000Z",
          },
        ];
      },
      async upsertOverride(playerKey, materialKey, input) {
        return {
          id: 1,
          player: { id: 1, stableKey: playerKey },
          material: { id: 1, stableKey: materialKey, name: "Hero's Wit" },
          mode: input.mode,
          quantity: input.quantity,
          reason: input.reason,
          active: input.active ?? true,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z",
        };
      },
      async deactivateOverride(playerKey, materialKey) {
        return {
          id: 1,
          player: { id: 1, stableKey: playerKey },
          material: { id: 1, stableKey: materialKey, name: "Hero's Wit" },
          mode: "absolute",
          quantity: 40,
          active: false,
          createdAt: "2026-06-23T00:00:00.000Z",
          updatedAt: "2026-06-23T00:00:00.000Z",
        };
      },
      async clearOverrides(playerKey) {
        return { player: { id: 1, stableKey: playerKey }, deactivated: 1 };
      },
    },
  };
}

describe("local Fastify API", () => {
  it("GET /health returns ok", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "genshin-agent" });
  });

  it("returns material sources for a known material", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({ method: "GET", url: "/knowledge/materials/mat_philosophies_of_justice/sources" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ material: { stableKey: "mat_water_that_failed_to_transcend" } });
  });

  it("classifies material demand", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({ method: "GET", url: "/planner/materials/mat_water_that_failed_to_transcend/classification" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ primarySourceType: "boss", resinGated: true });
  });

  it("validates materialKey params", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({ method: "GET", url: "/planner/materials/%20/classification" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("calculates character requirements through the service", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({
      method: "POST",
      url: "/planner/character/requirements",
      payload: requirementPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ character: { stableKey: "char_furina" } });
  });

  it("validates character diff body", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({
      method: "POST",
      url: "/planner/character/diff",
      payload: { ...diffPayload, targetLevel: 91 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns craft-aware diff fields when requested", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({
      method: "POST",
      url: "/planner/character/diff",
      payload: diffPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ craftingActions: [] });
  });

  it("validates character plan body", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({
      method: "POST",
      url: "/planner/character/plan",
      payload: { ...diffPayload, days: 31 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns a character plan", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({
      method: "POST",
      url: "/planner/character/plan",
      payload: { ...diffPayload, days: 7 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ summary: { scheduledEstimatedResin: 0 } });
  });

  it("returns level costs", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({ method: "GET", url: "/planner/level-costs?currentLevel=20&targetLevel=90" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ currentLevel: 20, targetLevel: 90 });
  });

  it("returns structured 404 for unknown routes", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({ method: "GET", url: "/missing" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("exposes basic OpenAPI metadata", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({ method: "GET", url: "/docs/openapi.json" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ openapi: "3.1.0" });
  });

  it("returns effective inventory", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({ method: "GET", url: "/player/default/inventory/effective" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ overridesApplied: 1, items: [{ effectiveQuantity: 40 }] });
  });

  it("validates override payload", async () => {
    const app = await createApp({ services: mockServices() });
    const response = await app.inject({
      method: "PUT",
      url: "/player/default/inventory/overrides/mat_heros_wit",
      payload: { mode: "absolute", quantity: "not-a-number" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("upserts and deactivates manual overrides", async () => {
    const app = await createApp({ services: mockServices() });
    const put = await app.inject({
      method: "PUT",
      url: "/player/default/inventory/overrides/mat_heros_wit",
      payload: { mode: "absolute", quantity: 40, reason: "manual correction" },
    });
    const del = await app.inject({ method: "DELETE", url: "/player/default/inventory/overrides/mat_heros_wit" });

    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ quantity: 40, active: true });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toMatchObject({ active: false });
  });
});
