export type EndpointStatus = "ok" | "error" | "skipped";

export interface EndpointResult {
  status: EndpointStatus;
  data?: unknown;
  error?: string;
  count?: number;
}

export interface CharacterFieldCoverage {
  level: boolean;
  rarity: boolean;
  constellation: boolean;
  talents: boolean;
  equippedWeapon: boolean;
  equippedArtifacts: boolean;
  artifactSet: boolean;
  artifactSlot: boolean;
  artifactLevel: boolean;
  artifactRarity: boolean;
  artifactMainStat: boolean;
  artifactSubstats: boolean;
}

export interface HoyoApiExperimentSummary {
  recordsEndpoint: EndpointStatus;
  charactersEndpoint: EndpointStatus;
  charactersCount: number;
  characterIdsExtracted: number[];
  charactersSummaryEndpoint: EndpointStatus;
  charactersSummaryCount: number;
  dailyNoteEndpoint: EndpointStatus;
  dailyInfoEndpoint: EndpointStatus;
  dailyRewardsEndpoint: EndpointStatus;
  dailyRewardEndpoint: EndpointStatus;
  dailyClaimEndpoint: EndpointStatus;
  dailyClaimCalled: boolean;
  characterFieldCoverage: CharacterFieldCoverage;
  coverageVerdict: string;
  warnings: string[];
}

const REDACTED = "[REDACTED]";
const SECRET_KEY_PATTERN =
  /(cookie|token|ltoken|ltuid|account|uid|email|phone|auth|ds|stoken|mid|login|session)/i;
const MAX_ARRAY_ITEMS = 50;

export function sanitizeHoyoApiOutput(value: unknown): unknown {
  return sanitizeValue(value, "");
}

function sanitizeValue(value: unknown, key: string): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    return REDACTED;
  }

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return looksSensitive(value) ? REDACTED : value;
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, key));

    if (value.length > MAX_ARRAY_ITEMS) {
      items.push({ __truncated: value.length - MAX_ARRAY_ITEMS });
    }

    return items;
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = sanitizeValue(childValue, childKey);
    }

    return output;
  }

  return null;
}

function looksSensitive(value: string): boolean {
  return /ltoken=|ltuid=|cookie_token|account_id|stoken=|mid=/i.test(value);
}

export function detectHoyoApiFieldCoverage(values: unknown[]): CharacterFieldCoverage {
  const coverage = emptyCoverage();

  for (const value of values) {
    inspectValue(value, [], coverage);
  }

  return coverage;
}

export function buildHoyoApiExperimentSummary(input: {
  endpoints: Record<string, EndpointResult>;
  characterIds: number[];
  dailyClaimCalled: boolean;
  warnings?: string[];
}): HoyoApiExperimentSummary {
  const coverageSources = Object.values(input.endpoints)
    .filter((endpoint) => endpoint.status === "ok")
    .map((endpoint) => endpoint.data);
  const characterFieldCoverage = detectHoyoApiFieldCoverage(coverageSources);
  const charactersEndpoint = endpointStatus(input.endpoints.characters);
  const charactersSummaryEndpoint = endpointStatus(input.endpoints.charactersSummary);
  const dailyNoteEndpoint = endpointStatus(input.endpoints.dailyNote);
  const dailyInfoEndpoint = endpointStatus(input.endpoints.dailyInfo);
  const dailyRewardsEndpoint = endpointStatus(input.endpoints.dailyRewards);
  const dailyRewardEndpoint = endpointStatus(input.endpoints.dailyReward);

  return {
    recordsEndpoint: endpointStatus(input.endpoints.records),
    charactersEndpoint,
    charactersCount: input.endpoints.characters?.count ?? countLikelyItems(input.endpoints.characters?.data),
    characterIdsExtracted: input.characterIds,
    charactersSummaryEndpoint,
    charactersSummaryCount:
      input.endpoints.charactersSummary?.count ?? countLikelyItems(input.endpoints.charactersSummary?.data),
    dailyNoteEndpoint,
    dailyInfoEndpoint,
    dailyRewardsEndpoint,
    dailyRewardEndpoint,
    dailyClaimEndpoint: endpointStatus(input.endpoints.dailyClaim),
    dailyClaimCalled: input.dailyClaimCalled,
    characterFieldCoverage,
    coverageVerdict: determineCoverageVerdict({
      charactersEndpoint,
      charactersSummaryEndpoint,
      dailyNoteEndpoint,
      dailyInfoEndpoint,
      dailyRewardsEndpoint,
      dailyRewardEndpoint,
      characterFieldCoverage,
    }),
    warnings: input.warnings ?? [],
  };
}

