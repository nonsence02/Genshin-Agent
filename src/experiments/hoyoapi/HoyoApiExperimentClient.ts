import { GenshinImpact, GenshinRegion } from "hoyoapi/gi";
import { GamesEnum, Hoyolab, Language } from "hoyoapi";
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
  attemptedInitStrategies: string[];
  endpoints: Record<string, EndpointResult>;
  summary: HoyoApiExperimentSummary;
  warnings: string[];
}

interface HoyoApiExperimentCredentials {
  name: string;
  cookie: IGenshinOptions["cookie"];
  canUseCreate: boolean;
  preferConstructor?: boolean;
}

export interface SelectedGameAccountSummary {
  account?: unknown;
  uid?: string;
  region?: string;
}

export async function runHoyoApiExperiment(options: HoyoApiExperimentOptions = {}): Promise<HoyoApiExperimentReport> {
  const config = loadHoyoApiEnv();
  const init = await createGenshinClient(config);

  return runHoyoApiExperimentAgainstClient(init.client, {
    ...options,
    setupMode: init.setupMode,
    initializationStrategy: init.initializationStrategy,
    attemptedInitStrategies: init.attemptedStrategies,
    initEndpoints: init.endpoints,
    selectedGameAccount: init.selectedGameAccount,
    selectedUid: init.selectedUid,
    selectedRegion: init.selectedRegion,
    warnings: init.warnings,
  });
}

export async function runHoyoApiExperimentAgainstClient(
  client: unknown,
  options: HoyoApiExperimentOptions & {
    setupMode?: "create" | "constructor";
    initializationStrategy?: string;
    attemptedInitStrategies?: string[];
    initEndpoints?: Record<string, EndpointResult>;
    selectedGameAccount?: unknown;
    selectedUid?: string | number;
    selectedRegion?: string;
    warnings?: string[];
  } = {},
): Promise<HoyoApiExperimentReport> {
  const endpoints: Record<string, EndpointResult> = { ...(options.initEndpoints ?? {}) };
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
    attemptedInitStrategies: options.attemptedInitStrategies,
    selectedGameAccount: options.selectedGameAccount,
    selectedUid: options.selectedUid,
    selectedRegion: options.selectedRegion,
  });

  return {
    setupMode: options.setupMode ?? "constructor",
    initializationStrategy: options.initializationStrategy ?? "provided-client",
    attemptedInitStrategies: options.attemptedInitStrategies ?? ["provided-client"],
    endpoints,
    summary,
    warnings,
  };
}

export async function createGenshinClient(config: HoyoApiExperimentConfig): Promise<{
  client: GenshinImpact;
  setupMode: "create" | "constructor";
  initializationStrategy: string;
  attemptedStrategies: string[];
  endpoints: Record<string, EndpointResult>;
  selectedGameAccount?: unknown;
  selectedUid?: string;
  selectedRegion?: string;
  warnings: string[];
}> {
  const candidates = buildCredentialCandidates(config);
  const warnings: string[] = [];
  const endpoints: Record<string, EndpointResult> = {};
  const attemptedStrategies: string[] = [];

  if (candidates.length === 0) {
    throw new Error(MISSING_HOYOAPI_CREDENTIALS_MESSAGE);
  }

  for (const candidate of candidates) {
    if (candidate.name === "hoyolab-games-list") {
      const result = await tryHoyolabGamesListFlow(candidate, config, endpoints, warnings);
      attemptedStrategies.push("hoyolab-games-list");

      if (result) {
        return {
          ...result,
          attemptedStrategies,
          endpoints,
          warnings,
        };
      }

      continue;
    }

    const directOptions = {
      cookie: candidate.cookie,
      uid: config.uid,
      region: parseRegion(config.region, config.uid),
      lang: Language.parseLang(config.lang),
    };

    if (candidate.canUseCreate && !candidate.preferConstructor) {
      attemptedStrategies.push(`${candidate.name}:create`);
      try {
        return {
          client: await GenshinImpact.create(directOptions),
          setupMode: "create",
          initializationStrategy: `${candidate.name}:create`,
          attemptedStrategies,
          endpoints,
          warnings,
        };
      } catch (error) {
        warnings.push(`GenshinImpact.create failed for ${candidate.name}; trying fallback: ${formatError(error)}`);
      }
    }

    attemptedStrategies.push(`${candidate.name}:constructor`);
    try {
      return {
        client: new GenshinImpact(directOptions),
        setupMode: "constructor",
        initializationStrategy: `${candidate.name}:constructor`,
        attemptedStrategies,
        endpoints,
        warnings,
      };
    } catch (error) {
      warnings.push(`GenshinImpact constructor failed for ${candidate.name}: ${formatError(error)}`);
    }
  }

  throw new Error(`Unable to initialize hoyoapi client without exposing credentials.\n${warnings.join("\n")}`);
}

