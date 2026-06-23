import type { InventoryKameraRawItem } from "../providers/InventoryKameraProvider.js";
import { normalizeSearchText } from "./normalizeKey.js";

export interface MaterialResolutionEntry {
  id: number;
  stableKey: string;
  name: string;
  aliases: Array<{
    alias: string;
    normalized: string;
  }>;
}

export interface NormalizedInventoryItem {
  rawName: string;
  normalizedName: string;
  quantity: number;
  materialKey?: string;
  materialId?: number;
  confidence?: number;
  sourcePayload?: unknown;
}

export interface InventoryNormalizationResult {
  items: NormalizedInventoryItem[];
  resolvedItems: NormalizedInventoryItem[];
  unresolvedItems: NormalizedInventoryItem[];
  skippedInvalidItems: Array<{
    reason: string;
    payload: unknown;
  }>;
}

function splitCamelCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function materialCandidates(item: InventoryKameraRawItem): string[] {
  const values = [item.rawName, item.key, item.key ? splitCamelCase(item.key) : undefined].filter(
    (value): value is string => Boolean(value),
  );
  return [...new Set(values)];
}

class MaterialResolutionIndex {
  private readonly byAlias = new Map<string, MaterialResolutionEntry>();
  private readonly byName = new Map<string, MaterialResolutionEntry>();
  private readonly byStableKey = new Map<string, MaterialResolutionEntry>();

  constructor(materials: MaterialResolutionEntry[]) {
    for (const material of materials) {
      this.byStableKey.set(material.stableKey, material);
      this.byName.set(normalizeSearchText(material.name), material);

      for (const alias of material.aliases) {
        this.byAlias.set(alias.normalized, material);
      }
    }
  }

  resolve(item: InventoryKameraRawItem): MaterialResolutionEntry | undefined {
    for (const candidate of materialCandidates(item)) {
      const normalized = normalizeSearchText(candidate);
      const stableKey = normalized.startsWith("mat_") ? normalized : `mat_${normalized}`;
      const material = this.byAlias.get(normalized) ?? this.byName.get(normalized) ?? this.byStableKey.get(stableKey);

      if (material) {
        return material;
      }
    }

    return undefined;
  }
}

export class InventoryKameraNormalizer {
  normalize(
    rawItems: InventoryKameraRawItem[],
    materials: MaterialResolutionEntry[],
    skippedInvalidItems: InventoryNormalizationResult["skippedInvalidItems"] = [],
  ): InventoryNormalizationResult {
    const index = new MaterialResolutionIndex(materials);
    const itemsByKey = new Map<string, NormalizedInventoryItem>();

    for (const rawItem of rawItems) {
      if (!Number.isInteger(rawItem.quantity) || rawItem.quantity < 0) {
        skippedInvalidItems.push({
          reason: "Invalid quantity",
          payload: rawItem.sourcePayload,
        });
        continue;
      }

      const material = index.resolve(rawItem);
      const normalized: NormalizedInventoryItem = {
        rawName: rawItem.rawName,
        normalizedName: normalizeSearchText(rawItem.rawName),
        quantity: rawItem.quantity,
        sourcePayload: rawItem.sourcePayload,
      };

      if (material) {
        normalized.materialId = material.id;
        normalized.materialKey = material.stableKey;
        normalized.confidence = 1;
      }

      const aggregationKey =
        normalized.materialId !== undefined ? `material:${normalized.materialId}` : `unresolved:${normalized.normalizedName}`;
      const existing = itemsByKey.get(aggregationKey);

      if (existing) {
        existing.quantity += normalized.quantity;
      } else {
        itemsByKey.set(aggregationKey, normalized);
      }
    }

    const items = [...itemsByKey.values()];

    return {
      items,
      resolvedItems: items.filter((item) => item.materialId !== undefined),
      unresolvedItems: items.filter((item) => item.materialId === undefined),
      skippedInvalidItems,
    };
  }
}
