import { access, readFile } from "node:fs/promises";
import type { ArtifactComparisonData, CharacterComparisonRecord, LoadedCharacterSource } from "./types.js";
import { asRecord, normalizeCharacterKey, normalizeSourceKey, optionalNumberAsInt, optionalString } from "./normalize.js";

const DEFAULT_GENSHIN_PY_PATH = "data/raw/genshin_py/latest.sanitized.json";

export async function loadGenshinPyOutput(filePath = DEFAULT_GENSHIN_PY_PATH): Promise<LoadedCharacterSource> {
  try {
    await access(filePath);
  } catch {
    return {
      present: false,
      filePath,
      missingReason: "file missing",
      records: [],
      warnings: [`genshin.py sanitized output file missing: ${filePath}`],
    };
  }

  try {
    const payload = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    const records = extractGenshinPyCharacters(payload);

    return {
      present: true,
      filePath,
      records,
      warnings: records.length === 0 ? ["No character-like records extracted from genshin.py output"] : [],
    };
  } catch (error) {
    return {
      present: false,
      filePath,
      missingReason: "parse failed",
      records: [],
      warnings: [`genshin.py output parse failed: ${String(error)}`],
    };
  }
}

export function extractGenshinPyCharacters(payload: unknown): CharacterComparisonRecord[] {
  const records = new Map<string, CharacterComparisonRecord>();

  visit(payload, [], undefined, (value, path, sourceKeyHint) => {
    const record = toCharacterRecord(value, sourceKeyHint);

    if (!record) {
      return;
    }

    const key = record.characterKey ?? record.normalizedSourceKey ?? record.name ?? path.join(".");
    const existing = records.get(key);

    if (!existing || fieldScore(record) > fieldScore(existing)) {
      records.set(key, record);
    }
  });

  return [...records.values()].sort((left, right) => {
    const leftKey = left.characterKey ?? left.normalizedSourceKey ?? left.name ?? "";
    const rightKey = right.characterKey ?? right.normalizedSourceKey ?? right.name ?? "";
    return leftKey.localeCompare(rightKey);
  });
}

function visit(
  value: unknown,
  path: string[],
  sourceKeyHint: string | undefined,
  onRecord: (value: Record<string, unknown>, path: string[], sourceKeyHint: string | undefined) => void,
): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      visit(value[index], [...path, String(index)], undefined, onRecord);
    }
    return;
  }

  const record = asRecord(value);

  if (Object.keys(record).length === 0) {
    return;
  }

  onRecord(record, path, sourceKeyHint);

  for (const [key, child] of Object.entries(record)) {
    const nextHint = isCharacterContainerKey(path.at(-1)) ? key : undefined;
    visit(child, [...path, key], nextHint, onRecord);
  }
}

function isCharacterContainerKey(key: string | undefined): boolean {
  return key === "characters" || key === "avatars" || key === "character_details" || key === "calculator_characters";
}

function toCharacterRecord(raw: Record<string, unknown>, sourceKeyHint: string | undefined): CharacterComparisonRecord | null {
  const name = firstString(raw, ["name", "name_en", "english_name"]);
  const sourceKey = firstString(raw, ["key", "id", "source_key", "sourceCharacterKey"]) ?? sourceKeyHint ?? name;
  const level = firstInt(raw, ["level", "lvl"]);
  const constellation = firstInt(raw, ["constellation", "constellation_level", "cons", "const"]);
  const talents = asRecord(raw.talents ?? raw.skills ?? raw.skill_levels);
  const weapon = asRecord(raw.equipped_weapon ?? raw.weapon);
  const artifacts = extractArtifacts(raw);
  const hasCharacterState =
    level !== undefined ||
    constellation !== undefined ||
    Object.keys(talents).length > 0 ||
    Object.keys(weapon).length > 0 ||
    artifacts.length > 0;

  if (!sourceKey || !hasCharacterState) {
    return null;
  }

  return {
    source: "genshinPy",
    sourceKey,
    normalizedSourceKey: normalizeSourceKey(sourceKey),
    characterKey: normalizeCharacterKey(sourceKey),
    name,
    nameRu: firstString(raw, ["name_ru", "russian_name"]),
    level,
    ascension: firstInt(raw, ["ascension", "ascension_phase", "promote_level"]),
    constellation,
    talentNormal: firstInt(talents, ["normal_attack", "normal", "auto", "attack"]),
    talentSkill: firstInt(talents, ["elemental_skill", "skill", "e"]),
    talentBurst: firstInt(talents, ["elemental_burst", "burst", "q", "ultimate"]),
    equippedWeaponName: firstString(weapon, ["name"]),
    equippedWeaponLevel: firstInt(weapon, ["level", "lvl"]),
    equippedWeaponRefinement: firstInt(weapon, ["refinement", "rank"]),
    equippedWeaponRarity: firstInt(weapon, ["rarity", "rank_type"]),
    artifacts,
  };
}

function extractArtifacts(raw: Record<string, unknown>): ArtifactComparisonData[] {
  const rawArtifacts = raw.equipped_artifacts ?? raw.artifacts ?? raw.relics;

  if (!Array.isArray(rawArtifacts)) {
    return [];
  }

  return rawArtifacts.map((artifact) => {
    const item = asRecord(artifact);
    const mainStat = asRecord(item.main_stat ?? item.mainStat);
    const rawSubstats = item.substats ?? item.sub_stats ?? item.subStat;
    const substats = Array.isArray(rawSubstats)
      ? rawSubstats
          .map((substat) => optionalString(substat) ?? optionalString(asRecord(substat).name))
          .filter((substat): substat is string => substat !== undefined)
      : undefined;

    return {
      slot: firstString(item, ["slot", "pos", "equip_type"]),
      name: firstString(item, ["name"]),
      setName: firstString(item, ["set_name", "setName", "set"]),
      level: firstInt(item, ["level", "lvl"]),
      rarity: firstInt(item, ["rarity", "rank"]),
      mainStat: optionalString(mainStat.name) ?? firstString(item, ["main_stat", "mainStat"]),
      substats,
    };
  });
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(record[key]);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function firstInt(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = optionalNumberAsInt(record[key]);

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function fieldScore(record: CharacterComparisonRecord): number {
  return [
    record.level,
    record.ascension,
    record.constellation,
    record.talentNormal,
    record.talentSkill,
    record.talentBurst,
    record.equippedWeaponName,
    record.equippedWeaponLevel,
    record.equippedWeaponRefinement,
    record.equippedWeaponRarity,
  ].filter((value) => value !== undefined).length + record.artifacts.length;
}
