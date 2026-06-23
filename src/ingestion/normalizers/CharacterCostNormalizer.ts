import { asRecord, optionalInt, optionalString } from "./rawPayload.js";
import type { RawGameObjectForNormalization } from "./types.js";

export interface ExtractedCostItem {
  materialName: string;
  quantity: number;
}

export interface ExtractedAscensionCost {
  phase: number;
  materialName: string;
  quantity: number;
}

export interface ExtractedTalentCost {
  fromLevel: number;
  toLevel: number;
  materialName: string;
  quantity: number;
}

export interface CharacterCostExtractionResult {
  ascensionCosts: ExtractedAscensionCost[];
  talentCosts: ExtractedTalentCost[];
  warnings: string[];
}

function extractCostItems(value: unknown): ExtractedCostItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const raw = asRecord(item);
    const materialName = optionalString(raw.name) ?? optionalString(raw.materialName) ?? optionalString(raw.material);
    const quantity =
      optionalInt(raw.count) ?? optionalInt(raw.amount) ?? optionalInt(raw.quantity) ?? optionalInt(raw.value);

    if (!materialName || quantity === null || quantity <= 0) {
      return [];
    }

    return [
      {
        materialName,
        quantity,
      },
    ];
  });
}

function extractCostsMap(rawObject: RawGameObjectForNormalization): Record<string, unknown> {
  const payload = asRecord(rawObject.payload);
  return asRecord(payload.costs);
}

export class CharacterCostNormalizer {
  extractAscensionCosts(rawObject: RawGameObjectForNormalization): CharacterCostExtractionResult {
    const costs = extractCostsMap(rawObject);
    const warnings: string[] = [];
    const ascensionCosts: ExtractedAscensionCost[] = [];

    for (const [key, value] of Object.entries(costs)) {
      const match = /^ascend(\d+)$/i.exec(key);

      if (!match) {
        continue;
      }

      const phase = Number(match[1]);
      const items = extractCostItems(value);

      if (items.length === 0) {
        warnings.push(`${rawObject.externalKey}: no usable items for ${key}`);
        continue;
      }

      ascensionCosts.push(
        ...items.map((item) => ({
          phase,
          materialName: item.materialName,
          quantity: item.quantity,
        })),
      );
    }

    if (ascensionCosts.length === 0) {
      warnings.push(`${rawObject.externalKey}: no ascension costs found`);
    }

    return {
      ascensionCosts,
      talentCosts: [],
      warnings,
    };
  }

  extractTalentCosts(rawObject: RawGameObjectForNormalization): CharacterCostExtractionResult {
    const costs = extractCostsMap(rawObject);
    const warnings: string[] = [];
    const talentCosts: ExtractedTalentCost[] = [];

    for (const [key, value] of Object.entries(costs)) {
      const match = /^lvl(\d+)$/i.exec(key);

      if (!match) {
        continue;
      }

      const toLevel = Number(match[1]);
      const fromLevel = toLevel - 1;
      const items = extractCostItems(value);

      if (items.length === 0) {
        warnings.push(`${rawObject.externalKey}: no usable items for ${key}`);
        continue;
      }

      talentCosts.push(
        ...items.map((item) => ({
          fromLevel,
          toLevel,
          materialName: item.materialName,
          quantity: item.quantity,
        })),
      );
    }

    if (talentCosts.length === 0) {
      warnings.push(`${rawObject.externalKey}: no talent costs found`);
    }

    return {
      ascensionCosts: [],
      talentCosts,
      warnings,
    };
  }
}
