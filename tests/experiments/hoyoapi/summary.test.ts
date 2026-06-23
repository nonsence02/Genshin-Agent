import { describe, expect, it, vi } from "vitest";
import { runHoyoApiExperimentAgainstClient } from "../../../src/experiments/hoyoapi/HoyoApiExperimentClient.js";
import { buildHoyoApiExperimentSummary } from "../../../src/experiments/hoyoapi/sanitizeHoyoApiOutput.js";

describe("hoyoapi summary", () => {
  it("handles partial endpoint failures", () => {
    const summary = buildHoyoApiExperimentSummary({
      endpoints: {
        records: { status: "error", error: "auth failed" },
        characters: { status: "ok", data: { avatars: [{ id: 10000089, level: 90 }] }, count: 1 },
        charactersSummary: { status: "skipped" },
      },
      characterIds: [10000089],
      dailyClaimCalled: false,
    });

    expect(summary.recordsEndpoint).toBe("error");
    expect(summary.charactersEndpoint).toBe("ok");
    expect(summary.charactersCount).toBe(1);
    expect(summary.characterIdsExtracted).toEqual([10000089]);
  });

  it("does not call daily claim by default", async () => {
    const claim = vi.fn();
    const client = {
      record: {
        records: vi.fn().mockResolvedValue({}),
        characters: vi.fn().mockResolvedValue({ avatars: [{ id: 10000089 }] }),
        charactersSummary: vi.fn().mockResolvedValue({ avatars: [] }),
        dailyNote: vi.fn().mockResolvedValue({}),
      },
      daily: {
        info: vi.fn().mockResolvedValue({}),
        rewards: vi.fn().mockResolvedValue({ awards: [] }),
        reward: vi.fn().mockResolvedValue({}),
        claim,
      },
    };

    const report = await runHoyoApiExperimentAgainstClient(client);

    expect(claim).not.toHaveBeenCalled();
    expect(report.summary.dailyClaimCalled).toBe(false);
    expect(report.summary.dailyClaimEndpoint).toBe("skipped");
  });
});
