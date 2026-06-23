import { describe, expect, it } from "vitest";
import { RunEstimateService } from "../../src/planner/services/RunEstimateService.js";

describe("RunEstimateService", () => {
  const service = new RunEstimateService();

  it("estimates normal boss runs using 2.5 material per run", () => {
    expect(
      service.estimate({
        materialKey: "mat_water_that_failed_to_transcend",
        materialName: "Water That Failed To Transcend",
        missing: 46,
        sourceType: "boss",
        resinCostPerRun: 40,
      }),
    ).toMatchObject({
      estimatedRuns: 19,
      estimatedResin: 760,
      estimated: true,
    });
  });

  it("returns null estimates for domain and ley line tasks without reliable drop models", () => {
    const domain = service.estimate({
      materialKey: "mat_philosophies_of_justice",
      materialName: "Philosophies of Justice",
      missing: 60,
      sourceType: "domain",
      resinCostPerRun: 20,
    });
    const leyLine = service.estimate({
      materialKey: "mat_mora",
      materialName: "Mora",
      missing: 1_000_000,
      sourceType: "ley_line",
      resinCostPerRun: 20,
    });

    expect(domain.estimatedRuns).toBeNull();
    expect(domain.estimatedResin).toBeNull();
    expect(domain.warnings[0]).toContain("No reliable domain drop model");
    expect(leyLine.estimatedRuns).toBeNull();
    expect(leyLine.estimatedResin).toBeNull();
    expect(leyLine.warnings[0]).toContain("No reliable ley line reward model");
  });
});
