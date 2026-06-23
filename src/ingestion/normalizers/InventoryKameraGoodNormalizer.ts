import {
  InventoryKameraNormalizer,
  type MaterialResolutionEntry,
  type InventoryNormalizationResult,
} from "./InventoryKameraNormalizer.js";
import type { InventoryKameraGoodItemRecord } from "../providers/InventoryKameraGoodProvider.js";

export class InventoryKameraGoodNormalizer {
  constructor(private readonly baseNormalizer = new InventoryKameraNormalizer()) {}

  normalize(items: InventoryKameraGoodItemRecord[], materials: MaterialResolutionEntry[]): InventoryNormalizationResult {
    return this.baseNormalizer.normalize(
      items.map((item) => ({
        rawName: item.rawName,
        key: item.key,
        quantity: item.quantity,
        itemType: item.itemType,
        category: item.category,
        rarity: item.rarity,
        sourcePayload: item.sourcePayload,
      })),
      materials,
    );
  }
}
