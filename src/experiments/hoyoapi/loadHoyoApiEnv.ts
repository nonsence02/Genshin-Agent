import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

export type UidSource = "HOYOAPI_UID" | "GENSHIN_UID" | "missing";
export type CookieSource = "HOYOAPI_COOKIE" | "HOYOAPI_*" | "legacy_v2" | "legacy_v1" | "missing";

export interface HoyoApiExperimentConfig {
  uid?: number;
  lang: string;
  region?: string;
  cookieString?: string;
  cookieObject?: {
    ltuidV2?: string;
    ltokenV2?: string;
    cookieTokenV2?: string;
    ltuid?: string;
    ltoken?: string;
  };
  credentialSource: {
    uid: UidSource;
    cookie: CookieSource;
  };
  envFilesLoaded: string[];
}

export interface HoyoApiConfigDiagnostic {
  uidPresent: boolean;
  uidSource: UidSource;
  cookiePresent: boolean;
  cookieSource: CookieSource;
  fullCookiePresent: boolean;
  v2FieldsPresent: boolean;
  hasLtuidV2: boolean;
  hasLtokenV2: boolean;
  hasCookieTokenV2: boolean;
  lang: string;
  regionPresent: boolean;
  envFilesLoaded: string[];
  initializationStrategySelected?: string;
}

export const MISSING_HOYOAPI_CREDENTIALS_MESSAGE = [
  "Missing HoYoAPI credentials.",
  "Accepted env names:",
  "- HOYOAPI_COOKIE",
  "- HOYOAPI_UID / GENSHIN_UID",
  "- HOYOAPI_LTUID_V2 / LTUID_V2",
  "- HOYOAPI_LTOKEN_V2 / LTOKEN_V2",
  "- HOYOAPI_COOKIE_TOKEN_V2 / COOKIE_TOKEN_V2",
  "- HOYOAPI_LTUID / HOYOAPI_LTOKEN",
].join("\n");

export function loadHoyoApiEnv(): HoyoApiExperimentConfig {
  const envFilesLoaded = loadEnvFiles();

  return buildHoyoApiExperimentConfig(process.env, envFilesLoaded);
}

export function loadEnvFiles(cwd = process.cwd()): string[] {
  const loaded: string[] = [];

  for (const file of [".env.local", ".env"]) {
    const path = resolve(cwd, file);

    if (!existsSync(path)) {
      continue;
    }

    dotenv.config({
      path,
      override: false,
      quiet: true,
    });
    loaded.push(file);
  }

  return loaded;
}

export function buildHoyoApiExperimentConfig(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  envFilesLoaded: string[] = [],
): HoyoApiExperimentConfig {
  const hoyoapiUid = parseOptionalInt(env.HOYOAPI_UID);
  const legacyUid = parseOptionalInt(env.GENSHIN_UID);
  const uid = hoyoapiUid ?? legacyUid;
  const uidSource: UidSource = hoyoapiUid ? "HOYOAPI_UID" : legacyUid ? "GENSHIN_UID" : "missing";
  const rawCookie = nonEmpty(env.HOYOAPI_COOKIE);
  const explicitLtuidV2 = nonEmpty(env.HOYOAPI_LTUID_V2);
  const explicitLtokenV2 = nonEmpty(env.HOYOAPI_LTOKEN_V2);
  const explicitCookieTokenV2 = nonEmpty(env.HOYOAPI_COOKIE_TOKEN_V2);
  const ltuidV2 = explicitLtuidV2 ?? nonEmpty(env.LTUID_V2);
  const ltokenV2 = explicitLtokenV2 ?? nonEmpty(env.LTOKEN_V2);
  const cookieTokenV2 = explicitCookieTokenV2 ?? nonEmpty(env.COOKIE_TOKEN_V2);
  const ltuid = nonEmpty(env.HOYOAPI_LTUID);
  const ltoken = nonEmpty(env.HOYOAPI_LTOKEN);
  const cookieSource = determineCookieSource({
    rawCookie,
    hasExplicitV2: Boolean(explicitLtuidV2 || explicitLtokenV2 || explicitCookieTokenV2),
    ltuidV2,
    ltokenV2,
    ltuid,
    ltoken,
  });

  return {
    uid,
    lang: nonEmpty(env.HOYOAPI_LANG) ?? "en",
    region: nonEmpty(env.HOYOAPI_REGION),
    cookieString: rawCookie,
    cookieObject: {
      ltuidV2,
      ltokenV2,
      cookieTokenV2,
      ltuid,
      ltoken,
    },
    credentialSource: {
      uid: uidSource,
      cookie: cookieSource,
    },
    envFilesLoaded,
  };
}

export function buildConfigDiagnostic(
  config: HoyoApiExperimentConfig,
  initializationStrategySelected?: string,
): HoyoApiConfigDiagnostic {
  return {
    uidPresent: Boolean(config.uid),
    uidSource: config.credentialSource.uid,
    cookiePresent: config.credentialSource.cookie !== "missing",
    cookieSource: config.credentialSource.cookie,
    fullCookiePresent: Boolean(config.cookieString),
    v2FieldsPresent: Boolean(config.cookieObject?.ltuidV2 && config.cookieObject?.ltokenV2),
    hasLtuidV2: Boolean(config.cookieObject?.ltuidV2),
    hasLtokenV2: Boolean(config.cookieObject?.ltokenV2),
    hasCookieTokenV2: Boolean(config.cookieObject?.cookieTokenV2),
    lang: config.lang,
    regionPresent: Boolean(config.region),
    envFilesLoaded: config.envFilesLoaded,
    initializationStrategySelected,
  };
}

function determineCookieSource(input: {
  rawCookie?: string;
  hasExplicitV2: boolean;
  ltuidV2?: string;
  ltokenV2?: string;
  ltuid?: string;
  ltoken?: string;
}): CookieSource {
  if (input.rawCookie) {
    return "HOYOAPI_COOKIE";
  }

  if (input.ltuidV2 && input.ltokenV2) {
    return input.hasExplicitV2 ? "HOYOAPI_*" : "legacy_v2";
  }

  if (input.ltuid && input.ltoken) {
    return "legacy_v1";
  }

  return "missing";
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}
