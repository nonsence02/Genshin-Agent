import { describe, expect, it } from "vitest";
import { sanitizeHoyoApiOutput } from "../../../src/experiments/hoyoapi/sanitizeHoyoApiOutput.js";

describe("sanitizeHoyoApiOutput", () => {
  it("redacts cookie and token-like fields recursively", () => {
    const sanitized = sanitizeHoyoApiOutput({
      cookie: "ltoken=secret; ltuid=123",
      nested: {
        ltoken: "secret",
        safe: "Furina",
      },
    });

    expect(sanitized).toEqual({
      cookie: "[REDACTED]",
      nested: {
        ltoken: "[REDACTED]",
        safe: "Furina",
      },
    });
  });
});
