import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeHoyoApiOutput } from "../../../src/experiments/hoyoapi/writeHoyoApiOutput.js";

describe("writeHoyoApiOutput", () => {
  it("reports the output path when --out is used", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoyoapi-output-"));
    const out = join(dir, "latest.sanitized.json");
    const result = writeHoyoApiOutput({ ok: true, cookie: "secret" }, { out });

    expect(result.written).toBe(true);
    expect(result.path).toBe(out);
    expect(readFileSync(out, "utf8")).toContain("[REDACTED]");
  });

  it("writes nothing when --no-write is used", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoyoapi-output-"));
    const out = join(dir, "latest.sanitized.json");
    const result = writeHoyoApiOutput({ ok: true }, { out, noWrite: true });

    expect(result).toMatchObject({
      written: false,
      path: out,
      reason: "--no-write",
    });
  });
});
