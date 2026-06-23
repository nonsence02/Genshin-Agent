import type { CharacterDiffPayload, CharacterPlanPayload, CharacterRequirementsPayload } from "../api/client.js";

export interface PlannerFormState {
  playerKey: string;
  characterKey: string;
  currentLevel: number;
  targetLevel: number;
  currentNormal: number;
  currentSkill: number;
  currentBurst: number;
  targetNormal: number;
  targetSkill: number;
  targetBurst: number;
  days: number;
  dailyResinBudget: number;
  currentResin: string;
  usePlayerState: boolean;
  useCrafting: boolean;
  allowDustOfAzoth: boolean;
  allowDreamSolvent: boolean;
  discountedWeeklyBossClaimsUsed: number;
}

export const furinaDefaults: PlannerFormState = {
  playerKey: "default",
  characterKey: "char_furina",
  currentLevel: 20,
  targetLevel: 90,
  currentNormal: 1,
  currentSkill: 1,
  currentBurst: 1,
  targetNormal: 1,
  targetSkill: 9,
  targetBurst: 10,
  days: 7,
  dailyResinBudget: 180,
  currentResin: "",
  usePlayerState: false,
  useCrafting: true,
  allowDustOfAzoth: false,
  allowDreamSolvent: false,
  discountedWeeklyBossClaimsUsed: 0,
};

export function buildRequirementsPayload(form: PlannerFormState): CharacterRequirementsPayload {
  return {
    characterKey: form.characterKey.trim(),
    currentLevel: form.currentLevel,
    targetLevel: form.targetLevel,
    currentTalents: {
      normal: form.currentNormal,
      skill: form.currentSkill,
      burst: form.currentBurst,
    },
    targetTalents: {
      normal: form.targetNormal,
      skill: form.targetSkill,
      burst: form.targetBurst,
    },
  };
}

export function buildDiffPayload(form: PlannerFormState): CharacterDiffPayload {
  return {
    ...buildRequirementsPayload(form),
    playerKey: form.playerKey.trim(),
    usePlayerState: form.usePlayerState,
    withSources: true,
    classify: true,
    useCrafting: form.useCrafting,
    allowDustOfAzoth: form.allowDustOfAzoth,
    allowDreamSolvent: form.allowDreamSolvent,
  };
}

export function buildPlanPayload(form: PlannerFormState): CharacterPlanPayload {
  const payload: CharacterPlanPayload = {
    ...buildDiffPayload(form),
    days: form.days,
    dailyResinBudget: form.dailyResinBudget,
    discountedWeeklyBossClaimsUsed: form.discountedWeeklyBossClaimsUsed,
  };

  if (form.currentResin.trim() !== "") {
    payload.currentResin = Number(form.currentResin);
  }

  return payload;
}
