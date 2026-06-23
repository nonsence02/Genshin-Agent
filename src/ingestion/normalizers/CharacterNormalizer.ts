import { normalizeSearchText, prefixedStableKey } from "./normalizeKey.js";
import { asRecord, optionalInt, optionalString } from "./rawPayload.js";
import type { NormalizedAlias, RawGameObjectForNormalization } from "./types.js";

export interface NormalizedCharacter {
  stableKey: string;
  name: string;
  rarity: number | null;
  element: string | null;
  weaponType: string | null;
  region: string | null;
  affiliation: string | null;
  birthday: string | null;
  constellation: string | null;
  sourceExternalKey: string;
  rawGameObjectId: number;
  aliases: NormalizedAlias[];
}

function aliasValues(raw: Record<string, unknown>, externalKey: string, name: string): string[] {
  const values = [externalKey, name, optionalString(raw.fullname)].filter((value): value is string => Boolean(value));
  return [...new Set(values)];
}

export class CharacterNormalizer {
  normalize(rawObject: RawGameObjectForNormalization): NormalizedCharacter {
    const raw = asRecord(rawObject.payload);
    const name = optionalString(raw.name) ?? rawObject.externalKey;
    const stableKey = prefixedStableKey("char", name);

    return {
      stableKey,
      name,
      rarity: optionalInt(raw.rarity),
      element: optionalString(raw.elementText) ?? optionalString(raw.element),
      weaponType: optionalString(raw.weaponText) ?? optionalString(raw.weapon),
      region: optionalString(raw.region),
      affiliation: optionalString(raw.affiliation),
      birthday: optionalString(raw.birthday),
      constellation: optionalString(raw.constellation),
      sourceExternalKey: rawObject.externalKey,
      rawGameObjectId: rawObject.id,
      aliases: aliasValues(raw, rawObject.externalKey, name).map((alias) => ({
        alias,
        normalized: normalizeSearchText(alias),
      })),
    };
  }
}
