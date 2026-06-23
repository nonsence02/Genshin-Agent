import { DAY_NAMES, type DayOfWeek, type PlanPreferences, type PlanPreferencesResolved, type PlanStyle } from "../preferences/PlanPreferences.js";

export interface LegacyPlanPreferenceInput {
  planStyle?: PlanStyle;
  days?: number;
  startDate?: string;
  dailyResinBudget?: number;
  currentResin?: number;
  useCurrentResinOnFirstDay?: boolean;
  discountedWeeklyBossClaimsUsed?: number;
  useCrafting?: boolean;
  allowDustOfAzoth?: boolean;
  allowDreamSolvent?: boolean;
  preferences?: PlanPreferences;
}

export class PlanPreferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanPreferenceError";
  }
}

export class PlanPreferenceResolver {
  resolve(input: LegacyPlanPreferenceInput): PlanPreferencesResolved {
    const preferences = input.preferences ?? {};
    const availability = preferences.availability ?? {};
    const weeklyBosses = preferences.weeklyBosses ?? {};
    const sourceFilters = preferences.sourceFilters ?? {};
    const crafting = preferences.crafting ?? {};
    const fragileResin = preferences.fragileResin ?? { allowed: false };
    const warnings: string[] = [];

    const resolved: PlanPreferencesResolved = {
      planStyle: preferences.planStyle ?? input.planStyle ?? "resin_efficient",
      days: preferences.days ?? input.days ?? 7,
      startDate: preferences.startDate ?? input.startDate,
      dailyResinBudget: preferences.dailyResinBudget ?? input.dailyResinBudget ?? 180,
      currentResin: preferences.currentResin ?? input.currentResin,
      useCurrentResinOnFirstDay: preferences.useCurrentResinOnFirstDay ?? input.useCurrentResinOnFirstDay ?? false,
      fragileResin: {
        allowed: fragileResin.allowed ?? false,
        maxToUse: fragileResin.maxToUse ?? 0,
        resinPerFragile: fragileResin.resinPerFragile ?? 60,
      },
      availability: {
        blockedDaysOfWeek: parseDays(availability.blockedDaysOfWeek ?? [], "blockedDaysOfWeek"),
        blockedDates: validateDates(availability.blockedDates ?? [], "blockedDates"),
        preferredDaysOfWeek: parseDays(availability.preferredDaysOfWeek ?? [], "preferredDaysOfWeek"),
        maxResinByDate: validateResinMap(availability.maxResinByDate ?? {}, "maxResinByDate"),
        maxResinByDayOfWeek: validateDayResinMap(availability.maxResinByDayOfWeek ?? {}),
      },
      weeklyBosses: {
        discountedClaimsUsedThisWeek: weeklyBosses.discountedClaimsUsedThisWeek ?? input.discountedWeeklyBossClaimsUsed ?? 0,
        blockedWeeklyBossSourceKeys: validateStrings(weeklyBosses.blockedWeeklyBossSourceKeys ?? [], "blockedWeeklyBossSourceKeys"),
        alreadyClaimedSourceKeys: validateStrings(weeklyBosses.alreadyClaimedSourceKeys ?? [], "alreadyClaimedSourceKeys"),
      },
      sourceFilters: {
        excludedSourceTypes: validateStrings(sourceFilters.excludedSourceTypes ?? [], "excludedSourceTypes"),
        excludedSourceKeys: validateStrings(sourceFilters.excludedSourceKeys ?? [], "excludedSourceKeys"),
        preferSourceTypes: validateStrings(sourceFilters.preferSourceTypes ?? [], "preferSourceTypes"),
      },
      crafting: {
        useCrafting: crafting.useCrafting ?? input.useCrafting ?? true,
        allowDustOfAzoth: crafting.allowDustOfAzoth ?? input.allowDustOfAzoth ?? false,
        allowDreamSolvent: crafting.allowDreamSolvent ?? input.allowDreamSolvent ?? false,
      },
      manualTaskExclusions: (preferences.manualTaskExclusions ?? []).map((exclusion, index) => {
        if (!exclusion.materialKey && !exclusion.sourceKey && !exclusion.sourceType) {
          throw new PlanPreferenceError(`manualTaskExclusions[${index}] must include materialKey, sourceKey, or sourceType`);
        }
        return {
          materialKey: optionalNonEmpty(exclusion.materialKey, `manualTaskExclusions[${index}].materialKey`),
          sourceKey: optionalNonEmpty(exclusion.sourceKey, `manualTaskExclusions[${index}].sourceKey`),
          sourceType: optionalNonEmpty(exclusion.sourceType, `manualTaskExclusions[${index}].sourceType`),
          reason: exclusion.reason,
        };
      }),
      warnings,
    };

    validateResolved(resolved);
    if (resolved.planStyle === "low_effort") {
      warnings.push("low_effort plan style is a simple deterministic sort in v1; no calendar compaction UI exists yet.");
    }

    return resolved;
  }
}

