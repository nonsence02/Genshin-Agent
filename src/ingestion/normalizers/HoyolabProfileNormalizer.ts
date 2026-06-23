import { normalizeSearchText, prefixedStableKey } from "./normalizeKey.js";
import type { HoyolabCharacterRecord } from "../providers/HoyolabProfileProvider.js";

export interface CharacterResolutionEntry {
  id: number;
  stableKey: string;
  name: string;
  aliases: Array<{
    alias: string;
    normalized: string;
  }>;
}

export interface NormalizedHoyolabCharacter {
  sourceCharacterKey: string;
  normalizedCharacterKey: string;
  characterId?: number;
  characterKey?: string;
  name?: string;
  nameRu?: string;
  level?: number;
  ascension?: number;
  rarity?: number;
  constellation?: number;
  normalTalentLevel?: number;
  skillTalentLevel?: number;
  burstTalentLevel?: number;
  equippedWeaponName?: string;
  equippedWeaponLevel?: number;
  equippedWeaponRefinement?: number;
  equippedWeaponRarity?: number;
  equippedArtifacts: HoyolabCharacterRecord["equippedArtifacts"];
  sourcePayload: unknown;
}

class CharacterResolutionIndex {
  private readonly byAlias = new Map<string, CharacterResolutionEntry>();
  private readonly byStableKey = new Map<string, CharacterResolutionEntry>();
  private readonly byName = new Map<string, CharacterResolutionEntry>();

  constructor(characters: CharacterResolutionEntry[]) {
    for (const character of characters) {
      this.byStableKey.set(character.stableKey, character);
      this.byName.set(normalizeSearchText(character.name), character);

      for (const alias of character.aliases) {
        this.byAlias.set(alias.normalized, character);
      }
    }
  }

  resolve(sourceCharacterKey: string): CharacterResolutionEntry | undefined {
    const normalized = normalizeSearchText(sourceCharacterKey);
    const stableKey = prefixedStableKey("char", sourceCharacterKey);
    return this.byAlias.get(normalized) ?? this.byStableKey.get(stableKey) ?? this.byName.get(normalized);
  }
}

export class HoyolabProfileNormalizer {
  normalize(characters: HoyolabCharacterRecord[], knownCharacters: CharacterResolutionEntry[]): {
    characters: NormalizedHoyolabCharacter[];
    resolved: NormalizedHoyolabCharacter[];
    unresolved: NormalizedHoyolabCharacter[];
  } {
    const index = new CharacterResolutionIndex(knownCharacters);
    const normalized = characters.map((character) => {
      const resolved = index.resolve(character.sourceCharacterKey);
      const output: NormalizedHoyolabCharacter = {
        sourceCharacterKey: character.sourceCharacterKey,
        normalizedCharacterKey: normalizeSearchText(character.sourceCharacterKey),
        characterId: resolved?.id,
        characterKey: resolved?.stableKey,
        name: resolved?.name,
        nameRu: character.nameRu,
        level: character.level,
        rarity: character.rarity,
        constellation: character.constellation,
        normalTalentLevel: character.talents.normalAttack,
        skillTalentLevel: character.talents.elementalSkill,
        burstTalentLevel: character.talents.elementalBurst,
        equippedWeaponName: character.equippedWeapon?.name,
        equippedWeaponLevel: character.equippedWeapon?.level,
        equippedWeaponRefinement: character.equippedWeapon?.refinement,
        equippedWeaponRarity: character.equippedWeapon?.rarity,
        equippedArtifacts: character.equippedArtifacts,
        sourcePayload: character.sourcePayload,
      };
      return output;
    });

    return {
      characters: normalized,
      resolved: normalized.filter((character) => character.characterId !== undefined),
      unresolved: normalized.filter((character) => character.characterId === undefined),
    };
  }
}
