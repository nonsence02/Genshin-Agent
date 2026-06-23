import { GenshinImpact, GenshinRegion } from "hoyoapi/gi";
import { Language } from "hoyoapi";
import type { IGenshinOptions } from "hoyoapi/gi";
import {
  buildConfigDiagnostic,
  loadHoyoApiEnv,
  MISSING_HOYOAPI_CREDENTIALS_MESSAGE,
  type HoyoApiExperimentConfig,
} from "./loadHoyoApiEnv.js";
import {
  buildHoyoApiExperimentSummary,
  countLikelyItems,
  type EndpointResult,
  type HoyoApiExperimentSummary,
} from "./sanitizeHoyoApiOutput.js";

export interface HoyoApiExperimentOptions {
  claimDaily?: boolean;
  yes?: boolean;
}

export interface HoyoApiExperimentReport {
  setupMode: "create" | "constructor";
  initializationStrategy: string;
  endpoints: Record<string, EndpointResult>;
  summary: HoyoApiExperimentSummary;
  warnings: string[];
}

interface HoyoApiExperimentCredentials {
  name: string;
  cookie: IGenshinOptions["cookie"];
  canUseCreate: boolean;
}

export async function runHoyoApiExperiment(options: HoyoApiExperimentOptions = {}): Promise<HoyoApiExperimentReport> {
  const config = loadHoyoApiEnv();
  const { client, setupMode, initializationStrategy, warnings } = await createGenshinClient(config);

  return runHoyoApiExperimentAgainstClient(client, {
    ...options,
    setupMode,
    initializationStrategy,
    warnings,
  });
}

export async function runHoyoApiExperimentAgainstClient(
  client: unknown,
  options: HoyoApiExperimentOptions & {
    setupMode?: "create" | "constructor";
    initializationStrategy?: string;
    warnings?: string[];
  } = {},
): Promise<HoyoApiExperimentReport> {
  const endpoints: Record<string, EndpointResult> = {};
  const warnings = [...(options.warnings ?? [])];

  endpoints.records = await callEndpoint("records", () => recordMethod(client, "records")());
  endpoints.characters = await callEndpoint("characters", () => recordMethod(client, "characters")());

  const characterIds = extractCharacterIds(endpoints.characters.data);
  if (characterIds.length > 0) {
    endpoints.charactersSummary = await callEndpoint("charactersSummary", () =>
      recordMethod(client, "charactersSummary")(characterIds),
    );
  } else {
    endpoints.charactersSummary = {
      status: "skipped",
      error: "No character ids could be extracted from characters response.",
    };
  }

  endpoints.dailyNote = await callEndpoint("dailyNote", () => recordMethod(client, "dailyNote")());
  endpoints.dailyInfo = await callEndpoint("dailyInfo", () => dailyMethod(client, "info")());
  endpoints.dailyRewards = await callEndpoint("dailyRewards", () => dailyMethod(client, "rewards")());
  endpoints.dailyReward = await callEndpoint("dailyReward", () => dailyMethod(client, "reward")());

  const dailyClaimCalled = Boolean(options.claimDaily && options.yes);
  if (options.claimDaily && !options.yes) {
    endpoints.dailyClaim = {
      status: "skipped",
      error: "Daily claim requires both --claim-daily and --yes.",
    };
    warnings.push("Daily claim was requested but skipped because --yes was not provided.");
  } else if (dailyClaimCalled) {
    endpoints.dailyClaim = await callEndpoint("dailyClaim", () => dailyMethod(client, "claim")());
  } else {
    endpoints.dailyClaim = {
      status: "skipped",
      error: "Daily claim is opt-in and was not requested.",
    };
  }

  const summary = buildHoyoApiExperimentSummary({
    endpoints,
    characterIds,
    dailyClaimCalled,
    warnings,
  });

  return {
    setupMode: options.setupMode ?? "constructor",
    initializationStrategy: options.initializationStrategy ?? "provided-client",
    endpoints,
    summary,
    warnings,
  };
}

export async function createGenshinClient(config: HoyoApiExperimentConfig): Promise<{
  client: GenshinImpact;
  setupMode: "create" | "constructor";
  initializationStrategy: string;
  warnings: string[];
}> {
  const candidates = buildCredentialCandidates(config);
  const warnings: string[] = [];

  if (candidates.length === 0) {
    throw new Error(MISSING_HOYOAPI_CREDENTIALS_MESSAGE);
  }

  for (const candidate of candidates) {
    const options = {
      cookie: candidate.cookie,
      uid: config.uid,
      region: parseRegion(config.region, config.uid),
      lang: Language.parseLang(config.lang),
    };

    if (candidate.canUseCreate) {
      try {
        return {
          client: await GenshinImpact.create(options),
          setupMode: "create",
          initializationStrategy: `${candidate.name}:create`,
          warnings,
        };
      } catch (error) {
        warnings.push(`GenshinImpact.create failed for ${candidate.name}; trying fallback: ${formatError(error)}`);
      }
    }

    try {
      return {
        client: new GenshinImpact(options),
        setupMode: "constructor",
        initializationStrategy: `${candidate.name}:constructor`,
        warnings,
      };
    } catch (error) {
      warnings.push(`GenshinImpact constructor failed for ${candidate.name}: ${formatError(error)}`);
    }
  }

  throw new Error(`Unable to initialize hoyoapi client without exposing credentials.\n${warnings.join("\n")}`);
}

