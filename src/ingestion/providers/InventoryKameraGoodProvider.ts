import { asRecord, optionalInt, optionalString, readJsonFile } from "./playerSourceUtils.js";

export interface InventoryKameraGoodItemRecord {
  rawName: string;
  quantity: number;
  key?: string;
  itemType?: string;
  category?: string;
  rarity?: number;
  sourcePayload: unknown;
}

export interface InventoryKameraGoodSnapshot {
  source: "inventory-kamera-good";
  filePath: string;
  fileHash: string;
  metadata: Record<string, unknown>;
  items: InventoryKameraGoodItemRecord[];
  warnings: string[];
}

function quantityFrom(record: Record<string, unknown>, fallback?: unknown): number | undefined {
  return optionalInt(record.count) ?? optionalInt(record.quantity) ?? optionalInt(record.amount) ?? optionalInt(fallback);
}

function nameFrom(record: Record<string, unknown>, fallback?: string): string | undefined {
  return optionalString(record.name) ?? optionalString(record.key) ?? optionalString(record.itemName) ?? fallback;
}

export class InventoryKameraGoodProvider {
  async readSnapshot(filePath: string): Promise<InventoryKameraGoodSnapshot> {
    const file = await readJsonFile(filePath);
    const payload = asRecord(file.payload);
    const warnings: string[] = [];
    const items: InventoryKameraGoodItemRecord[] = [];

    if (payload.format !== undefined && payload.format !== "GOOD") {
      warnings.push(`Unexpected GOOD format marker: ${String(payload.format)}`);
    }

    const materials = payload.materials;

    if (materials && typeof materials === "object" && !Array.isArray(materials)) {
      for (const [key, value] of Object.entries(materials as Record<string, unknown>)) {
        const record = asRecord(value);
        const rawName = nameFrom(record, key);
        const quantity = quantityFrom(record, value);

        if (!rawName || quantity === undefined || quantity < 0) {
          warnings.push(`Skipped invalid material map entry: ${key}`);
          continue;
        }

        items.push({ rawName, key, quantity, sourcePayload: { key, value } });
      }
    } else if (Array.isArray(materials)) {
      for (const item of materials) {
        const record = asRecord(item);
        const rawName = nameFrom(record);
        const quantity = quantityFrom(record);

        if (!rawName || quantity === undefined || quantity < 0) {
          warnings.push("Skipped invalid material list entry");
          continue;
        }

        items.push({
          rawName,
          key: optionalString(record.key),
          quantity,
          itemType: optionalString(record.itemType),
          category: optionalString(record.category),
          rarity: optionalInt(record.rarity),
          sourcePayload: item,
        });
      }
    } else {
      warnings.push("No materials collection found in GOOD payload");
    }

    return {
      source: "inventory-kamera-good",
      filePath: file.filePath,
      fileHash: file.fileHash,
      metadata: {
        format: payload.format,
        version: payload.version,
        source: payload.source,
        kameraVersion: payload.kamera_version,
      },
      items,
      warnings,
    };
  }
}