function validateResolved(preferences: PlanPreferencesResolved): void {
  if (!["fastest", "resin_efficient", "low_effort"].includes(preferences.planStyle)) {
    throw new PlanPreferenceError("planStyle must be fastest, resin_efficient, or low_effort");
  }
  assertIntRange(preferences.days, 1, 30, "days");
  assertIntRange(preferences.dailyResinBudget, 0, 2000, "dailyResinBudget");
  if (preferences.currentResin !== undefined) {
    assertIntRange(preferences.currentResin, 0, 2000, "currentResin");
  }
  assertMin(preferences.fragileResin.maxToUse, 0, "fragileResin.maxToUse");
  assertMin(preferences.fragileResin.resinPerFragile, 1, "fragileResin.resinPerFragile");
  assertIntRange(preferences.weeklyBosses.discountedClaimsUsedThisWeek, 0, 3, "weeklyBosses.discountedClaimsUsedThisWeek");
}

function assertIntRange(value: number, min: number, max: number, field: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new PlanPreferenceError(`${field} must be an integer from ${min} to ${max}`);
  }
}

function assertMin(value: number, min: number, field: string): void {
  if (!Number.isInteger(value) || value < min) {
    throw new PlanPreferenceError(`${field} must be an integer >= ${min}`);
  }
}

function parseDays(values: string[], field: string): DayOfWeek[] {
  return values.map((value) => {
    const normalized = value.trim().toLowerCase();
    if (!DAY_NAMES.includes(normalized as DayOfWeek)) {
      throw new PlanPreferenceError(`${field} contains invalid day: ${value}`);
    }
    return normalized as DayOfWeek;
  });
}

function validateDates(values: string[], field: string): string[] {
  return values.map((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new PlanPreferenceError(`${field} contains invalid date: ${value}`);
    }
    return value;
  });
}

function validateStrings(values: string[], field: string): string[] {
  return values.map((value) => {
    const normalized = value.trim();
    if (!normalized) {
      throw new PlanPreferenceError(`${field} cannot contain empty strings`);
    }
    return normalized;
  });
}

function optionalNonEmpty(value: string | undefined, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new PlanPreferenceError(`${field} cannot be empty`);
  }
  return normalized;
}

function validateResinMap(value: Record<string, number>, field: string): Record<string, number> {
  const output: Record<string, number> = {};
  for (const [key, amount] of Object.entries(value)) {
    validateDates([key], field);
    assertIntRange(amount, 0, 2000, `${field}.${key}`);
    output[key] = amount;
  }
  return output;
}

function validateDayResinMap(value: Record<string, number>): Partial<Record<DayOfWeek, number>> {
  const output: Partial<Record<DayOfWeek, number>> = {};
  for (const [key, amount] of Object.entries(value)) {
    const day = parseDays([key], "maxResinByDayOfWeek")[0]!;
    assertIntRange(amount, 0, 2000, `maxResinByDayOfWeek.${key}`);
    output[day] = amount;
  }
  return output;
}