async function tryHoyolabGamesListFlow(
  candidate: HoyoApiExperimentCredentials,
  config: HoyoApiExperimentConfig,
  endpoints: Record<string, EndpointResult>,
  warnings: string[],
): Promise<
  | {
      client: GenshinImpact;
      setupMode: "constructor";
      initializationStrategy: string;
      selectedGameAccount?: unknown;
      selectedUid?: string;
      selectedRegion?: string;
    }
  | undefined
> {
  try {
    const hoyolab = new Hoyolab({
      cookie: candidate.cookie,
      lang: Language.parseLang(config.lang),
    });
    endpoints.hoyolabGamesList = await callEndpoint("hoyolab.gamesList", () => hoyolab.gamesList());
    endpoints.hoyolabGamesListGenshin = await callEndpoint("hoyolab.gamesList(GENSHIN_IMPACT)", () =>
      hoyolab.gamesList(GamesEnum.GENSHIN_IMPACT),
    );

    const accounts = extractGameAccounts(
      endpoints.hoyolabGamesListGenshin.status === "ok"
        ? endpoints.hoyolabGamesListGenshin.data
        : endpoints.hoyolabGamesList.data,
    );
    endpoints.hoyolabGamesListGenshin.count = accounts.length;
    const selected = selectGameAccount(accounts, config.uid);

    if (!selected.account || !selected.uid || !selected.region) {
      warnings.push("hoyolab-games-list did not return a usable Genshin account with uid and region.");
      return undefined;
    }

    const client = new GenshinImpact({
      cookie: candidate.cookie,
      uid: Number(selected.uid),
      region: parseRegion(selected.region, Number(selected.uid)),
      lang: Language.parseLang(config.lang),
    });

    try {
      (client as { account?: unknown }).account = selected.account;
    } catch {
      warnings.push("hoyolab-games-list selected account could not be attached to GenshinImpact client.");
    }

    return {
      client,
      setupMode: "constructor",
      initializationStrategy: "hoyolab-games-list",
      selectedGameAccount: selected.account,
      selectedUid: selected.uid,
      selectedRegion: selected.region,
    };
  } catch (error) {
    endpoints.hoyolabGamesList ??= {
      status: "error",
      error: `hoyolab.gamesList: ${formatError(error)}`,
    };
    warnings.push(`hoyolab-games-list failed: ${formatError(error)}`);
    return undefined;
  }
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
      name: "hoyolab-games-list",
      cookie: config.cookieString,
      canUseCreate: false,
      preferConstructor: true,
    });
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

export function extractGameAccounts(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const object = value as Record<string, unknown>;
  const likelyList = object.list ?? object.games ?? object.accounts ?? object.data;

  if (Array.isArray(likelyList)) {
    return likelyList;
  }

  return [];
}

export function selectGameAccount(accounts: unknown[], preferredUid?: number): SelectedGameAccountSummary {
  const accountObjects = accounts.filter((account) => account && typeof account === "object") as Record<
    string,
    unknown
  >[];
  const preferred = preferredUid === undefined ? undefined : String(preferredUid);
  const matching = preferred
    ? accountObjects.find((account) => extractAccountUid(account) === preferred)
    : undefined;
  const selected =
    matching ??
    [...accountObjects].sort((left, right) => extractAccountLevel(right) - extractAccountLevel(left))[0] ??
    accountObjects[0];

  if (!selected) {
    return {};
  }

  return {
    account: selected,
    uid: extractAccountUid(selected),
    region: extractAccountRegion(selected),
  };
}

function extractAccountUid(account: Record<string, unknown>): string | undefined {
  const value = account.game_uid ?? account.uid ?? account.gameRoleId ?? account.game_role_id;

  return value === undefined ? undefined : String(value);
}

function extractAccountRegion(account: Record<string, unknown>): string | undefined {
  const value = account.region ?? account.server ?? account.region_name;

  return value === undefined ? undefined : String(value);
}

function extractAccountLevel(account: Record<string, unknown>): number {
  const value = account.level;

  return typeof value === "number" ? value : Number(value) || 0;
}
