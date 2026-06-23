import type {
  CharacterComparisonRecord,
  CharacterFieldComparison,
  CharacterSourceComparisonReport,
  DatabaseCharacterSource,
  LoadedCharacterSource,
} from "./types.js";
import { comparableEquals, containsSecretLikeKey, normalizeSourceKey } from "./normalize.js";

const COMPARED_FIELDS = [
  "level",
  "ascension",
  "constellation",
  "talentNormal",
  "talentSkill",
  "talentBurst",
  "equippedWeaponName",
  "equippedWeaponLevel",
  "equippedWeaponRefinement",
  "equippedWeaponRarity",
  "artifactCount",
  "artifactSlots",
  "artifactNames",
  "artifactSetNames",
  "artifactLevels",
  "artifactRarities",
  "artifactMainStats",
  "artifactSubstats",
] as const;

type ComparedField = (typeof COMPARED_FIELDS)[number];

export interface BuildComparisonReportInput {
  playerStableKey: string;
  hoyolabProfile: LoadedCharacterSource;
  genshinPy: LoadedCharacterSource;
  database: DatabaseCharacterSource;
}

export function buildComparisonReport(input: BuildComparisonReportInput): CharacterSourceComparisonReport {
  const groups = groupRecords([input.hoyolabProfile.records, input.genshinPy.records, input.database.records].flat());
  const comparisons = [...groups.values()]
    .map((group) => buildCharacterComparison(group))
    .sort((left, right) => (left.characterKey ?? left.displayName ?? "").localeCompare(right.characterKey ?? right.displayName ?? ""));
  const summary = summarizeComparisons(comparisons);
  const warnings = [...input.hoyolabProfile.warnings, ...input.genshinPy.warnings, ...input.database.warnings];
  const report: CharacterSourceComparisonReport = {
    player: {
      stableKey: input.playerStableKey,
      id: input.database.player?.id,
    },
    sources: {
      hoyolabProfile: { present: input.hoyolabProfile.present, characterCount: input.hoyolabProfile.records.length },
      genshinPy: { present: input.genshinPy.present, characterCount: input.genshinPy.records.length },
      database: { present: input.database.present, characterCount: input.database.records.length },
    },
    summary,
    fieldCoverage: {
      hoyolabProfile: buildCoverage(input.hoyolabProfile.records),
      genshinPy: buildCoverage(input.genshinPy.records),
      database: buildCoverage(input.database.records),
    },
    comparisons,
    verdict: "inconclusive",
    warnings,
  };

  report.verdict = decideVerdict(report);

  if (containsSecretLikeKey(report)) {
    report.warnings.push("Comparison report contains token/cookie-like keys; review sanitizer before sharing.");
  }

  return report;
}

function groupRecords(records: CharacterComparisonRecord[]): Map<string, Partial<Record<"hoyolabProfile" | "genshinPy" | "database", CharacterComparisonRecord>>> {
  const groups = new Map<string, Partial<Record<"hoyolabProfile" | "genshinPy" | "database", CharacterComparisonRecord>>>();
  const aliases = new Map<string, string>();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const canonical = canonicalKey(record, aliases, index);
    const group = groups.get(canonical) ?? {};
    group[record.source] = record;
    groups.set(canonical, group);

    for (const key of candidateKeys(record)) {
      aliases.set(key, canonical);
    }
  }

  return groups;
}

function canonicalKey(record: CharacterComparisonRecord, aliases: Map<string, string>, index: number): string {
  for (const key of candidateKeys(record)) {
    const existing = aliases.get(key);

    if (existing) {
      return existing;
    }
  }

  return candidateKeys(record)[0] ?? `unmatched:${record.source}:${index}`;
}

function candidateKeys(record: CharacterComparisonRecord): string[] {
  const keys = [
    record.resolvedCharacterKey,
    record.characterKey,
    record.normalizedSourceKey ? `char_${record.normalizedSourceKey}` : undefined,
    record.sourceKey ? `char_${normalizeSourceKey(record.sourceKey)}` : undefined,
    record.name ? `char_${normalizeSourceKey(record.name)}` : undefined,
  ].filter((key): key is string => key !== undefined && key !== "char_");

  return [...new Set(keys)];
}

function buildCharacterComparison(
  group: Partial<Record<"hoyolabProfile" | "genshinPy" | "database", CharacterComparisonRecord>>,
): CharacterSourceComparisonReport["comparisons"][number] {
  const fields = COMPARED_FIELDS.map((field) => compareField(field, group));
  const display = group.hoyolabProfile ?? group.genshinPy ?? group.database;
  const sourcePresence = {
    hoyolabProfile: group.hoyolabProfile !== undefined,
    genshinPy: group.genshinPy !== undefined,
    database: group.database !== undefined,
  };
  const recommendation = recommendationFor(fields, sourcePresence);

  return {
    characterKey: display?.resolvedCharacterKey ?? display?.characterKey,
    displayName: display?.name ?? display?.nameRu ?? display?.sourceKey,
    sourcePresence,
    fields,
    recommendation,
  };
}

function compareField(
  field: ComparedField,
  group: Partial<Record<"hoyolabProfile" | "genshinPy" | "database", CharacterComparisonRecord>>,
): CharacterFieldComparison {
  const values = {
    hoyolabProfile: fieldValue(group.hoyolabProfile, field),
    genshinPy: fieldValue(group.genshinPy, field),
    database: fieldValue(group.database, field),
  };
  const present = Object.values(values).filter((value) => value !== undefined);

  if (present.length === 0) {
    return { field, ...values, status: "missing" };
  }

  if (present.length === 1) {
    return { field, ...values, status: "not_comparable" };
  }

  const [first, ...rest] = present;
  return {
    field,
    ...values,
    status: rest.every((value) => comparableEquals(value, first)) ? "match" : "mismatch",
  };
}

