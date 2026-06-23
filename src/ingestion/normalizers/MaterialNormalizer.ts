import { normalizeSearchText, prefixedStableKey } from "./normalizeKey.js";
import { asRecord, optionalInt, optionalString } from "./rawPayload.js";
import type { NormalizedAlias, RawGameObjectForNormalization } from "./types.js";

export interface NormalizedMaterial {
  stableKey: string;
  name: string;
  rarity: number | null;
  category: string | null;
  typeText: string | null;
  sourceExternalKey: string;
  rawGameObjectId: number;
  aliases: NormalizedAlias[];
}

function aliasValues(raw: Record<string, unknown>, externalKey: string, name: string): string[] {
  const values = [externalKey, name, optionalString(raw.fullname)].filter((value): value is string => Boolean(value));
  return [...new Set(values)];
}

export class MaterialNormalizer {
  normalize(rawObject: RawGameObjectForNormalization): NormalizedMaterial {
    const raw = asRecord(rawObject.payload);
    const name = optionalString(raw.name) ?? rawObject.externalKey;
    const stableKey = prefixedStableKey("mat", name);

    return {
      stableKey,
      name,
      rarity: optionalInt(raw.rarity),
      category: optionalString(raw.category),
      typeText: optionalString(raw.typeText) ?? optionalString(raw.type),
      sourceExternalKey: rawObject.externalKey,
      rawGameObjectId: rawObject.id,
      aliases: aliasValues(raw, rawObject.externalKey, name).map((alias) => ({
        alias,
        normalized: normalizeSearchText(alias),
      })),
    };
  }
}
