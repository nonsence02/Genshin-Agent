export type ComparisonSource = "hoyolabProfile" | "genshinPy" | "database";

export interface ArtifactComparisonData {
  slot?: string;
  name?: string;
  setName?: string;
  level?: number;
  rarity?: number;
  mainStat?: string;
  substats?: string[];
}

export interface CharacterComparisonRecord {
  source: ComparisonSource;
  sourceKey?: string;
  normalizedSourceKey?: string;
  characterKey?: string;
  resolvedCharacterKey?: string;
  name?: string;
  nameRu?: string;
  level?: number;
  ascension?: number;
  constellation?: number;
  talentNormal?: number;
  talentSkill?: number;
  talentBurst?: number;
  equippedWeaponName?: string;
  equippedWeaponLevel?: number;
  equippedWeaponRefinement?: number;
  equippedWeaponRarity?: number;
  artifacts: ArtifactComparisonData[];
}

export interface LoadedCharacterSource {
  present: boolean;
  filePath?: string;
  missingReason?: string;
  records: CharacterComparisonRecord[];
  warnings: string[];
}

export interface DatabaseCharacterSource {
  present: boolean;
  player?: {
    id: number;
    stableKey: string;
  };
  records: CharacterComparisonRecord[];
  warnings: string[];
}

export interface CharacterFieldComparison {
  field: string;
  hoyolabProfile?: unknown;
  genshinPy?: unknown;
  database?: unknown;
  status: "match" | "mismatch" | "missing" | "not_comparable";
}

export interface CharacterSourceComparisonReport {
  player: {
    stableKey: string;
    id?: number;
  };
  sources: {
    hoyolabProfile: { present: boolean; characterCount: number };
    genshinPy: { present: boolean; characterCount: number };
    database: { present: boolean; characterCount: number };
  };
  summary: {
    matchedCharacters: number;
    onlyInHoyolabProfile: number;
    onlyInGenshinPy: number;
    onlyInDatabase: number;
    fieldMatches: number;
    fieldMismatches: number;
    missingFieldCount: number;
  };
  fieldCoverage: {
    hoyolabProfile: Record<string, boolean | number>;
    genshinPy: Record<string, boolean | number>;
    database: Record<string, boolean | number>;
  };
  comparisons: Array<{
    characterKey?: string;
    displayName?: string;
    sourcePresence: {
      hoyolabProfile: boolean;
      genshinPy: boolean;
      database: boolean;
    };
    fields: CharacterFieldComparison[];
    recommendation?: string;
  }>;
  verdict: "genshin.py better" | "genshin.py equivalent" | "genshin.py worse" | "inconclusive";
  warnings: string[];
}
