import { normalizeSearchText } from "./normalizeKey.js";
import type { InventoryKameraWeaponRecord } from "../providers/InventoryKameraWeaponsProvider.js";

export interface NormalizedPlayerWeapon {
  sourceWeaponKey: string;
  normalizedWeaponKey: string;
  weaponId?: number;
  weaponKey?: string;
  level?: number;
  ascension?: number;
  refinement?: number;
  location?: string;
  lock?: boolean;
  inventorySourceId?: number;
  sourcePayload: unknown;
}

export class InventoryKameraWeaponsNormalizer {
  normalize(weapons: InventoryKameraWeaponRecord[]): {
    weapons: NormalizedPlayerWeapon[];
    resolved: NormalizedPlayerWeapon[];
    unresolved: NormalizedPlayerWeapon[];
  } {
    const normalized: NormalizedPlayerWeapon[] = weapons.map((weapon) => ({
      sourceWeaponKey: weapon.key,
      normalizedWeaponKey: normalizeSearchText(weapon.key),
      level: weapon.level,
      ascension: weapon.ascension,
      refinement: weapon.refinement,
      location: weapon.location,
      lock: weapon.lock,
      inventorySourceId: weapon.inventorySourceId,
      sourcePayload: weapon.sourcePayload,
    }));

    return {
      weapons: normalized,
      resolved: normalized.filter((weapon) => weapon.weaponId !== undefined),
      unresolved: normalized.filter((weapon) => weapon.weaponId === undefined),
    };
  }
}
