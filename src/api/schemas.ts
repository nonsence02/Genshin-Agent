import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const level = z.coerce.number().int().min(1).max(90);
const talentLevel = z.coerce.number().int().min(1).max(10);
const ascensionPhase = z.coerce.number().int().min(0).max(6);

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

export const characterPlanBodySchema = characterDiffBodySchema.extend({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.coerce.number().int().min(1).max(30).optional(),
  dailyResinBudget: z.coerce.number().int().min(0).max(2000).optional(),
  currentResin: z.coerce.number().int().min(0).max(2000).optional(),
  includeOpenWorld: z.boolean().optional(),
  discountedWeeklyBossClaimsUsed: z.coerce.number().int().min(0).max(3).optional(),
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
