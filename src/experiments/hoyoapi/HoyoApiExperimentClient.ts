import { GenshinImpact, GenshinRegion } from "hoyoapi/gi";
import { Language } from "hoyoapi";
import type { IGenshinOptions } from "hoyoapi/gi";
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
  endpoints: Record<string, EndpointResult>;
  summary: HoyoApiExperimentSummary;
  warnings: string[];
}

interface HoyoApiExperimentCredentials {
  cookie: IGenshinOptions["cookie"];
  uid?: number;
  lang?: string;
  region?: GenshinRegion;
}

export async function runHoyoApiExperiment(options: HoyoApiExperimentOptions = {}): Promise<HoyoApiExperimentReport> {
  const credentials = loadCredentialsFromEnv();
  const { client, setupMode, warnings } = await createGenshinClient(credentials);

  return runHoyoApiExperimentAgainstClient(client, {
    ...options,
    setupMode,
    warnings,
  });
}

export async function runHoyoApiExperimentAgainstClient(
  client: unknown,
  options: HoyoApiExperimentOptions & {
    setupMode?: "create" | "constructor";
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
    endpoints,
    summary,
    warnings,
  };
}

async function createGenshinClient(credentials: HoyoApiExperimentCredentials): Promise<{
  client: GenshinImpact;
  setupMode: "create" | "constructor";
  warnings: string[];
}> {
  const options = {
    cookie: credentials.cookie,
    uid: credentials.uid,
    region: credentials.region,
    lang: Language.parseLang(credentials.lang),
  };

  try {
    return {
      client: await GenshinImpact.create(options),
      setupMode: "create",
      warnings: [],
    };
  } catch (error) {
    return {
      client: new GenshinImpact(options),
      setupMode: "constructor",
      warnings: [`GenshinImpact.create failed, fell back to constructor: ${formatError(error)}`],
    };
  }
}

function loadCredentialsFromEnv(): HoyoApiExperimentCredentials {
  const rawCookie = process.env.HOYOAPI_COOKIE?.trim();
  const uid = parseOptionalInt(process.env.HOYOAPI_UID);
  const lang = process.env.HOYOAPI_LANG;
  const region = parseRegion(process.env.HOYOAPI_REGION, uid);

  if (rawCookie) {
    return {
      cookie: rawCookie,
      uid,
      lang,
      region,
    };
  }

  const ltuid = parseOptionalInt(process.env.HOYOAPI_LTUID_V2 ?? process.env.HOYOAPI_LTUID);
  const ltoken = process.env.HOYOAPI_LTOKEN_V2 ?? process.env.HOYOAPI_LTOKEN;
  const cookieTokenV2 = process.env.HOYOAPI_COOKIE_TOKEN_V2;

  if (!ltuid || !ltoken) {
    throw new Error("Missing HOYOAPI_COOKIE or HOYOAPI_LTUID(_V2)/HOYOAPI_LTOKEN(_V2) credentials.");
  }

  return {
    cookie: {
      ltuid,
      ltoken,
      cookieTokenV2,
    },
    uid,
    lang,
    region,
  };
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

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : undefined;
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
