import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const level = z.coerce.number().int().min(1).max(90);
const talentLevel = z.coerce.number().int().min(1).max(10);
const ascensionPhase = z.coerce.number().int().min(0).max(6);
const dayName = z.enum(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const planStyle = z.enum(["fastest", "resin_efficient", "low_effort"]);

export const booleanQuerySchema = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === "true" || value === true || value === "1") {
    return true;
  }
  if (value === "false" || value === false || value === "0") {
    return false;
  }
  return value;
}, z.boolean().optional());

export const materialKeyParamsSchema = z.object({
  materialKey: nonEmptyString,
});

export const playerKeyParamsSchema = z.object({
  playerKey: nonEmptyString,
});

export const playerMaterialKeyParamsSchema = z.object({
  playerKey: nonEmptyString,
  materialKey: nonEmptyString,
});

export const playerCharacterKeyParamsSchema = z.object({
  playerKey: nonEmptyString,
  characterKey: nonEmptyString,
});

export const playerStateQuerySchema = z.object({
  includeArtifacts: booleanQuerySchema.default(true),
  characterKey: nonEmptyString.optional(),
});

export const materialSourcesQuerySchema = z.object({
  includeCalendar: booleanQuerySchema.default(true),
});

export const levelCostsQuerySchema = z.object({
  currentLevel: level,
  targetLevel: level,
});

export const talentLevelsSchema = z.object({
  normal: talentLevel.optional(),
  skill: talentLevel.optional(),
  burst: talentLevel.optional(),
});

export const characterRequirementsBodySchema = z.object({
  characterKey: nonEmptyString,
  currentLevel: level,
  targetLevel: level,
  currentAscensionPhase: ascensionPhase.optional(),
  targetAscensionPhase: ascensionPhase.optional(),
  currentTalents: talentLevelsSchema.optional(),
  targetTalents: talentLevelsSchema.optional(),
});

export const characterDiffBodySchema = characterRequirementsBodySchema
  .extend({
    playerKey: nonEmptyString,
    inventorySnapshotId: z.coerce.number().int().positive().optional(),
    usePlayerState: z.boolean().optional(),
    withSources: z.boolean().optional(),
    classify: z.boolean().optional(),
    useCrafting: z.boolean().optional(),
    allowDustOfAzoth: z.boolean().optional(),
    allowDreamSolvent: z.boolean().optional(),
    includeManualOverrides: z.boolean().optional(),
  })
  .omit({ currentLevel: true })
  .extend({
    currentLevel: level.optional(),
  });

const planPreferencesSchema = z.object({
  planStyle: planStyle.optional(),
  days: z.coerce.number().int().min(1).max(30).optional(),
  startDate: dateString.optional(),
  dailyResinBudget: z.coerce.number().int().min(0).max(2000).optional(),
  currentResin: z.coerce.number().int().min(0).max(2000).optional(),
  useCurrentResinOnFirstDay: z.boolean().optional(),
  fragileResin: z.object({
    allowed: z.boolean(),
    maxToUse: z.coerce.number().int().min(0).optional(),
    resinPerFragile: z.coerce.number().int().min(1).optional(),
  }).optional(),
  availability: z.object({
    blockedDaysOfWeek: z.array(dayName).optional(),
    blockedDates: z.array(dateString).optional(),
    preferredDaysOfWeek: z.array(dayName).optional(),
    maxResinByDate: z.record(dateString, z.coerce.number().int().min(0).max(2000)).optional(),
    maxResinByDayOfWeek: z.record(dayName, z.coerce.number().int().min(0).max(2000)).optional(),
  }).optional(),
  weeklyBosses: z.object({
    discountedClaimsUsedThisWeek: z.coerce.number().int().min(0).max(3).optional(),
    blockedWeeklyBossSourceKeys: z.array(nonEmptyString).optional(),
    alreadyClaimedSourceKeys: z.array(nonEmptyString).optional(),
  }).optional(),
  sourceFilters: z.object({
    excludedSourceTypes: z.array(nonEmptyString).optional(),
    excludedSourceKeys: z.array(nonEmptyString).optional(),
    preferSourceTypes: z.array(nonEmptyString).optional(),
  }).optional(),
  crafting: z.object({
    useCrafting: z.boolean().optional(),
    allowDustOfAzoth: z.boolean().optional(),
    allowDreamSolvent: z.boolean().optional(),
  }).optional(),
  manualTaskExclusions: z.array(z.object({
    materialKey: nonEmptyString.optional(),
    sourceKey: nonEmptyString.optional(),
    sourceType: nonEmptyString.optional(),
    reason: z.string().max(500).optional(),
  })).optional(),
});

export const characterPlanBodySchema = characterDiffBodySchema.extend({
  startDate: dateString.optional(),
  days: z.coerce.number().int().min(1).max(30).optional(),
  dailyResinBudget: z.coerce.number().int().min(0).max(2000).optional(),
  currentResin: z.coerce.number().int().min(0).max(2000).optional(),
  useCurrentResinOnFirstDay: z.boolean().optional(),
  includeOpenWorld: z.boolean().optional(),
  discountedWeeklyBossClaimsUsed: z.coerce.number().int().min(0).max(3).optional(),
  planStyle: planStyle.optional(),
  preferences: planPreferencesSchema.optional(),
});

export const effectiveInventoryQuerySchema = z.object({
  snapshotId: z.coerce.number().int().positive().optional(),
  includeManualOverrides: booleanQuerySchema.default(true),
});

export const manualOverrideBodySchema = z.object({
  mode: z.enum(["absolute", "delta"]),
  quantity: z.coerce.number().int(),
  reason: z.string().max(500).optional(),
  active: z.boolean().optional(),
});
