import { describe, expect, it } from "vitest";
import { InventoryKameraProvider } from "../../src/ingestion/providers/InventoryKameraProvider.js";

describe("InventoryKameraProvider", () => {
  it("parses a small GOOD-like JSON fixture", async () => {
    const snapshot = await new InventoryKameraProvider().readSnapshot("tests/fixtures/inventory-kamera-good.sample.json");

    expect(snapshot.fileHash).toEqual(expect.any(String));
    expect(snapshot.metadata.format).toBe("GOOD");
    expect(snapshot.items).toHaveLength(4);
    expect(snapshot.skippedInvalidItems).toHaveLength(1);
    expect(snapshot.items.find((item) => item.rawName === "Mora")?.quantity).toBe(12345);
  });
});
