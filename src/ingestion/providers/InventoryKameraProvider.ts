import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const INVENTORY_KAMERA_SOURCE = "inventory-kamera";

export interface InventoryKameraRawItem {
  rawName: string;
  quantity: number;
  sourcePayload: unknown;
  key?: string;
  itemType?: string;
  category?: string;
  rarity?: number;
}

export interface InventoryKameraSnapshot {
  capturedAt: Date;
  sourceVersion?: string;
  sourceFilePath: string;
  fileHash: string;
  metadata: Record<string, unknown>;
  rawPayload: unknown;
  items: InventoryKameraRawItem[];
  skippedInvalidItems: Array<{
    reason: string;
    payload: unknown;
  }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value);
  }

  return undefined;
}

function readQuantity(record: Record<string, unknown>, fallback?: unknown): number | undefined {
  return (
    optionalInt(record.count) ??
    optionalInt(record.quantity) ??
    optionalInt(record.amount) ??
    optionalInt(record.value) ??
    optionalInt(fallback)
  );
}

function readRawName(record: Record<string, unknown>, fallbackKey?: string): string | undefined {
  return optionalString(record.name) ?? optionalString(record.key) ?? optionalString(record.itemName) ?? fallbackKey;
}

function extractMaterialItems(payload: Record<string, unknown>): {
  items: InventoryKameraRawItem[];
  skippedInvalidItems: InventoryKameraSnapshot["skippedInvalidItems"];
} {
  const items: InventoryKameraRawItem[] = [];
  const skippedInvalidItems: InventoryKameraSnapshot["skippedInvalidItems"] = [];
  const materials = payload.materials;

  if (materials && typeof materials === "object" && !Array.isArray(materials)) {
    for (const [key, value] of Object.entries(materials as Record<string, unknown>)) {
      const record = asRecord(value);
      const quantity = readQuantity(record, value);
      const rawName = readRawName(record, key);

      if (!rawName || quantity === undefined || quantity < 0) {
        skippedInvalidItems.push({
          reason: "Invalid material map entry",
          payload: { key, value },
        });
        continue;
      }

      items.push({
        rawName,
        key,
        quantity,
        sourcePayload: { key, value },
      });
    }
  } else if (Array.isArray(materials)) {
    for (const item of materials) {
      const record = asRecord(item);
      const quantity = readQuantity(record);
      const rawName = readRawName(record);

      if (!rawName || quantity === undefined || quantity < 0) {
        skippedInvalidItems.push({
          reason: "Invalid material list entry",
          payload: item,
        });
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
  }

  if (Array.isArray(payload.items)) {
    for (const item of payload.items) {
      const record = asRecord(item);
      const quantity = readQuantity(record);
      const rawName = readRawName(record);

      if (!rawName || quantity === undefined || quantity < 0) {
        skippedInvalidItems.push({
          reason: "Invalid generic item entry",
          payload: item,
        });
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
  }

  return { items, skippedInvalidItems };
}

export class InventoryKameraProvider {
  async readSnapshot(filePath: string): Promise<InventoryKameraSnapshot> {
    const rawText = await readFile(filePath, "utf-8");
    const fileHash = createHash("sha256").update(rawText).digest("hex");
    let payload: unknown;

    try {
      payload = JSON.parse(rawText);
    } catch (error) {
      throw new Error(`Invalid Inventory Kamera GOOD JSON: ${(error as Error).message}`);
    }

    const root = asRecord(payload);

    if (root.format !== undefined && root.format !== "GOOD") {
      throw new Error(`Unsupported inventory format: ${String(root.format)}`);
    }

    const { items, skippedInvalidItems } = extractMaterialItems(root);
    const metadata = {
      format: root.format,
      version: root.version,
      source: root.source,
      fileHash,
      sourceFilePath: filePath,
      rawItemCount: items.length,
      skippedInvalidItemCount: skippedInvalidItems.length,
    };

    return {
      capturedAt: new Date(),
      sourceVersion: optionalString(root.version),
      sourceFilePath: filePath,
      fileHash,
      metadata,
      rawPayload: payload,
      items,
      skippedInvalidItems,
    };
  }
}
