import type { CharacterDiffPayload, CharacterPlanPayload, CharacterRequirementsPayload } from "../api/client.js";

export interface PlannerFormState {
  playerKey: string;
  characterKey: string;
  currentLevel: number;
  currentAscensionPhase: string;
  targetLevel: number;
  targetAscensionPhase: string;
  currentNormal: number;
  currentSkill: number;
  currentBurst: number;
  targetNormal: number;
  targetSkill: number;
  targetBurst: number;
  days: number;
  dailyResinBudget: number;
  currentResin: string;
  useCurrentResinOnFirstDay: boolean;
  planStyle: "fastest" | "resin_efficient" | "low_effort";
  blockedDaysOfWeek: string[];
  blockedDates: string;
  allowFragileResin: boolean;
  maxFragileResin: number;
  excludedSourceTypes: string;
  excludedMaterials: string;
  usePlayerState: boolean;
  useCrafting: boolean;
  allowDustOfAzoth: boolean;
  allowDreamSolvent: boolean;
  includeManualOverrides: boolean;
  discountedWeeklyBossClaimsUsed: number;
}

export const furinaDefaults: PlannerFormState = {
  playerKey: "default",
  characterKey: "char_furina",
  currentLevel: 20,
  currentAscensionPhase: "",
  targetLevel: 90,
  targetAscensionPhase: "",
  currentNormal: 1,
  currentSkill: 1,
  currentBurst: 1,
  targetNormal: 1,
  targetSkill: 9,
  targetBurst: 10,
  days: 7,
  dailyResinBudget: 180,
  currentResin: "",
  useCurrentResinOnFirstDay: false,
  planStyle: "resin_efficient",
  blockedDaysOfWeek: [],
  blockedDates: "",
  allowFragileResin: false,
  maxFragileResin: 0,
  excludedSourceTypes: "",
  excludedMaterials: "",
  usePlayerState: false,
  useCrafting: true,
  allowDustOfAzoth: false,
  allowDreamSolvent: false,
  includeManualOverrides: true,
  discountedWeeklyBossClaimsUsed: 0,
};

export function buildRequirementsPayload(form: PlannerFormState): CharacterRequirementsPayload {
  return {
    characterKey: form.characterKey.trim(),
    currentLevel: form.currentLevel,
    targetLevel: form.targetLevel,
    currentAscensionPhase: form.currentAscensionPhase.trim() === "" ? undefined : Number(form.currentAscensionPhase),
    targetAscensionPhase: form.targetAscensionPhase.trim() === "" ? undefined : Number(form.targetAscensionPhase),
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
    includeManualOverrides: form.includeManualOverrides,
  };
}

export function buildPlanPayload(form: PlannerFormState): CharacterPlanPayload {
  const payload: CharacterPlanPayload = {
    ...buildDiffPayload(form),
    days: form.days,
    dailyResinBudget: form.dailyResinBudget,
    useCurrentResinOnFirstDay: form.useCurrentResinOnFirstDay,
    discountedWeeklyBossClaimsUsed: form.discountedWeeklyBossClaimsUsed,
    preferences: {
      planStyle: form.planStyle,
      days: form.days,
      dailyResinBudget: form.dailyResinBudget,
      currentResin: form.currentResin.trim() === "" ? undefined : Number(form.currentResin),
      useCurrentResinOnFirstDay: form.useCurrentResinOnFirstDay,
      fragileResin: {
        allowed: form.allowFragileResin,
        maxToUse: form.maxFragileResin,
        resinPerFragile: 60,
      },
      availability: {
        blockedDaysOfWeek: form.blockedDaysOfWeek,
        blockedDates: commaList(form.blockedDates),
      },
      weeklyBosses: {
        discountedClaimsUsedThisWeek: form.discountedWeeklyBossClaimsUsed,
      },
      sourceFilters: {
        excludedSourceTypes: commaList(form.excludedSourceTypes),
      },
      crafting: {
        useCrafting: form.useCrafting,
        allowDustOfAzoth: form.allowDustOfAzoth,
        allowDreamSolvent: form.allowDreamSolvent,
      },
      manualTaskExclusions: commaList(form.excludedMaterials).map((materialKey) => ({
        materialKey,
        reason: "Excluded in UI preferences",
      })),
    },
  };

  if (form.currentResin.trim() !== "") {
    payload.currentResin = Number(form.currentResin);
  }

  return payload;
}

function commaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
