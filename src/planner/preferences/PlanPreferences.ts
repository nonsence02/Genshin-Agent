export const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export type DayOfWeek = typeof DAY_NAMES[number];
export type PlanStyle = "fastest" | "resin_efficient" | "low_effort";

export interface PlanPreferences {
  planStyle?: PlanStyle;
  days?: number;
  startDate?: string;
  dailyResinBudget?: number;
  currentResin?: number;
  useCurrentResinOnFirstDay?: boolean;
  fragileResin?: {
    allowed: boolean;
    maxToUse?: number;
    resinPerFragile?: number;
  };
  availability?: {
    blockedDaysOfWeek?: string[];
    blockedDates?: string[];
    preferredDaysOfWeek?: string[];
    maxResinByDate?: Record<string, number>;
    maxResinByDayOfWeek?: Record<string, number>;
  };
  weeklyBosses?: {
    discountedClaimsUsedThisWeek?: number;
    blockedWeeklyBossSourceKeys?: string[];
    alreadyClaimedSourceKeys?: string[];
  };
  sourceFilters?: {
    excludedSourceTypes?: string[];
    excludedSourceKeys?: string[];
    preferSourceTypes?: string[];
  };
  crafting?: {
    useCrafting?: boolean;
    allowDustOfAzoth?: boolean;
    allowDreamSolvent?: boolean;
  };
  manualTaskExclusions?: Array<{
    materialKey?: string;
    sourceKey?: string;
    sourceType?: string;
    reason?: string;
  }>;
}

export interface PlanPreferencesResolved {
  planStyle: PlanStyle;
  days: number;
  startDate?: string;
  dailyResinBudget: number;
  currentResin?: number;
  useCurrentResinOnFirstDay: boolean;
  fragileResin: {
    allowed: boolean;
    maxToUse: number;
    resinPerFragile: number;
  };
  availability: {
    blockedDaysOfWeek: DayOfWeek[];
    blockedDates: string[];
    preferredDaysOfWeek: DayOfWeek[];
    maxResinByDate: Record<string, number>;
    maxResinByDayOfWeek: Partial<Record<DayOfWeek, number>>;
  };
  weeklyBosses: {
    discountedClaimsUsedThisWeek: number;
    blockedWeeklyBossSourceKeys: string[];
    alreadyClaimedSourceKeys: string[];
  };
  sourceFilters: {
    excludedSourceTypes: string[];
    excludedSourceKeys: string[];
    preferSourceTypes: string[];
  };
  crafting: {
    useCrafting: boolean;
    allowDustOfAzoth: boolean;
    allowDreamSolvent: boolean;
  };
  manualTaskExclusions: Array<{
    materialKey?: string;
    sourceKey?: string;
    sourceType?: string;
    reason?: string;
  }>;
  warnings: string[];
}
