export type FarmDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export interface FarmAvailability {
  dayOfWeek: FarmDay;
  sourceType: string;
  sourceKey: string;
}
