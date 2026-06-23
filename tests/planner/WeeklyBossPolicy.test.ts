import { describe, expect, it } from "vitest";
import { WeeklyBossPolicy } from "../../src/planner/policies/WeeklyBossPolicy.js";

describe("WeeklyBossPolicy", () => {
  const policy = new WeeklyBossPolicy();

  it("exposes weekly reset policy metadata", () => {
    expect(policy.weeklyResetDay).toBe("monday");
    expect(policy.weeklyResetHour).toBe(4);
    expect(policy.maxClaimsPerBossPerWeek).toBe(1);
  });

  it("charges 30 resin for 1 planned claim with no discounts used", () => {
    expect(policy.calculateCost({ plannedClaims: 1, discountedClaimsUsedThisWeek: 0 })).toMatchObject({
      discountedClaimsApplied: 1,
      normalCostClaims: 0,
      totalResinCost: 30,
      perClaimCosts: [30],
    });
  });

  it("charges 30 + 30 + 30 + 60 for 4 planned claims with no discounts used", () => {
    expect(policy.calculateCost({ plannedClaims: 4, discountedClaimsUsedThisWeek: 0 })).toMatchObject({
      discountedClaimsApplied: 3,
      normalCostClaims: 1,
      totalResinCost: 150,
      perClaimCosts: [30, 30, 30, 60],
    });
  });

  it("charges 30 + 60 for 2 planned claims with 2 discounts already used", () => {
    expect(policy.calculateCost({ plannedClaims: 2, discountedClaimsUsedThisWeek: 2 })).toMatchObject({
      discountedClaimsApplied: 1,
      normalCostClaims: 1,
      totalResinCost: 90,
      perClaimCosts: [30, 60],
    });
  });

  it("rejects invalid inputs", () => {
    expect(() => policy.calculateCost({ plannedClaims: -1 })).toThrow();
    expect(() => policy.calculateCost({ plannedClaims: 1.5 })).toThrow();
    expect(() => policy.calculateCost({ plannedClaims: 1, discountedClaimsUsedThisWeek: -1 })).toThrow();
    expect(() => policy.calculateCost({ plannedClaims: 1, discountedClaimsUsedThisWeek: 4 })).toThrow();
  });
});
