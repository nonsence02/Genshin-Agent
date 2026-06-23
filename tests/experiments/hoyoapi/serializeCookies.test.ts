import { describe, expect, it } from "vitest";
import { serializeHoyolabCookies, type BrowserCookie } from "../../../src/experiments/hoyoapi/serializeCookies.js";
import { sanitizeHoyoApiOutput } from "../../../src/experiments/hoyoapi/sanitizeHoyoApiOutput.js";

describe("serializeHoyolabCookies", () => {
  it("filters relevant HoYoLAB and HoYoverse domains", () => {
    const result = serializeHoyolabCookies([
      cookie("ltuid", "1", ".hoyolab.com"),
      cookie("ignored", "2", "example.com"),
      cookie("DEVICEFP", "3", ".hoyoverse.com"),
    ]);

    expect(result.summary.totalCookies).toBe(3);
    expect(result.summary.relevantCookies).toBe(2);
    expect(result.cookieString).toContain("ltuid=1");
    expect(result.cookieString).toContain("DEVICEFP=3");
    expect(result.cookieString).not.toContain("ignored=2");
  });

  it("prefers hoyolab duplicate cookies over hoyoverse cookies", () => {
    const result = serializeHoyolabCookies([
      cookie("ltoken", "hoyoverse", ".hoyoverse.com"),
      cookie("ltoken", "hoyolab", ".hoyolab.com"),
    ]);

    expect(result.cookieString).toContain("ltoken=hoyolab");
    expect(result.cookieString).not.toContain("ltoken=hoyoverse");
    expect(result.summary.duplicateNames).toEqual(["ltoken"]);
  });

  it("detects important cookie names", () => {
    const result = serializeHoyolabCookies([
      cookie("ltuid", "1", ".hoyolab.com"),
      cookie("ltoken", "2", ".hoyolab.com"),
      cookie("cookie_token", "3", ".hoyolab.com"),
      cookie("account_id", "4", ".hoyolab.com"),
      cookie("ltuid_v2", "5", ".hoyolab.com"),
      cookie("ltoken_v2", "6", ".hoyolab.com"),
      cookie("cookie_token_v2", "7", ".hoyolab.com"),
      cookie("account_id_v2", "8", ".hoyolab.com"),
      cookie("DEVICEFP", "9", ".hoyolab.com"),
    ]);

    expect(result.summary.importantCookieNamesPresent).toMatchObject({
      ltuid: true,
      ltoken: true,
      cookie_token: true,
      account_id: true,
      ltuid_v2: true,
      ltoken_v2: true,
      cookie_token_v2: true,
      account_id_v2: true,
      DEVICEFP: true,
    });
  });

  it("does not expose cookie values in sanitized diagnostics", () => {
    const result = serializeHoyolabCookies([cookie("ltoken", "very-secret", ".hoyolab.com")]);
    const sanitized = sanitizeHoyoApiOutput({ summary: result.summary });

    expect(JSON.stringify(sanitized)).not.toContain("very-secret");
  });
});

function cookie(name: string, value: string, domain: string): BrowserCookie {
  return {
    name,
    value,
    domain,
    path: "/",
    expires: 100,
  };
}
