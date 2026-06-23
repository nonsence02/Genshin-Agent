import { describe, expect, it } from "vitest";
import { ManualInventoryOverrideService } from "../../src/player-state/services/ManualInventoryOverrideService.js";

describe("ManualInventoryOverrideService", () => {
  it("validates material exists", async () => {
    const service = new ManualInventoryOverrideService({
      player: {
        findUnique: async () => ({ id: 1, stableKey: "default" }),
      },
      material: {
        findUnique: async () => null,
      },
    } as never);

    await expect(
      service.upsertOverride("default", "mat_missing", {
        mode: "absolute",
        quantity: 1,
      }),
    ).rejects.toThrow("Material not found: mat_missing");
  });

  it("rejects negative absolute quantity", async () => {
    const service = new ManualInventoryOverrideService({} as never);

    await expect(
      service.upsertOverride("default", "mat_heros_wit", {
        mode: "absolute",
        quantity: -1,
      }),
    ).rejects.toThrow("absolute quantity must be greater than or equal to 0");
  });
});
