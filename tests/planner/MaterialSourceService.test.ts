import { describe, expect, it } from "vitest";
import {
  MaterialSourceService,
  type FarmCalendarRow,
  type MaterialSourceMaterial,
  type MaterialSourceRepository,
  type MaterialSourceRow,
} from "../../src/planner/services/MaterialSourceService.js";

class MockMaterialSourceRepository implements MaterialSourceRepository {
  constructor(
    private readonly material: MaterialSourceMaterial | null,
    private readonly sources: MaterialSourceRow[],
    private readonly calendar: FarmCalendarRow[],
  ) {}

  async findMaterial(): Promise<MaterialSourceMaterial | null> {
    return this.material;
  }

  async listMaterialSources(): Promise<MaterialSourceRow[]> {
    return this.sources;
  }

  async listCalendarEntries(): Promise<FarmCalendarRow[]> {
    return this.calendar;
  }
}

describe("MaterialSourceService", () => {
  it("returns domain days from normalized calendar entries", async () => {
    const service = new MaterialSourceService(
      new MockMaterialSourceRepository(
        { id: 1, stableKey: "mat_philosophies_of_justice", name: "Philosophies of Justice" },
        [
          {
            sourceType: "domain",
            sourceKey: "domain_pale_forgotten_glory",
            sourceName: "Pale Forgotten Glory",
            resinCost: null,
            notes: "Domain reward: talent",
          },
        ],
        [
          { sourceType: "domain", sourceKey: "domain_pale_forgotten_glory", dayOfWeek: "friday", materialId: null },
          { sourceType: "domain", sourceKey: "domain_pale_forgotten_glory", dayOfWeek: "tuesday", materialId: null },
          { sourceType: "domain", sourceKey: "domain_pale_forgotten_glory", dayOfWeek: "sunday", materialId: null },
        ],
      ),
    );

    const result = await service.lookup({ materialKey: "mat_philosophies_of_justice" });

    expect(result.sources).toEqual([
      {
        sourceType: "domain",
        sourceKey: "domain_pale_forgotten_glory",
        sourceName: "Pale Forgotten Glory",
        days: ["tuesday", "friday", "sunday"],
        notes: "Domain reward: talent",
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("sorts enemy sources after boss/domain sources", async () => {
    const service = new MaterialSourceService(
      new MockMaterialSourceRepository(
        { id: 2, stableKey: "mat_whopperflower_nectar", name: "Whopperflower Nectar" },
        [
          { sourceType: "enemy", sourceKey: "enemy_cryo_whopperflower", sourceName: "Cryo Whopperflower", resinCost: null, notes: null },
          { sourceType: "shop", sourceKey: null, sourceName: null, resinCost: null, notes: "Stardust Exchange" },
        ],
        [],
      ),
    );

    const result = await service.lookup({ materialKey: "mat_whopperflower_nectar" });

    expect(result.sources.map((source) => source.sourceType)).toEqual(["enemy", "shop"]);
  });

  it("returns a warning when no normalized sources exist", async () => {
    const service = new MaterialSourceService(
      new MockMaterialSourceRepository({ id: 3, stableKey: "mat_unknown", name: "Unknown" }, [], []),
    );

    const result = await service.lookup({ materialKey: "mat_unknown" });

    expect(result.sources).toEqual([]);
    expect(result.warnings).toEqual(["No normalized sources found for mat_unknown"]);
  });

  it("adds curated ley line sources for Mora and EXP books", async () => {
    const mora = new MaterialSourceService(
      new MockMaterialSourceRepository({ id: 4, stableKey: "mat_mora", name: "Mora" }, [], []),
    );
    const heroWit = new MaterialSourceService(
      new MockMaterialSourceRepository({ id: 5, stableKey: "mat_heros_wit", name: "Hero's Wit" }, [], []),
    );

    await expect(mora.lookup({ materialKey: "mat_mora" })).resolves.toMatchObject({
      sources: [{ sourceType: "ley_line", sourceKey: "ley_line_mora", sourceName: "Blossom of Wealth", resinCost: 20 }],
      warnings: [],
    });
    await expect(heroWit.lookup({ materialKey: "mat_heros_wit" })).resolves.toMatchObject({
      sources: [{ sourceType: "ley_line", sourceKey: "ley_line_exp", sourceName: "Blossom of Revelation", resinCost: 20 }],
      warnings: [],
    });
  });
});
