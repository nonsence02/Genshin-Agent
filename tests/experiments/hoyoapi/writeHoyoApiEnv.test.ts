import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { upsertEnvValues, writeHoyoApiEnvFile } from "../../../src/experiments/hoyoapi/writeHoyoApiEnv.js";

describe("writeHoyoApiEnv", () => {
  it("updates and appends values without losing unrelated variables", () => {
    const content = "DATABASE_URL=postgres://example\nUNCHANGED=value\nHOYOAPI_LANG=ru\n";
    const next = upsertEnvValues(content, {
      HOYOAPI_COOKIE: "\"ltuid=1; ltoken=secret\"",
      HOYOAPI_LANG: "en",
    });

    expect(next).toContain("DATABASE_URL=postgres://example");
    expect(next).toContain("UNCHANGED=value");
    expect(next).toContain("HOYOAPI_LANG=en");
    expect(next).toContain('HOYOAPI_COOKIE="ltuid=1; ltoken=secret"');
  });

  it("writes .env.local updates when enabled", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoyoapi-env-"));
    const out = join(dir, ".env.local");
    const result = writeHoyoApiEnvFile(out, {
      cookieString: "ltuid=1; ltoken=secret",
      uid: 711328650,
      lang: "en",
    });

    expect(result.written).toBe(true);
    expect(readFileSync(out, "utf8")).toContain("HOYOAPI_UID=711328650");
    expect(readFileSync(out, "utf8")).toContain("HOYOAPI_COOKIE=");
  });

  it("writes nothing with --no-write", () => {
    const result = writeHoyoApiEnvFile(
      ".env.local",
      {
        cookieString: "ltuid=1; ltoken=secret",
      },
      { noWrite: true },
    );

    expect(result).toMatchObject({
      written: false,
      reason: "--no-write",
    });
  });
});
