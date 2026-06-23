import { describe, expect, it } from "vitest";
import { MaterialDemandClassifier } from "../../src/planner/services/MaterialDemandClassifier.js";
import type { MaterialSourceLookupResult } from "../../src/planner/services/MaterialSourceService.js";

describe("MaterialDemandClassifier", () => {
  const classifier = new MaterialDemandClassifier();

  it("classifies boss materials as resin-gated", () => {
    const result = classifier.classify({
      material: material("mat_water_that_failed_to_transcend", "Water That Failed To Transcend"),
      sourceLookup: lookup("mat_water_that_failed_to_transcend", "Water That Failed To Transcend", [
        { sourceType: "boss", sourceName: "Hydro Tulpa" },
      ]),
    });

    expect(result.primarySourceType).toBe("boss");
    expect(result.resinGated).toBe(true);
    expect(result.resinCostPerRun).toBe(40);
    expect(result.openWorld).toBe(false);
  });

  it("classifies talent book domain materials with calendar days", () => {
    const result = classifier.classify({
      material: material("mat_philosophies_of_justice", "Philosophies of Justice"),
      sourceLookup: lookup("mat_philosophies_of_justice", "Philosophies of Justice", [
        { sourceType: "domain", sourceName: "Pale Forgotten Glory", days: ["tuesday", "friday", "sunday"] },
      ]),
    });

    expect(result.primarySourceType).toBe("domain");
    expect(result.resinGated).toBe(true);
    expect(result.resinCostPerRun).toBe(20);
    expect(result.calendarDays).toEqual(["tuesday", "friday", "sunday"]);
  });

  it("classifies local specialties as open world and not resin-gated", () => {
    const result = classifier.classify({
      material: material("mat_lakelight_lily", "Lakelight Lily"),
      sourceLookup: lookup("mat_lakelight_lily", "Lakelight Lily", [
        { sourceType: "local_specialty", notes: "Found in Erinnyes Forest" },
      ]),
    });

    expect(result.primarySourceType).toBe("local_specialty");
    expect(result.resinGated).toBe(false);
    expect(result.openWorld).toBe(true);
  });

  it("classifies enemy drops as open world and not resin-gated", () => {
    const result = classifier.classify({
      material: material("mat_whopperflower_nectar", "Whopperflower Nectar"),
      sourceLookup: lookup("mat_whopperflower_nectar", "Whopperflower Nectar", [
        { sourceType: "enemy", sourceName: "Cryo Whopperflower" },
        { sourceType: "shop", notes: "Stardust Exchange" },
      ]),
    });

    expect(result.primarySourceType).toBe("enemy");
    expect(result.resinGated).toBe(false);
    expect(result.openWorld).toBe(true);
  });

  it("returns warnings for unknown or missing sources", () => {
    const unknown = classifier.classify({
      material: material("mat_unknown", "Unknown"),
      sourceLookup: lookup("mat_unknown", "Unknown", [{ sourceType: "unknown" }]),
    });
    const missing = classifier.classify({ material: material("mat_missing", "Missing") });

    expect(unknown.warnings.some((warning) => warning.includes("Unknown source type"))).toBe(true);
    expect(missing.warnings.some((warning) => warning.includes("No normalized sources"))).toBe(true);
  });
});

function material(stableKey: string, name: string) {
  return {
    materialId: 1,
    stableKey,
    name,
    required: 1,
    owned: 0,
    missing: 1,
    status: "missing" as const,
  };
}

function lookup(
  stableKey: string,
  name: string,
  sources: MaterialSourceLookupResult["sources"],
): MaterialSourceLookupResult {
  return {
    material: { id: 1, stableKey, name },
    sources,
    warnings: [],
  };
}
