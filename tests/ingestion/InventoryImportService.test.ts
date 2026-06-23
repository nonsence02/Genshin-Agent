import { describe, expect, it } from "vitest";
import { InventoryKameraNormalizer, type MaterialResolutionEntry, type NormalizedInventoryItem } from "../../src/ingestion/normalizers/InventoryKameraNormalizer.js";
import { InventoryKameraProvider } from "../../src/ingestion/providers/InventoryKameraProvider.js";
import { InventoryImportService, type InventoryImportRepository } from "../../src/ingestion/services/InventoryImportService.js";

class MockInventoryImportRepository implements InventoryImportRepository {
  writes = 0;

  async findOrCreatePlayer(stableKey: string): Promise<{ id: number; stableKey: string; displayName: string }> {
    this.writes += 1;
    return { id: 1, stableKey, displayName: stableKey };
  }

  async listMaterialsForResolution(): Promise<MaterialResolutionEntry[]> {
    return [
      { id: 1, stableKey: "mat_mora", name: "Mora", aliases: [{ alias: "Mora", normalized: "mora" }] },
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
  }

  async createInventorySnapshot(): Promise<{ id: number }> {
    this.writes += 1;
    return { id: 10 };
  }

  async replaceInventoryItems(_snapshotId: number, items: NormalizedInventoryItem[]): Promise<number> {
    this.writes += 1;
    return items.length;
  }
}

describe("InventoryImportService", () => {
  it("dry-run does not write to the repository", async () => {
    const repository = new MockInventoryImportRepository();
    const service = new InventoryImportService(new InventoryKameraProvider(), new InventoryKameraNormalizer(), repository);

    const result = await service.importSnapshot({
      playerStableKey: "default",
      filePath: "tests/fixtures/inventory-kamera-good.sample.json",
      dryRun: true,
    });

    expect(result.snapshotId).toBeNull();
    expect(result.totalRawItemsParsed).toBe(4);
    expect(result.resolvedMaterialItems).toBe(3);
    expect(result.unresolvedItems).toBe(1);
    expect(result.skippedInvalidItems).toBe(1);
    expect(repository.writes).toBe(0);
  });

  it("creates a snapshot and items when not dry-run", async () => {
    const repository = new MockInventoryImportRepository();
    const service = new InventoryImportService(new InventoryKameraProvider(), new InventoryKameraNormalizer(), repository);

    const result = await service.importSnapshot({
      playerStableKey: "default",
      filePath: "tests/fixtures/inventory-kamera-good.sample.json",
    });

    expect(result.snapshotId).toBe(10);
    expect(result.resolvedMaterialItems).toBe(3);
    expect(repository.writes).toBe(3);
  });

  // TODO: add PostgreSQL integration coverage once test database lifecycle is configured.
});
