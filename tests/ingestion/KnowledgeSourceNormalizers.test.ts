import { describe, expect, it } from "vitest";
import { DomainNormalizer } from "../../src/ingestion/normalizers/DomainNormalizer.js";
import { EnemyNormalizer } from "../../src/ingestion/normalizers/EnemyNormalizer.js";
import { normalizeFarmDay, FarmCalendarNormalizer } from "../../src/ingestion/normalizers/FarmCalendarNormalizer.js";
import { MaterialSourceNormalizer } from "../../src/ingestion/normalizers/MaterialSourceNormalizer.js";

describe("knowledge source normalizers", () => {
  it("normalizes common farm calendar day names", () => {
    expect(normalizeFarmDay("Mon")).toBe("monday");
    expect(normalizeFarmDay("Tuesday")).toBe("tuesday");
    expect(normalizeFarmDay("Sun")).toBe("sunday");
    expect(normalizeFarmDay("bad-day")).toBeNull();
    expect(new FarmCalendarNormalizer().normalizeDays(["Mon", "Monday", "Fri"])).toEqual(["monday", "friday"]);
  });

  it("normalizes a domain and extracts material rewards", () => {
    const domain = new DomainNormalizer().normalize({
      id: 1,
      externalKey: "Domain of Mastery: Admonishing Engraving I",
      sourceVersion: "test",
      payload: {
        name: "Domain of Mastery: Admonishing Engraving I",
        entranceName: "Pale Forgotten Glory",
        regionName: "Fontaine",
        domainText: "Talent Level-Up Material",
        recommendedLevel: 38,
        daysOfWeek: ["Tuesday", "Friday", "Sunday"],
        rewardPreview: [{ name: "Teachings of Justice", rarity: 2 }],
      },
    });

    expect(domain.stableKey).toBe("domain_pale_forgotten_glory");
    expect(domain.name).toBe("Pale Forgotten Glory");
    expect(domain.daysOfWeek).toEqual(["Tuesday", "Friday", "Sunday"]);
    expect(domain.rewards).toMatchObject([
      {
        materialName: "Teachings of Justice",
        rewardType: "talent",
        level: 38,
        rarity: 2,
      },
    ]);
  });

  it("normalizes an enemy and extracts material drops", () => {
    const enemy = new EnemyNormalizer().normalize({
      id: 2,
      externalKey: "Cryo Whopperflower",
      sourceVersion: "test",
      payload: {
        name: "Cryo Whopperflower",
        enemyType: "NORMAL",
        investigation: { name: "Whopperflower" },
        rewardPreview: [
          { name: "Mora" },
          { name: "Whopperflower Nectar", rarity: 1 },
        ],
      },
    });

    expect(enemy.stableKey).toBe("enemy_cryo_whopperflower");
    expect(enemy.family).toBe("Whopperflower");
    expect(enemy.drops).toMatchObject([{ materialName: "Whopperflower Nectar", dropType: "drop", rarity: 1 }]);
  });

  it("creates conservative material sources and reports unresolved drop text", () => {
    const extracted = new MaterialSourceNormalizer().extractFromMaterial({
      id: 3,
      externalKey: "Lakelight Lily",
      sourceVersion: "test",
      payload: {
        name: "Lakelight Lily",
        typeText: "Local Specialty (Fontaine)",
        sources: ["Recommendation: Found in Erinnyes Forest", "Dropped by something unknown"],
      },
    });

    expect(extracted.sources).toMatchObject([
      {
        materialName: "Lakelight Lily",
        sourceType: "local_specialty",
        notes: "Recommendation: Found in Erinnyes Forest",
      },
    ]);
    expect(extracted.warnings).toHaveLength(1);
  });
});