export function countLikelyItems(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (!value || typeof value !== "object") {
    return 0;
  }

  const object = value as Record<string, unknown>;
  const likelyArray = object.avatars ?? object.characters ?? object.list ?? object.items ?? object.data;

  return Array.isArray(likelyArray) ? likelyArray.length : 0;
}

function inspectValue(value: unknown, path: string[], coverage: CharacterFieldCoverage): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      inspectValue(item, path, coverage);
    }

    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizeKey(key);
    const normalizedPath = [...path, normalizedKey];
    const inArtifactContext = normalizedPath.some((item) => /artifact|reliquar|relic/.test(item));

    if (["level", "lv", "levelcurrent"].includes(normalizedKey)) {
      coverage.level = true;
      if (inArtifactContext) {
        coverage.artifactLevel = true;
      }
    }

    if (["rarity", "rank", "star", "stars"].includes(normalizedKey)) {
      coverage.rarity = true;
      if (inArtifactContext) {
        coverage.artifactRarity = true;
      }
    }

    if (/constellation/.test(normalizedKey) || normalizedKey === "activedconstellationnum") {
      coverage.constellation = true;
    }

    if (/talent|skill/.test(normalizedKey)) {
      coverage.talents = true;
    }

    if (/weapon/.test(normalizedKey)) {
      coverage.equippedWeapon = true;
    }

    if (/artifact|reliquar|relic/.test(normalizedKey)) {
      coverage.equippedArtifacts = true;
    }

    if (inArtifactContext && /set/.test(normalizedKey)) {
      coverage.artifactSet = true;
    }

    if (inArtifactContext && /slot|pos|equiptype/.test(normalizedKey)) {
      coverage.artifactSlot = true;
    }

    if (inArtifactContext && /main.*(stat|prop|property)|^main$/.test(normalizedKey)) {
      coverage.artifactMainStat = true;
    }

    if (inArtifactContext && /sub.*(stat|prop|property)|appendprop/.test(normalizedKey)) {
      coverage.artifactSubstats = true;
    }

    inspectValue(child, normalizedPath, coverage);
  }
}

function determineCoverageVerdict(input: {
  charactersEndpoint: EndpointStatus;
  charactersSummaryEndpoint: EndpointStatus;
  dailyNoteEndpoint: EndpointStatus;
  dailyInfoEndpoint: EndpointStatus;
  dailyRewardsEndpoint: EndpointStatus;
  dailyRewardEndpoint: EndpointStatus;
  characterFieldCoverage: CharacterFieldCoverage;
}): string {
  if (
    input.charactersEndpoint === "error" &&
    input.charactersSummaryEndpoint !== "ok" &&
    input.dailyNoteEndpoint === "error"
  ) {
    return "inconclusive due to auth/API errors";
  }

  const coverage = input.characterFieldCoverage;
  const coreCharacterFields = [
    coverage.level,
    coverage.constellation,
    coverage.talents,
    coverage.equippedWeapon,
  ].filter(Boolean).length;
  const artifactFields = [
    coverage.equippedArtifacts,
    coverage.artifactMainStat,
    coverage.artifactSubstats,
  ].filter(Boolean).length;

  if (coreCharacterFields >= 4 && artifactFields >= 2) {
    return "hoyoapi appears better than current HoYoLAB profile importer";
  }

  if (coreCharacterFields >= 3) {
    return "hoyoapi appears equivalent";
  }

  return "hoyoapi appears worse/incomplete";
}

function endpointStatus(endpoint?: EndpointResult): EndpointStatus {
  return endpoint?.status ?? "skipped";
}

function emptyCoverage(): CharacterFieldCoverage {
  return {
    level: false,
    rarity: false,
    constellation: false,
    talents: false,
    equippedWeapon: false,
    equippedArtifacts: false,
    artifactSet: false,
    artifactSlot: false,
    artifactLevel: false,
    artifactRarity: false,
    artifactMainStat: false,
    artifactSubstats: false,
  };
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}
