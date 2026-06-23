import { describe, expect, it } from "vitest";
import { PlanPreferenceError, PlanPreferenceResolver } from "../../src/planner/services/PlanPreferenceResolver.js";

describe("PlanPreferenceResolver", () => {
  it("applies default preferences", () => {
    const preferences = new PlanPreferenceResolver().resolve({});

    expect(preferences).toMatchObject({
      planStyle: "resin_efficient",
      days: 7,
      dailyResinBudget: 180,
      fragileResin: { allowed: false, maxToUse: 0, resinPerFragile: 60 },
      weeklyBosses: { discountedClaimsUsedThisWeek: 0 },
      crafting: { useCrafting: true, allowDustOfAzoth: false, allowDreamSolvent: false },
    });
  });

  it("rejects invalid day names", () => {
    expect(() =>
      new PlanPreferenceResolver().resolve({
        preferences: { availability: { blockedDaysOfWeek: ["moonday"] } },
      }),
    ).toThrow(PlanPreferenceError);
  });

  it("lets nested preferences override legacy fields", () => {
    const preferences = new PlanPreferenceResolver().resolve({
      days: 3,
      dailyResinBudget: 100,
      preferences: { days: 5, dailyResinBudget: 120, planStyle: "fastest" },
    });

    expect(preferences).toMatchObject({ days: 5, dailyResinBudget: 120, planStyle: "fastest" });
  });
});
