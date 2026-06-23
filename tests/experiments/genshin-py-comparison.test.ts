import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildComparisonReport } from "../../src/experiments/genshin-py-comparison/comparisonReport.js";
import { extractGenshinPyCharacters, loadGenshinPyOutput } from "../../src/experiments/genshin-py-comparison/loadGenshinPyOutput.js";
import { loadHoyolabProfile } from "../../src/experiments/genshin-py-comparison/loadHoyolabProfile.js";
import { containsSecretLikeKey } from "../../src/experiments/genshin-py-comparison/normalize.js";
import type { CharacterComparisonRecord, DatabaseCharacterSource, LoadedCharacterSource } from "../../src/experiments/genshin-py-comparison/types.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs = [];
});

async function tempJson(payload: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "genshin-py-comparison-"));
  tempDirs.push(dir);
  const file = join(dir, "input.json");
  await writeFile(file, JSON.stringify(payload), "utf8");
  return file;
}

function source(records: CharacterComparisonRecord[], present = true): LoadedCharacterSource {
  return { present, records, warnings: [] };
}

function database(records: CharacterComparisonRecord[], present = true): DatabaseCharacterSource {
  return { present, player: present ? { id: 1, stableKey: "default" } : undefined, records, warnings: [] };
}

describe("genshin.py comparison experiment", () => {
  it("loads a synthetic hoyolab_profile fixture", async () => {
    const file = await tempJson({
      source: "hoyolab_calculator",
      uid: "synthetic",
      characters: {
        furina: {
          id: "furina",
          name_ru: "Фурина",
          level: 90,
          rarity: 5,
          constellation: 2,
          talents: { normal_attack: 1, elemental_skill: 10, elemental_burst: 10 },
          equipped_weapon: { name: "Splendor", level: 90, refinement: 1, rarity: 5 },
          equipped_artifacts: [{ slot: "flower", set_name: "Golden Troupe", main_stat: "HP" }],
        },
      },
    });

    const loaded = await loadHoyolabProfile(file);

    expect(loaded.present).toBe(true);
    expect(loaded.records).toHaveLength(1);
    expect(loaded.records[0]).toMatchObject({
      sourceKey: "furina",
      characterKey: "char_furina",
      level: 90,
      talentSkill: 10,
      equippedWeaponRefinement: 1,
    });
  });

  it("loads a synthetic genshin.py sanitized fixture defensively", async () => {
    const file = await tempJson({
      sanitized: true,
      calculator_characters: {
        furina: {
          name: "Furina",
          level: 90,
          constellation: 2,
          talents: { normal: 1, skill: 10, burst: 10 },
          weapon: { name: "Splendor", level: 90, refinement: 1, rarity: 5 },
          artifacts: [{ slot: "flower", setName: "Golden Troupe", mainStat: { name: "HP%" }, substats: [{ name: "CRIT Rate" }] }],
        },
      },
    });

    const loaded = await loadGenshinPyOutput(file);

    expect(loaded.present).toBe(true);
    expect(loaded.records[0]).toMatchObject({
      sourceKey: "furina",
      characterKey: "char_furina",
      equippedWeaponName: "Splendor",
    });
    expect(loaded.records[0].artifacts[0].substats).toEqual(["CRIT Rate"]);
  });

  it("extracts character-like rows from nested genshin.py sections", () => {
    const records = extractGenshinPyCharacters({
      data: {
        characters: [{ id: "skirk", name: "Skirk", level: 90, skills: { attack: 1, skill: 10, burst: 1 } }],
      },
    });

    expect(records).toHaveLength(1);
    expect(records[0].characterKey).toBe("char_skirk");
  });

  it("matches characters by stable/source key and compares fields", () => {
    const report = buildComparisonReport({
      playerStableKey: "default",
      hoyolabProfile: source([{ source: "hoyolabProfile", sourceKey: "furina", characterKey: "char_furina", level: 90, artifacts: [] }]),
      genshinPy: source([{ source: "genshinPy", sourceKey: "furina", characterKey: "char_furina", level: 90, constellation: 1, artifacts: [] }]),
      database: database([{ source: "database", sourceKey: "furina", resolvedCharacterKey: "char_furina", level: 89, artifacts: [] }]),
    });

    expect(report.summary.matchedCharacters).toBe(1);
    const furina = report.comparisons[0];
    expect(furina.fields.find((field) => field.field === "level")?.status).toBe("mismatch");
    expect(furina.fields.find((field) => field.field === "constellation")?.status).toBe("not_comparable");
  });

  it("returns equivalent verdict when genshin.py mostly matches hoyolab profile", () => {
    const report = buildComparisonReport({
      playerStableKey: "default",
      hoyolabProfile: source([fullRecord("hoyolabProfile")]),
      genshinPy: source([fullRecord("genshinPy")]),
      database: database([fullRecord("database")]),
    });

    expect(report.verdict).toBe("genshin.py equivalent");
  });

  it("returns better verdict when genshin.py adds artifact main stats and substats", () => {
    const report = buildComparisonReport({
      playerStableKey: "default",
      hoyolabProfile: source([{ ...fullRecord("hoyolabProfile"), artifacts: [] }]),
      genshinPy: source([fullRecord("genshinPy")]),
      database: database([{ ...fullRecord("database"), artifacts: [] }]),
    });

    expect(report.verdict).toBe("genshin.py better");
  });

  it("returns worse verdict when genshin.py misses fields hoyolab profile has", () => {
    const report = buildComparisonReport({
      playerStableKey: "default",
      hoyolabProfile: source([fullRecord("hoyolabProfile")]),
      genshinPy: source([{ source: "genshinPy", sourceKey: "furina", characterKey: "char_furina", level: 90, artifacts: [] }]),
      database: database([fullRecord("database")]),
    });

    expect(report.verdict).toBe("genshin.py worse");
  });

  it("reports missing files without crashing", async () => {
    const loaded = await loadGenshinPyOutput(join(tmpdir(), "missing-genshin-py-file.json"));

    expect(loaded.present).toBe(false);
    expect(loaded.records).toEqual([]);
    expect(loaded.warnings[0]).toContain("missing");
  });

  it("does not include token or cookie-like keys in the output report", () => {
    const report = buildComparisonReport({
      playerStableKey: "default",
      hoyolabProfile: source([fullRecord("hoyolabProfile")]),
      genshinPy: source([fullRecord("genshinPy")]),
      database: database([]),
    });

    expect(containsSecretLikeKey(report)).toBe(false);
  });
});

function fullRecord(sourceName: CharacterComparisonRecord["source"]): CharacterComparisonRecord {
  return {
    source: sourceName,
    sourceKey: "furina",
    characterKey: "char_furina",
    resolvedCharacterKey: "char_furina",
    name: "Furina",
    level: 90,
    ascension: 6,
    constellation: 2,
    talentNormal: 1,
    talentSkill: 10,
    talentBurst: 10,
    equippedWeaponName: "Splendor",
    equippedWeaponLevel: 90,
    equippedWeaponRefinement: 1,
    equippedWeaponRarity: 5,
    artifacts: [
      {
        slot: "flower",
        name: "Golden Song",
        setName: "Golden Troupe",
        level: 20,
        rarity: 5,
        mainStat: "HP",
        substats: ["CRIT Rate", "CRIT DMG"],
      },
    ],
  };
}
