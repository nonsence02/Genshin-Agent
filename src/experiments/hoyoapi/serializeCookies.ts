export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface CookiePresence {
  ltuid: boolean;
  ltoken: boolean;
  cookie_token: boolean;
  account_id: boolean;
  ltuid_v2: boolean;
  ltoken_v2: boolean;
  cookie_token_v2: boolean;
  account_id_v2: boolean;
  account_mid_v2: boolean;
  DEVICEFP: boolean;
  mi18nLang: boolean;
  _HYVUUID: boolean;
  _MHYUUID: boolean;
}

export interface CookieSerializationSummary {
  totalCookies: number;
  relevantCookies: number;
  domainsSeen: string[];
  importantCookieNamesPresent: CookiePresence;
  duplicateNames: string[];
  serializedCookieNames: string[];
}

export interface CookieSerializationResult {
  cookieString: string;
  selectedCookies: BrowserCookie[];
  summary: CookieSerializationSummary;
}

const RELEVANT_DOMAIN_PATTERNS = ["hoyolab.com", "hoyoverse.com"];
const IMPORTANT_COOKIE_NAMES = [
  "ltuid",
  "ltoken",
  "cookie_token",
  "account_id",
  "ltuid_v2",
  "ltoken_v2",
  "cookie_token_v2",
  "account_id_v2",
  "account_mid_v2",
  "DEVICEFP",
  "mi18nLang",
  "_HYVUUID",
  "_MHYUUID",
] as const;

export function serializeHoyolabCookies(cookies: BrowserCookie[]): CookieSerializationResult {
  const relevantCookies = cookies.filter(isRelevantCookie);
  const selectedByName = new Map<string, BrowserCookie>();
  const duplicateNames = new Set<string>();

  for (const cookie of relevantCookies) {
    const existing = selectedByName.get(cookie.name);

    if (!existing) {
      selectedByName.set(cookie.name, cookie);
      continue;
    }

    duplicateNames.add(cookie.name);
    selectedByName.set(cookie.name, choosePreferredCookie(existing, cookie));
  }

  const selectedCookies = [...selectedByName.values()].sort((left, right) => left.name.localeCompare(right.name));

  return {
    cookieString: selectedCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
    selectedCookies,
    summary: {
      totalCookies: cookies.length,
      relevantCookies: relevantCookies.length,
      domainsSeen: [...new Set(relevantCookies.map((cookie) => cookie.domain))].sort(),
      importantCookieNamesPresent: buildPresence(selectedCookies),
      duplicateNames: [...duplicateNames].sort(),
      serializedCookieNames: selectedCookies.map((cookie) => cookie.name),
    },
  };
}

export function safeCookieSummary(result: CookieSerializationResult): CookieSerializationSummary {
  return result.summary;
}

function isRelevantCookie(cookie: BrowserCookie): boolean {
  const domain = cookie.domain.toLowerCase();

  return RELEVANT_DOMAIN_PATTERNS.some((pattern) => domain.includes(pattern));
}

function choosePreferredCookie(left: BrowserCookie, right: BrowserCookie): BrowserCookie {
  const leftScore = scoreCookie(left);
  const rightScore = scoreCookie(right);

  if (leftScore !== rightScore) {
    return rightScore > leftScore ? right : left;
  }

  const leftPathLength = left.path?.length ?? 0;
  const rightPathLength = right.path?.length ?? 0;

  if (leftPathLength !== rightPathLength) {
    return rightPathLength > leftPathLength ? right : left;
  }

  return (right.expires ?? 0) > (left.expires ?? 0) ? right : left;
}

function scoreCookie(cookie: BrowserCookie): number {
  const domain = cookie.domain.toLowerCase();

  if (domain.includes("act.hoyolab.com") || domain.includes("hoyolab.com")) {
    return 3;
  }

  if (domain.includes("hoyoverse.com")) {
    return 2;
  }

  return 1;
}

function buildPresence(cookies: BrowserCookie[]): CookiePresence {
  const names = new Set(cookies.map((cookie) => cookie.name));

  return {
    ltuid: names.has("ltuid"),
    ltoken: names.has("ltoken"),
    cookie_token: names.has("cookie_token"),
    account_id: names.has("account_id"),
    ltuid_v2: names.has("ltuid_v2"),
    ltoken_v2: names.has("ltoken_v2"),
    cookie_token_v2: names.has("cookie_token_v2"),
    account_id_v2: names.has("account_id_v2"),
    account_mid_v2: names.has("account_mid_v2"),
    DEVICEFP: names.has("DEVICEFP"),
    mi18nLang: names.has("mi18nLang"),
    _HYVUUID: names.has("_HYVUUID"),
    _MHYUUID: names.has("_MHYUUID"),
  };
}
