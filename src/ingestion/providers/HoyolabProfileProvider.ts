import { asRecord, optionalInt, optionalString, readJsonFile } from "./playerSourceUtils.js";

export interface HoyolabCharacterRecord {
  sourceCharacterKey: string;
  nameRu?: string;
  level?: number;
  rarity?: number;
  constellation?: number;
  talents: {
    normalAttack?: number;
    elementalSkill?: number;
    elementalBurst?: number;
  };
  equippedWeapon?: {
    name?: string;
    level?: number;
    refinement?: number;
    rarity?: number;
  };
  equippedArtifacts: Array<{
    name?: string;
    setName?: string;
    slot?: string;
    mainStat?: string;
    level?: number;
    rarity?: number;
  }>;
  sourcePayload: unknown;
}

export interface HoyolabProfileSnapshot {
  source: "hoyolab-profile";
  filePath: string;
  fileHash: string;
  metadata: Record<string, unknown>;
  characters: HoyolabCharacterRecord[];
  warnings: string[];
}

export class HoyolabProfileProvider {
  async readSnapshot(filePath: string): Promise<HoyolabProfileSnapshot> {
    const file = await readJsonFile(filePath);
    const payload = asRecord(file.payload);
    const warnings: string[] = [];
    const characters: HoyolabCharacterRecord[] = [];
    const rawCharacters = asRecord(payload.characters);

    for (const [sourceCharacterKey, rawValue] of Object.entries(rawCharacters)) {
      const record = asRecord(rawValue);
      const talents = asRecord(record.talents);
      const equippedWeapon = asRecord(record.equipped_weapon);
      const equippedArtifacts = Array.isArray(record.equipped_artifacts) ? record.equipped_artifacts : [];

      characters.push({
        sourceCharacterKey,
        nameRu: optionalString(record.name_ru),
        level: optionalInt(record.level),
        rarity: optionalInt(record.rarity),
        constellation: optionalInt(record.constellation),
        talents: {
          normalAttack: optionalInt(talents.normal_attack),
          elementalSkill: optionalInt(talents.elemental_skill),
          elementalBurst: optionalInt(talents.elemental_burst),
        },
        equippedWeapon:
          Object.keys(equippedWeapon).length > 0
            ? {
                name: optionalString(equippedWeapon.name),
                level: optionalInt(equippedWeapon.level),
                refinement: optionalInt(equippedWeapon.refinement),
                rarity: optionalInt(equippedWeapon.rarity),
              }
            : undefined,
        equippedArtifacts: equippedArtifacts.map((artifact) => {
          const rawArtifact = asRecord(artifact);
          return {
            name: optionalString(rawArtifact.name),
            setName: optionalString(rawArtifact.set_name),
            slot: optionalString(rawArtifact.slot),
            mainStat: optionalString(rawArtifact.main_stat),
            level: optionalInt(rawArtifact.level),
            rarity: optionalInt(rawArtifact.rarity),
          };
        }),
        sourcePayload: rawValue,
      });
    }

    if (characters.length === 0) {
      warnings.push("No HoYoLAB characters found");
    }

    return {
      source: "hoyolab-profile",
      filePath: file.filePath,
      fileHash: file.fileHash,
      metadata: {
        source: payload.source,
        uid: payload.uid,
      },
      characters,
      warnings,
    };
  }
}
