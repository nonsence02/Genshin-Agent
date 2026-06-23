import { describe, expect, it } from "vitest";
import { ResinPolicy } from "../../src/planner/policies/ResinPolicy.js";

describe("ResinPolicy", () => {
  const policy = new ResinPolicy();

  it("uses the default resin constants", () => {
    expect(policy.config.resinCap).toBe(200);
    expect(policy.config.naturalResinPerDay).toBe(180);
    expect(policy.config.resinRegenMinutesPerUnit).toBe(8);
  });

  it("calculates natural resin and recovery minutes", () => {
    expect(policy.getNaturalResinForDays(1)).toBe(180);
    expect(policy.getNaturalResinForDays(2)).toBe(360);
    expect(policy.getResinRecoveryMinutes(40)).toBe(320);
  });

  it("maps resin costs by source type", () => {
    expect(policy.getBaseCostForSourceType("domain")).toBe(20);
    expect(policy.getBaseCostForSourceType("talent_domain")).toBe(20);
    expect(policy.getBaseCostForSourceType("ley_line")).toBe(20);
    expect(policy.getBaseCostForSourceType("boss")).toBe(40);
    expect(policy.getBaseCostForSourceType("normal_boss")).toBe(40);
    expect(policy.getBaseCostForSourceType("local_specialty")).toBeNull();
    expect(policy.getBaseCostForSourceType("enemy")).toBeNull();
    expect(policy.getBaseCostForSourceType("unknown")).toBeNull();
  });

  it("identifies resin-gated source types without treating unknown as gated", () => {
    expect(policy.isResinGatedSourceType("domain")).toBe(true);
    expect(policy.isResinGatedSourceType("weekly_boss")).toBe(true);
    expect(policy.isResinGatedSourceType("trounce_domain")).toBe(true);
    expect(policy.isResinGatedSourceType("enemy")).toBe(false);
    expect(policy.isResinGatedSourceType("local_specialty")).toBe(false);
    expect(policy.isResinGatedSourceType("unknown")).toBe(false);
  });
});
