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

export interface InventoryKameraGoodCharacterRecord {
  key: string;
  level?: number;
  ascension?: number;
  constellation?: number;
  talents: {
    normal?: number;
    skill?: number;
    burst?: number;
  };
  sourcePayload: unknown;
}

export interface InventoryKameraGoodArtifactRecord {
  key?: string;
  setKey?: string;
  slot?: string;
  level?: number;
  rarity?: number;
  location?: string;
  mainStatKey?: string;
  substats?: unknown[];
  sourcePayload: unknown;
}

export interface InventoryKameraGoodSnapshot {
  source: "inventory-kamera-good";
  filePath: string;
  fileHash: string;
  metadata: Record<string, unknown>;
  items: InventoryKameraGoodItemRecord[];
  characters: InventoryKameraGoodCharacterRecord[];
  artifacts: InventoryKameraGoodArtifactRecord[];
  warnings: string[];
}

function quantityFrom(record: Record<string, unknown>, fallback?: unknown): number | undefined {
  return optionalInt(record.count) ?? optionalInt(record.quantity) ?? optionalInt(record.amount) ?? optionalInt(fallback);
}

function nameFrom(record: Record<string, unknown>, fallback?: string): string | undefined {
  return optionalString(record.name) ?? optionalString(record.key) ?? optionalString(record.itemName) ?? fallback;
}

function readGoodCharacters(payload: Record<string, unknown>, warnings: string[]): InventoryKameraGoodCharacterRecord[] {
  const characters = payload.characters;
  const output: InventoryKameraGoodCharacterRecord[] = [];

  if (!characters) {
    return output;
  }

  if (!Array.isArray(characters) && typeof characters === "object") {
    for (const [key, value] of Object.entries(characters as Record<string, unknown>)) {
      const record = asRecord(value);
      const rawKey = optionalString(record.key) ?? key;
      if (!rawKey) {
        warnings.push(`Skipped invalid GOOD character entry: ${key}`);
        continue;
      }
      const talent = asRecord(record.talent);
      output.push({
        key: rawKey,
        level: optionalInt(record.level),
        ascension: optionalInt(record.ascension),
        constellation: optionalInt(record.constellation),
        talents: {
          normal: optionalInt(talent.auto) ?? optionalInt(talent.normal),
          skill: optionalInt(talent.skill),
          burst: optionalInt(talent.burst),
        },
        sourcePayload: { key, value },
      });
    }
  } else if (Array.isArray(characters)) {
    for (const value of characters) {
      const record = asRecord(value);
      const rawKey = optionalString(record.key) ?? optionalString(record.name);
      if (!rawKey) {
        warnings.push("Skipped invalid GOOD character list entry");
        continue;
      }
      const talent = asRecord(record.talent);
      output.push({
        key: rawKey,
        level: optionalInt(record.level),
        ascension: optionalInt(record.ascension),
        constellation: optionalInt(record.constellation),
        talents: {
          normal: optionalInt(talent.auto) ?? optionalInt(talent.normal),
          skill: optionalInt(talent.skill),
          burst: optionalInt(talent.burst),
        },
        sourcePayload: value,
      });
    }
  }

  return output;
}

function readGoodArtifacts(payload: Record<string, unknown>): InventoryKameraGoodArtifactRecord[] {
  const artifacts = payload.artifacts;
  if (!Array.isArray(artifacts)) {
    return [];
  }

  return artifacts.map((artifact) => {
    const record = asRecord(artifact);
    return {
      key: optionalString(record.key),
      setKey: optionalString(record.setKey),
      slot: optionalString(record.slotKey) ?? optionalString(record.slot),
      level: optionalInt(record.level),
      rarity: optionalInt(record.rarity),
      location: optionalString(record.location),
      mainStatKey: optionalString(record.mainStatKey),
      substats: Array.isArray(record.substats) ? record.substats : undefined,
      sourcePayload: artifact,
    };
  });
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

    const characters = readGoodCharacters(payload, warnings);
    const artifacts = readGoodArtifacts(payload);

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
      characters,
      artifacts,
      warnings,
    };
  }
}
