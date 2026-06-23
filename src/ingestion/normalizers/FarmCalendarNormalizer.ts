export const FARM_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type FarmDay = (typeof FARM_DAYS)[number];

const DAY_ALIASES = new Map<string, FarmDay>([
  ["mon", "monday"],
  ["monday", "monday"],
  ["tue", "tuesday"],
  ["tues", "tuesday"],
  ["tuesday", "tuesday"],
  ["wed", "wednesday"],
  ["wednesday", "wednesday"],
  ["thu", "thursday"],
  ["thur", "thursday"],
  ["thurs", "thursday"],
  ["thursday", "thursday"],
  ["fri", "friday"],
  ["friday", "friday"],
  ["sat", "saturday"],
  ["saturday", "saturday"],
  ["sun", "sunday"],
  ["sunday", "sunday"],
]);

export function normalizeFarmDay(value: unknown): FarmDay | null {
  if (typeof value !== "string") {
    return null;
  }

  return DAY_ALIASES.get(value.trim().toLowerCase()) ?? null;
}

export class FarmCalendarNormalizer {
  normalizeDays(values: unknown): FarmDay[] {
    if (!Array.isArray(values)) {
      return [];
    }

    const days = values
      .map((value) => normalizeFarmDay(value))
      .filter((day): day is FarmDay => day !== null);

    return [...new Set(days)];
  }
}
