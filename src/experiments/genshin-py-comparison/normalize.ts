import { normalizeSearchText, prefixedStableKey } from "../../ingestion/normalizers/normalizeKey.js";

const SECRET_KEY_PATTERN = /(token|cookie|ltoken|ltuid|account_id|auth|secret|password)/i;

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function optionalInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

export function optionalNumberAsInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return undefined;
}

export function normalizeCharacterKey(value: unknown): string | undefined {
  const raw = optionalString(value);

  if (!raw) {
    return undefined;
  }

  return prefixedStableKey("char", raw);
}

export function normalizeSourceKey(value: unknown): string | undefined {
  const raw = optionalString(value);
  return raw ? normalizeSearchText(raw) : undefined;
}

export function stableComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableComparableValue).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableComparableValue(item)]),
    );
  }

  return value;
}

export function comparableEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableComparableValue(left)) === JSON.stringify(stableComparableValue(right));
}

export function containsSecretLikeKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsSecretLikeKey);
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, item]) => SECRET_KEY_PATTERN.test(key) || containsSecretLikeKey(item),
    );
  }

  return false;
}
