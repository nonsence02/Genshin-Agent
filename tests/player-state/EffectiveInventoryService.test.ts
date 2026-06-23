import { describe, expect, it } from "vitest";
import { EffectiveInventoryService } from "../../src/player-state/services/EffectiveInventoryService.js";

describe("EffectiveInventoryService", () => {
  it("applies absolute override", async () => {
    const service = new EffectiveInventoryService(fakeClient({ overrides: [{ materialId: 1, mode: "absolute", quantity: 40 }] }));

    const result = await service.resolve({ playerKey: "default" });

    expect(result.items[0]).toMatchObject({
      snapshotQuantity: 10,
      overrideMode: "absolute",
      overrideQuantity: 40,
      effectiveQuantity: 40,
      overrideActive: true,
    });
    expect(result.overridesApplied).toBe(1);
  });

  it("applies delta override", async () => {
    const service = new EffectiveInventoryService(fakeClient({ overrides: [{ materialId: 1, mode: "delta", quantity: 5 }] }));

    const result = await service.resolve({ playerKey: "default" });

    expect(result.items[0]).toMatchObject({ snapshotQuantity: 10, effectiveQuantity: 15 });
  });

  it("clamps negative delta to 0 with warning", async () => {
    const service = new EffectiveInventoryService(fakeClient({ overrides: [{ materialId: 1, mode: "delta", quantity: -50 }] }));

    const result = await service.resolve({ playerKey: "default" });

    expect(result.items[0].effectiveQuantity).toBe(0);
    expect(result.warnings[0]).toContain("clamped effective quantity to 0");
  });

  it("creates effective item for override missing from snapshot", async () => {
    const service = new EffectiveInventoryService(fakeClient({ overrides: [{ materialId: 2, mode: "absolute", quantity: 7 }] }));

    const result = await service.resolve({ playerKey: "default" });

    expect(result.items.find((item) => item.materialId === 2)).toMatchObject({
      snapshotQuantity: 0,
      effectiveQuantity: 7,
      stableKey: "mat_lakelight_lily",
    });
  });
});

function fakeClient(options: { overrides: Array<{ materialId: number; mode: string; quantity: number }> }) {
  const materials = {
    1: { id: 1, stableKey: "mat_heros_wit", name: "Hero's Wit" },
    2: { id: 2, stableKey: "mat_lakelight_lily", name: "Lakelight Lily" },
  } as const;

  return {
    player: {
      findUnique: async () => ({ id: 1, stableKey: "default" }),
    },
    inventorySnapshot: {
      findFirst: async () => ({ id: 2, source: "inventory-kamera-good", capturedAt: new Date("2026-06-23T00:00:00.000Z") }),
    },
    inventoryItem: {
      findMany: async () => [
        {
          materialId: 1,
          quantity: 10,
          material: materials[1],
        },
      ],
    },
    manualInventoryOverride: {
      findMany: async () =>
        options.overrides.map((override) => ({
          ...override,
          playerId: 1,
          material: materials[override.materialId as 1 | 2],
        })),
    },
  } as never;
}
