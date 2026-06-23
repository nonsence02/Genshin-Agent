import { describe, expect, it } from "vitest";
import {
  buildDiffPayload,
  buildPlanPayload,
  buildRequirementsPayload,
  furinaDefaults,
} from "../../apps/web/src/planner/form.js";

describe("planner form payload builders", () => {
  it("maps fields into character requirements payload", () => {
    expect(buildRequirementsPayload(furinaDefaults)).toMatchObject({
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
      currentTalents: { normal: 1, skill: 1, burst: 1 },
      targetTalents: { normal: 1, skill: 9, burst: 10 },
    });
  });

  it("maps crafting options into diff payload", () => {
    expect(buildDiffPayload({ ...furinaDefaults, allowDustOfAzoth: true })).toMatchObject({
      playerKey: "default",
      useCrafting: true,
      allowDustOfAzoth: true,
      allowDreamSolvent: false,
      includeManualOverrides: true,
    });
  });

  it("can disable manual overrides in planner payload", () => {
    expect(buildPlanPayload({ ...furinaDefaults, includeManualOverrides: false })).toMatchObject({
      includeManualOverrides: false,
    });
  });

  it("omits blank current resin in plan payload", () => {
    expect(buildPlanPayload(furinaDefaults)).not.toHaveProperty("currentResin");
  });

  it("includes numeric current resin when set", () => {
    expect(buildPlanPayload({ ...furinaDefaults, currentResin: "160" })).toMatchObject({
      currentResin: 160,
      days: 7,
      dailyResinBudget: 180,
    });
  });
});
