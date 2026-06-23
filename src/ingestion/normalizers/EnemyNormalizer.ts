import { prefixedStableKey } from "./normalizeKey.js";
import { asRecord, optionalInt, optionalString } from "./rawPayload.js";
import type { RawGameObjectForNormalization } from "./types.js";

export interface NormalizedEnemyDrop {
  materialName: string;
  dropType: string;
  rarity: number | null;
  minLevel: number | null;
  rawPayload: unknown;
}

export interface NormalizedEnemy {
  stableKey: string;
  name: string;
  enemyType: string | null;
  family: string | null;
  sourceExternalKey: string;
  rawGameObjectId: number;
  drops: NormalizedEnemyDrop[];
}

const NON_MATERIAL_REWARDS = new Set(["adventure exp", "mora", "companionship exp"]);

function extractMinLevel(source: string): number | null {
  const match = /lv\.?\s*(\d+)\+/i.exec(source);
  return match ? Number(match[1]) : null;
}

function extractDrops(raw: Record<string, unknown>): NormalizedEnemyDrop[] {
  if (!Array.isArray(raw.rewardPreview)) {
    return [];
  }

  const sourceTexts = Array.isArray(raw.sources) ? raw.sources.filter((source): source is string => typeof source === "string") : [];

  return raw.rewardPreview.flatMap((value) => {
    const reward = asRecord(value);
    const materialName = optionalString(reward.name);

    if (!materialName || NON_MATERIAL_REWARDS.has(materialName.toLowerCase())) {
      return [];
    }

    return [
      {
        materialName,
        dropType: "drop",
        rarity: optionalInt(reward.rarity),
        minLevel: sourceTexts.map(extractMinLevel).find((level): level is number => level !== null) ?? null,
        rawPayload: value,
      },
    ];
  });
}

export class EnemyNormalizer {
  normalize(rawObject: RawGameObjectForNormalization): NormalizedEnemy {
    const raw = asRecord(rawObject.payload);
    const investigation = asRecord(raw.investigation);
    const name = optionalString(raw.name) ?? rawObject.externalKey;

    return {
      stableKey: prefixedStableKey("enemy", name),
      name,
      enemyType: optionalString(raw.enemyType) ?? optionalString(raw.monsterType),
      family: optionalString(investigation.name) ?? optionalString(raw.categoryText),
      sourceExternalKey: rawObject.externalKey,
      rawGameObjectId: rawObject.id,
      drops: extractDrops(raw),
    };
  }
}