function fieldValue(record: CharacterComparisonRecord | undefined, field: ComparedField): unknown {
  if (!record) {
    return undefined;
  }

  if (field === "artifactCount") {
    return record.artifacts.length || undefined;
  }

  if (field === "artifactSlots") {
    return uniqueArtifactField(record, "slot");
  }

  if (field === "artifactNames") {
    return uniqueArtifactField(record, "name");
  }

  if (field === "artifactSetNames") {
    return uniqueArtifactField(record, "setName");
  }

  if (field === "artifactLevels") {
    return uniqueArtifactField(record, "level");
  }

  if (field === "artifactRarities") {
    return uniqueArtifactField(record, "rarity");
  }

  if (field === "artifactMainStats") {
    return uniqueArtifactField(record, "mainStat");
  }

  if (field === "artifactSubstats") {
    const substats = record.artifacts.flatMap((artifact) => artifact.substats ?? []);
    return substats.length ? [...new Set(substats)].sort() : undefined;
  }

  return record[field];
}

function uniqueArtifactField(record: CharacterComparisonRecord, field: keyof CharacterComparisonRecord["artifacts"][number]): unknown[] | undefined {
  const values = record.artifacts.map((artifact) => artifact[field]).filter((value) => value !== undefined);
  return values.length ? [...new Set(values)].sort() : undefined;
}

function buildCoverage(records: CharacterComparisonRecord[]): Record<string, boolean | number> {
  const coverage: Record<string, boolean | number> = {};

  for (const field of COMPARED_FIELDS) {
    coverage[field] = records.filter((record) => fieldValue(record, field) !== undefined).length;
  }

  coverage.characterCount = records.length;
  coverage.hasAnyArtifacts = records.some((record) => record.artifacts.length > 0);

  return coverage;
}

function summarizeComparisons(comparisons: CharacterSourceComparisonReport["comparisons"]): CharacterSourceComparisonReport["summary"] {
  return {
    matchedCharacters: comparisons.filter((comparison) => Object.values(comparison.sourcePresence).filter(Boolean).length > 1).length,
    onlyInHoyolabProfile: comparisons.filter((comparison) => comparison.sourcePresence.hoyolabProfile && !comparison.sourcePresence.genshinPy && !comparison.sourcePresence.database).length,
    onlyInGenshinPy: comparisons.filter((comparison) => comparison.sourcePresence.genshinPy && !comparison.sourcePresence.hoyolabProfile && !comparison.sourcePresence.database).length,
    onlyInDatabase: comparisons.filter((comparison) => comparison.sourcePresence.database && !comparison.sourcePresence.hoyolabProfile && !comparison.sourcePresence.genshinPy).length,
    fieldMatches: comparisons.flatMap((comparison) => comparison.fields).filter((field) => field.status === "match").length,
    fieldMismatches: comparisons.flatMap((comparison) => comparison.fields).filter((field) => field.status === "mismatch").length,
    missingFieldCount: comparisons.flatMap((comparison) => comparison.fields).filter((field) => field.status === "missing" || field.status === "not_comparable").length,
  };
}

function recommendationFor(
  fields: CharacterFieldComparison[],
  sourcePresence: CharacterSourceComparisonReport["comparisons"][number]["sourcePresence"],
): string | undefined {
  if (!sourcePresence.genshinPy) {
    return "genshin.py has no comparable record for this character.";
  }

  const mismatches = fields.filter((field) => field.status === "mismatch");

  if (mismatches.length > 0) {
    return `Review mismatched fields before promotion: ${mismatches.slice(0, 5).map((field) => field.field).join(", ")}.`;
  }

  return undefined;
}

function decideVerdict(report: CharacterSourceComparisonReport): CharacterSourceComparisonReport["verdict"] {
  if (!report.sources.hoyolabProfile.present || !report.sources.genshinPy.present || report.sources.genshinPy.characterCount === 0) {
    return "inconclusive";
  }

  const hoyolabScore = sourceScore(report.fieldCoverage.hoyolabProfile);
  const genshinPyScore = sourceScore(report.fieldCoverage.genshinPy);
  const matched = report.summary.matchedCharacters;

  if (matched === 0) {
    return "inconclusive";
  }

  if (report.sources.genshinPy.characterCount < report.sources.hoyolabProfile.characterCount * 0.8) {
    return "genshin.py worse";
  }

  if (genshinPyScore > hoyolabScore * 1.15 && importantArtifactFieldsPresent(report.fieldCoverage.genshinPy)) {
    return "genshin.py better";
  }

  if (genshinPyScore + 3 < hoyolabScore) {
    return "genshin.py worse";
  }

  return "genshin.py equivalent";
}

function sourceScore(coverage: Record<string, boolean | number>): number {
  return [
    "level",
    "ascension",
    "constellation",
    "talentNormal",
    "talentSkill",
    "talentBurst",
    "equippedWeaponName",
    "equippedWeaponLevel",
    "equippedWeaponRefinement",
    "equippedWeaponRarity",
    "artifactCount",
    "artifactSlots",
    "artifactSetNames",
    "artifactMainStats",
    "artifactSubstats",
  ].reduce((sum, field) => sum + Number(coverage[field] ?? 0), 0);
}

function importantArtifactFieldsPresent(coverage: Record<string, boolean | number>): boolean {
  return Number(coverage.artifactMainStats ?? 0) > 0 || Number(coverage.artifactSubstats ?? 0) > 0;
}
