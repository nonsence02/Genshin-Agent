import { describe, expect, it } from "vitest";
import {
  buildConfigDiagnostic,
  buildHoyoApiExperimentConfig,
  MISSING_HOYOAPI_CREDENTIALS_MESSAGE,
} from "../../../src/experiments/hoyoapi/loadHoyoApiEnv.js";
import { createGenshinClient } from "../../../src/experiments/hoyoapi/HoyoApiExperimentClient.js";

describe("loadHoyoApiEnv", () => {
  it("reads explicit HOYOAPI variables", () => {
    const config = buildHoyoApiExperimentConfig(
      {
        HOYOAPI_UID: "700000001",
        HOYOAPI_LTUID_V2: "1001",
        HOYOAPI_LTOKEN_V2: "explicit-token",
        HOYOAPI_COOKIE_TOKEN_V2: "explicit-cookie-token",
        HOYOAPI_LANG: "en",
      },
      [".env.local"],
    );

    expect(config.uid).toBe(700000001);
    expect(config.credentialSource.uid).toBe("HOYOAPI_UID");
    expect(config.credentialSource.cookie).toBe("HOYOAPI_*");
    expect(config.cookieObject?.ltuidV2).toBe("1001");
    expect(config.cookieObject?.ltokenV2).toBe("explicit-token");
    expect(config.cookieObject?.cookieTokenV2).toBe("explicit-cookie-token");
    expect(config.envFilesLoaded).toEqual([".env.local"]);
  });

  it("reads legacy project variables", () => {
    const config = buildHoyoApiExperimentConfig({
      GENSHIN_UID: "711328650",
      LTUID_V2: "2002",
      LTOKEN_V2: "legacy-token",
      COOKIE_TOKEN_V2: "legacy-cookie-token",
    });

    expect(config.uid).toBe(711328650);
    expect(config.credentialSource.uid).toBe("GENSHIN_UID");
    expect(config.credentialSource.cookie).toBe("legacy_v2");
    expect(config.cookieObject?.ltuidV2).toBe("2002");
    expect(config.cookieObject?.ltokenV2).toBe("legacy-token");
    expect(config.cookieObject?.cookieTokenV2).toBe("legacy-cookie-token");
    expect(config.lang).toBe("en");
  });

  it("lets HOYOAPI variables take precedence over legacy variables", () => {
    const config = buildHoyoApiExperimentConfig({
      HOYOAPI_UID: "700000001",
      GENSHIN_UID: "711328650",
      HOYOAPI_LTUID_V2: "1001",
      LTUID_V2: "2002",
      HOYOAPI_LTOKEN_V2: "explicit-token",
      LTOKEN_V2: "legacy-token",
    });

    expect(config.uid).toBe(700000001);
    expect(config.credentialSource.uid).toBe("HOYOAPI_UID");
    expect(config.credentialSource.cookie).toBe("HOYOAPI_*");
    expect(config.cookieObject?.ltuidV2).toBe("1001");
    expect(config.cookieObject?.ltokenV2).toBe("explicit-token");
  });

  it("lets HOYOAPI_COOKIE take priority over v2 fields", () => {
    const config = buildHoyoApiExperimentConfig({
      HOYOAPI_COOKIE: "ltuid=1; ltoken=full-cookie-token",
      HOYOAPI_LTUID_V2: "1001",
      HOYOAPI_LTOKEN_V2: "explicit-token",
    });

    expect(config.cookieString).toBe("ltuid=1; ltoken=full-cookie-token");
    expect(config.credentialSource.cookie).toBe("HOYOAPI_COOKIE");
    expect(buildConfigDiagnostic(config)).toMatchObject({
      fullCookiePresent: true,
      v2FieldsPresent: true,
      cookieSource: "HOYOAPI_COOKIE",
    });
  });

  it("prints non-secret config diagnostics", () => {
    const config = buildHoyoApiExperimentConfig(
      {
        GENSHIN_UID: "711328650",
        LTUID_V2: "2002",
        LTOKEN_V2: "legacy-token",
        COOKIE_TOKEN_V2: "legacy-cookie-token",
      },
      [".env"],
    );
    const diagnostic = buildConfigDiagnostic(config, "v2-object:constructor");
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic).toMatchObject({
      uidPresent: true,
      uidSource: "GENSHIN_UID",
      cookiePresent: true,
      cookieSource: "legacy_v2",
      hasLtuidV2: true,
      hasLtokenV2: true,
      hasCookieTokenV2: true,
      initializationStrategySelected: "v2-object:constructor",
    });
    expect(serialized).not.toContain("legacy-token");
    expect(serialized).not.toContain("legacy-cookie-token");
    expect(serialized).not.toContain("2002");
  });

  it("missing credential error lists explicit and legacy variable names", async () => {
    const config = buildHoyoApiExperimentConfig({});

    await expect(createGenshinClient(config)).rejects.toThrow(MISSING_HOYOAPI_CREDENTIALS_MESSAGE);
    await expect(createGenshinClient(config)).rejects.toThrow("GENSHIN_UID");
    await expect(createGenshinClient(config)).rejects.toThrow("LTUID_V2");
    await expect(createGenshinClient(config)).rejects.toThrow("COOKIE_TOKEN_V2");
  });
});
