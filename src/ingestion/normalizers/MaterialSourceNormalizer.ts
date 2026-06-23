import { asRecord, optionalInt, optionalString } from "./rawPayload.js";
import type { RawGameObjectForNormalization } from "./types.js";

export interface NormalizedMaterialSource {
  materialName: string;
  sourceType: string;
  sourceKey: string | null;
  sourceName: string | null;
  resinCost: number | null;
  notes: string | null;
  rawPayload: unknown;
}

export interface NormalizedMaterialSourceExtraction {
  sources: NormalizedMaterialSource[];
  warnings: string[];
}

function classifyMaterialSource(rawSource: string, raw: Record<string, unknown>): string {
  const source = rawSource.toLowerCase();
  const typeText = (optionalString(raw.typeText) ?? "").toLowerCase();

  if (source.includes("stardust") || source.includes("shop") || source.includes("exchange")) {
    return "shop";
  }

  if (source.includes("craft")) {
    return "crafting";
  }

  if (source.includes("expedition")) {
    return "expedition";
  }

  if (source.includes("event")) {
    return "event";
  }

  if (source.includes("ley line")) {
    return "ley_line";
  }

  if (source.includes("dropped by")) {
    return "unknown";
  }

  if (typeText.includes("local specialty") || source.includes("found in") || source.includes("go to collect")) {
    return "local_specialty";
  }

  return "unknown";
}

export class MaterialSourceNormalizer {
  extractFromMaterial(rawObject: RawGameObjectForNormalization): NormalizedMaterialSourceExtraction {
    const raw = asRecord(rawObject.payload);
    const materialName = optionalString(raw.name) ?? rawObject.externalKey;
    const warnings: string[] = [];
    const rawSources = Array.isArray(raw.sources) ? raw.sources.filter((source): source is string => typeof source === "string") : [];
    const sources: NormalizedMaterialSource[] = [];

    for (const rawSource of rawSources) {
      const sourceType = classifyMaterialSource(rawSource, raw);

      if (sourceType === "unknown") {
        warnings.push(`${materialName}: unresolved material source '${rawSource}'`);
        continue;
      }

      sources.push({
        materialName,
        sourceType,
        sourceKey: null,
        sourceName: null,
        resinCost: optionalInt(raw.resinCost),
        notes: rawSource,
        rawPayload: { source: rawSource },
      });
    }

    return {
      sources,
      warnings,
    };
  }
}