function recordMethod(client: unknown, methodName: string): (...args: unknown[]) => Promise<unknown> {
  const record = (client as { record?: Record<string, unknown> }).record;
  const method = record?.[methodName];

  if (typeof method !== "function") {
    throw new Error(`record.${methodName} is not available.`);
  }

  return (...args: unknown[]) => Promise.resolve(method.apply(record, args));
}

function dailyMethod(client: unknown, methodName: string): (...args: unknown[]) => Promise<unknown> {
  const daily = (client as { daily?: Record<string, unknown> }).daily;
  const method = daily?.[methodName];

  if (typeof method !== "function") {
    throw new Error(`daily.${methodName} is not available.`);
  }

  return (...args: unknown[]) => Promise.resolve(method.apply(daily, args));
}

async function callEndpoint(name: string, callback: () => Promise<unknown>): Promise<EndpointResult> {
  try {
    const data = await callback();

    return {
      status: "ok",
      data,
      count: countLikelyItems(data),
    };
  } catch (error) {
    return {
      status: "error",
      error: `${name}: ${formatError(error)}`,
    };
  }
}

export function extractCharacterIds(value: unknown): number[] {
  const ids = new Set<number>();
  collectCharacterIds(value, ids);

  return [...ids].slice(0, 100);
}

function collectCharacterIds(value: unknown, ids: Set<number>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCharacterIds(item, ids);
    }

    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (
      ["id", "avatarid", "characterid"].includes(normalizedKey) &&
      (typeof child === "number" || typeof child === "string")
    ) {
      const parsed = Number(child);

      if (Number.isInteger(parsed) && parsed > 0) {
        ids.add(parsed);
      }
    }

    collectCharacterIds(child, ids);
  }
}

function parseRegion(value: string | undefined, uid: number | undefined): GenshinRegion | undefined {
  if (value) {
    const normalized = value.toLowerCase();
    const match = Object.values(GenshinRegion).find((region) => region === normalized);

    if (match) {
      return match;
    }

    const named = GenshinRegion[value.toUpperCase() as keyof typeof GenshinRegion];

    if (named) {
      return named;
    }
  }

  if (!uid) {
    return undefined;
  }

  const firstDigit = String(uid)[0];

  if (firstDigit === "6") return GenshinRegion.USA;
  if (firstDigit === "7") return GenshinRegion.EUROPE;
  if (firstDigit === "8") return GenshinRegion.ASIA;
  if (firstDigit === "9") return GenshinRegion.CHINA_TAIWAN;

  return undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildCredentialCandidates(config: HoyoApiExperimentConfig): HoyoApiExperimentCredentials[] {
  const candidates: HoyoApiExperimentCredentials[] = [];
  const cookieObject = config.cookieObject;

  if (config.cookieString) {
    candidates.push({
      name: "cookie-string",
      cookie: config.cookieString,
      canUseCreate: Boolean(cookieObject?.cookieTokenV2),
    });
  }

  if (cookieObject?.ltuidV2 && cookieObject.ltokenV2) {
    const ltuid = Number(cookieObject.ltuidV2);

    if (Number.isInteger(ltuid)) {
      candidates.push({
        name: "v2-object",
        cookie: {
          ltuid,
          ltoken: cookieObject.ltokenV2,
          cookieTokenV2: cookieObject.cookieTokenV2,
        },
        canUseCreate: Boolean(cookieObject.cookieTokenV2),
      });
    }

    candidates.push({
      name: "v2-cookie-string",
      cookie: [
        `ltuid_v2=${cookieObject.ltuidV2}`,
        `ltoken_v2=${cookieObject.ltokenV2}`,
        cookieObject.cookieTokenV2 ? `cookie_token_v2=${cookieObject.cookieTokenV2}` : undefined,
      ]
        .filter(Boolean)
        .join("; "),
      canUseCreate: Boolean(cookieObject.cookieTokenV2),
    });
  }

  if (cookieObject?.ltuid && cookieObject.ltoken) {
    candidates.push({
      name: "v1-cookie-string",
      cookie: `ltuid=${cookieObject.ltuid}; ltoken=${cookieObject.ltoken}`,
      canUseCreate: false,
    });
  }

  return candidates;
}

export function getHoyoApiConfigDiagnostic(initializationStrategySelected?: string) {
  return buildConfigDiagnostic(loadHoyoApiEnv(), initializationStrategySelected);
}
