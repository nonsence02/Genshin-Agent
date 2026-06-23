export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeStableKey(value: string): string {
  return normalizeSearchText(value);
}

export function prefixedStableKey(prefix: string, value: string): string {
  const normalized = normalizeStableKey(value);

  if (!normalized) {
    throw new Error(`Cannot create stable key from empty value for prefix '${prefix}'`);
  }

  return `${prefix}_${normalized}`;
}
