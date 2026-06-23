import { describe, expect, it } from "vitest";
import { InventoryKameraNormalizer, type MaterialResolutionEntry } from "../../src/ingestion/normalizers/InventoryKameraNormalizer.js";

const materials: MaterialResolutionEntry[] = [
  {
    id: 1,
    stableKey: "mat_mora",
    name: "Mora",
    aliases: [{ alias: "Mora", normalized: "mora" }],
  },
  {
    id: 2,
    stableKey: "mat_lakelight_lily",
    name: "Lakelight Lily",
    aliases: [{ alias: "Lakelight Lily", normalized: "lakelight_lily" }],
  },
  {
    id: 3,
    stableKey: "mat_teachings_of_justice",
    name: "Teachings of Justice",
    aliases: [{ alias: "Teachings of Justice", normalized: "teachings_of_justice" }],
  },
];

describe("InventoryKameraNormalizer", () => {
  it("normalizes names and resolves through EntityAlias-like entries", () => {
    const result = new InventoryKameraNormalizer().normalize(
      [{ rawName: "Teachings of Justice", quantity: 3, sourcePayload: { key: "Teachings of Justice" } }],
      materials,
    );

    expect(result.resolvedItems).toHaveLength(1);
    expect(result.resolvedItems[0]).toMatchObject({
      normalizedName: "teachings_of_justice",
      materialId: 3,
      materialKey: "mat_teachings_of_justice",
      quantity: 3,
    });
  });

  it("resolves Inventory Kamera camelCase material keys deterministically", () => {
    const result = new InventoryKameraNormalizer().normalize(
      [{ rawName: "LakelightLily", key: "LakelightLily", quantity: 12, sourcePayload: { key: "LakelightLily" } }],
      materials,
    );

    expect(result.resolvedItems[0]?.materialKey).toBe("mat_lakelight_lily");
  });

  it("reports unresolved items and aggregates duplicate resolved materials", () => {
    const result = new InventoryKameraNormalizer().normalize(
      [
        { rawName: "Mora", quantity: 5, sourcePayload: {} },
        { rawName: "Mora", quantity: 7, sourcePayload: {} },
        { rawName: "Unknown Future Item", quantity: 1, sourcePayload: {} },
      ],
      materials,
    );

    expect(result.resolvedItems.find((item) => item.materialKey === "mat_mora")?.quantity).toBe(12);
    expect(result.unresolvedItems).toHaveLength(1);
    expect(result.unresolvedItems[0]?.rawName).toBe("Unknown Future Item");
  });

  it("skips invalid quantities", () => {
    const result = new InventoryKameraNormalizer().normalize(
      [{ rawName: "Mora", quantity: -1, sourcePayload: {} }],
      materials,
    );

    expect(result.items).toHaveLength(0);
    expect(result.skippedInvalidItems).toHaveLength(1);
  });
});
