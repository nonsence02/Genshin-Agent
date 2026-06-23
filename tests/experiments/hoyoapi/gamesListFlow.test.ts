import { describe, expect, it } from "vitest";
import { selectGameAccount } from "../../../src/experiments/hoyoapi/HoyoApiExperimentClient.js";
import { sanitizeHoyoApiOutput } from "../../../src/experiments/hoyoapi/sanitizeHoyoApiOutput.js";

describe("hoyolab gamesList flow helpers", () => {
  it("selects the account matching the preferred uid", () => {
    const selected = selectGameAccount(
      [
        { game_uid: "700000001", region: "os_euro", level: 10 },
        { game_uid: "700000002", region: "os_usa", level: 60 },
      ],
      700000001,
    );

    expect(selected.uid).toBe("700000001");
    expect(selected.region).toBe("os_euro");
  });

  it("falls back to the highest-level account", () => {
    const selected = selectGameAccount([
      { game_uid: "700000001", region: "os_euro", level: 10 },
      { game_uid: "700000002", region: "os_usa", level: 60 },
    ]);

    expect(selected.uid).toBe("700000002");
  });

  it("falls back to the first account when levels are unavailable", () => {
    const selected = selectGameAccount([
      { game_uid: "700000001", region: "os_euro" },
      { game_uid: "700000002", region: "os_usa" },
    ]);

    expect(selected.uid).toBe("700000001");
  });

  it("sanitizes selected account token-like fields", () => {
    const sanitized = sanitizeHoyoApiOutput({
      selectedGameAccount: {
        game_uid: "700000001",
        region: "os_euro",
        cookie: "ltoken=secret",
        cookie_token_v2: "secret",
      },
    });

    expect(JSON.stringify(sanitized)).not.toContain("secret");
  });
});
