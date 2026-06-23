import { prefixedStableKey } from "./normalizeKey.js";
import { asRecord, optionalInt, optionalString } from "./rawPayload.js";
import type { RawGameObjectForNormalization } from "./types.js";

export interface NormalizedDomainReward {
  materialName: string;
  rewardType: string;
  level: number | null;
  rarity: number | null;
  rawPayload: unknown;
}

export interface NormalizedDomain {
  stableKey: string;
  name: string;
  region: string | null;
  domainType: string | null;
  sourceExternalKey: string;
  rawGameObjectId: number;
  daysOfWeek: string[];
  rewards: NormalizedDomainReward[];
}

function rewardTypeForDomain(raw: Record<string, unknown>): string {
  const text = `${optionalString(raw.domainText) ?? ""} ${optionalString(raw.domainType) ?? ""}`.toLowerCase();

  if (text.includes("talent") || text.includes("proud")) {
    return "talent";
  }

  if (text.includes("weapon")) {
    return "weapon";
  }

  if (text.includes("artifact") || text.includes("relic")) {
    return "artifact";
  }

  return "domain";
}

function extractRewards(raw: Record<string, unknown>): NormalizedDomainReward[] {
  const rewardPreview = raw.rewardPreview;

  if (!Array.isArray(rewardPreview)) {
    return [];
  }

  const rewardType = rewardTypeForDomain(raw);
  const level = optionalInt(raw.recommendedLevel);

  return rewardPreview.flatMap((value) => {
    const reward = asRecord(value);
    const materialName = optionalString(reward.name);

    if (!materialName) {
      return [];
    }

    return [
      {
        materialName,
        rewardType,
        level,
        rarity: optionalInt(reward.rarity),
        rawPayload: value,
      },
    ];
  });
}

export class DomainNormalizer {
  normalize(rawObject: RawGameObjectForNormalization): NormalizedDomain {
    const raw = asRecord(rawObject.payload);
    const name = optionalString(raw.entranceName) ?? optionalString(raw.name) ?? rawObject.externalKey;

    return {
      stableKey: prefixedStableKey("domain", name),
      name,
      region: optionalString(raw.regionName),
      domainType: optionalString(raw.domainText) ?? optionalString(raw.domainType),
      sourceExternalKey: rawObject.externalKey,
      rawGameObjectId: rawObject.id,
      daysOfWeek: Array.isArray(raw.daysOfWeek) ? raw.daysOfWeek.filter((day): day is string => typeof day === "string") : [],
      rewards: extractRewards(raw),
    };
  }
}
