import { createHash } from "node:crypto";

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

function normalizeForJson(value: unknown): JsonLike {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : normalizeForJson(item)));
  }

  if (typeof value === "object") {
    const normalized: { [key: string]: JsonLike } = {};

    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];

      if (child !== undefined) {
        normalized[key] = normalizeForJson(child);
      }
    }

    return normalized;
  }

  return null;
}

export function toStableJson(value: unknown): JsonLike {
  return normalizeForJson(value);
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(toStableJson(value));
}

export function sha256StableJson(value: unknown): string {
  return createHash("sha256").update(stableJsonStringify(value)).digest("hex");
}
