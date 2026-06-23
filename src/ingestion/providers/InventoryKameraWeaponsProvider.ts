import { asRecord, optionalInt, optionalString, readJsonFile } from "./playerSourceUtils.js";

export interface InventoryKameraWeaponRecord {
  key: string;
  level?: number;
  ascension?: number;
  refinement?: number;
  location?: string;
  lock?: boolean;
  inventorySourceId?: number;
  sourcePayload: unknown;
}

export interface InventoryKameraWeaponsSnapshot {
  source: "inventory-kamera-weapons";
  filePath: string;
  fileHash: string;
  metadata: Record<string, unknown>;
  weapons: InventoryKameraWeaponRecord[];
  warnings: string[];
}

export class InventoryKameraWeaponsProvider {
  async readSnapshot(filePath: string): Promise<InventoryKameraWeaponsSnapshot> {
    const file = await readJsonFile(filePath);
    const payload = asRecord(file.payload);
    const warnings: string[] = [];
    const weapons: InventoryKameraWeaponRecord[] = [];

    if (payload.format !== undefined && payload.format !== "GOOD") {
      warnings.push(`Unexpected GOOD format marker: ${String(payload.format)}`);
    }

    if (!Array.isArray(payload.weapons)) {
      warnings.push("No weapons array found");
    } else {
      for (const item of payload.weapons) {
        const record = asRecord(item);
        const key = optionalString(record.key);

        if (!key) {
          warnings.push("Skipped weapon without key");
          continue;
        }

        weapons.push({
          key,
          level: optionalInt(record.level),
          ascension: optionalInt(record.ascension),
          refinement: optionalInt(record.refinement),
          location: optionalString(record.location),
          lock: typeof record.lock === "boolean" ? record.lock : undefined,
          inventorySourceId: optionalInt(record.id),
          sourcePayload: item,
        });
      }
    }

    return {
      source: "inventory-kamera-weapons",
      filePath: file.filePath,
      fileHash: file.fileHash,
      metadata: {
        format: payload.format,
        version: payload.version,
        source: payload.source,
        kameraVersion: payload.kamera_version,
      },
      weapons,
      warnings,
    };
  }
}
