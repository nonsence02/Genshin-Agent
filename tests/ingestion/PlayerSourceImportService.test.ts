import { describe, expect, it } from "vitest";
import type { CharacterResolutionEntry } from "../../src/ingestion/normalizers/HoyolabProfileNormalizer.js";
import type { MaterialResolutionEntry, NormalizedInventoryItem } from "../../src/ingestion/normalizers/InventoryKameraNormalizer.js";
import type { NormalizedPlayerWeapon } from "../../src/ingestion/normalizers/InventoryKameraWeaponsNormalizer.js";
import { PlayerSourceImportService, type PlayerSourceImportRepository } from "../../src/ingestion/services/PlayerSourceImportService.js";
import type { NormalizedHoyolabCharacter } from "../../src/ingestion/normalizers/HoyolabProfileNormalizer.js";

class MockPlayerSourceRepository implements PlayerSourceImportRepository {
  writes = 0;

  async findOrCreatePlayer(stableKey: string): Promise<{ id: number; stableKey: string }> {
    this.writes += 1;
    return { id: 1, stableKey };
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
    ];
  }

  async listCharactersForResolution(): Promise<CharacterResolutionEntry[]> {
    return [
      { id: 1, stableKey: "char_skirk", name: "Skirk", aliases: [{ alias: "Skirk", normalized: "skirk" }] },
      { id: 2, stableKey: "char_kaeya", name: "Kaeya", aliases: [{ alias: "Kaeya", normalized: "kaeya" }] },
    ];
  }

  async createInventorySnapshot(): Promise<{ id: number }> {
    this.writes += 1;
    return { id: 10 };
  }

  async replaceInventoryItems(_snapshotId: number, _items: NormalizedInventoryItem[]): Promise<number> {
    this.writes += 1;
    return 1;
  }

  async replacePlayerWeapons(_playerId: number, _source: string, _weapons: NormalizedPlayerWeapon[]): Promise<number> {
    this.writes += 1;
    return 1;
  }

  async replacePlayerCharacters(
    _playerId: number,
    _source: string,
    _characters: NormalizedHoyolabCharacter[],
  ): Promise<number> {
    this.writes += 1;
    return 1;
  }
}

describe("PlayerSourceImportService", () => {
  it("dry-run does not write and reports all source sections", async () => {
    const repository = new MockPlayerSourceRepository();
    const service = new PlayerSourceImportService(repository);

    const result = await service.importSources({
      playerStableKey: "default",
      goodFile: "tests/fixtures/inventory-kamera-good.realistic.sample.json",
      weaponsFile: "tests/fixtures/inventory-kamera-weapons.sample.json",
      hoyolabFile: "tests/fixtures/hoyolab-profile.sample.json",
      dryRun: true,
    });

    expect(repository.writes).toBe(0);
    expect(result.materialsParsed).toBe(3);
    expect(result.materialsResolved).toBe(2);
    expect(result.materialsUnresolved).toBe(1);
    expect(result.goodCharactersParsed).toBe(1);
    expect(result.goodCharactersResolved).toBe(1);
    expect(result.goodArtifactsParsed).toBe(1);
    expect(result.weaponsParsed).toBe(1);
    expect(result.hoyolabCharactersParsed).toBe(2);
    expect(result.hoyolabCharactersResolved).toBe(1);
    expect(result.hoyolabCharactersUnresolved).toBe(1);
  });
});
