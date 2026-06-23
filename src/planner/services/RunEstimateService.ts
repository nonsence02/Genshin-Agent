export interface RunEstimateConfig {
  normalBossMaterialPerRun: number;
  talentBookEquivalentPerRun: number | null;
  weaponMaterialEquivalentPerRun: number | null;
  leyLineMoraPerRun: number | null;
  leyLineExpBookHeroWitEquivalentPerRun: number | null;
}

export interface RunEstimateInput {
  materialKey: string;
  materialName: string;
  missing: number;
  sourceType: string | null;
  resinCostPerRun?: number | null;
}

export interface RunEstimateResult {
  estimatedRuns: number | null;
  estimatedResin: number | null;
  estimated: boolean;
  warnings: string[];
}

export const DEFAULT_RUN_ESTIMATE_CONFIG: RunEstimateConfig = {
  normalBossMaterialPerRun: 2.5,
  talentBookEquivalentPerRun: null,
  weaponMaterialEquivalentPerRun: null,
  leyLineMoraPerRun: null,
  leyLineExpBookHeroWitEquivalentPerRun: null,
};

const NORMAL_BOSS_SOURCE_TYPES = new Set(["boss", "normal_boss"]);
const DOMAIN_SOURCE_TYPES = new Set(["domain", "talent_domain", "weapon_domain", "artifact_domain"]);
const LEY_LINE_SOURCE_TYPES = new Set(["ley_line"]);
const OPEN_WORLD_SOURCE_TYPES = new Set(["enemy", "local_specialty"]);

export class RunEstimateService {
  readonly config: RunEstimateConfig;

  constructor(config: Partial<RunEstimateConfig> = {}) {
    this.config = {
      ...DEFAULT_RUN_ESTIMATE_CONFIG,
      ...config,
    };
  }

  estimate(input: RunEstimateInput): RunEstimateResult {
    if (!Number.isFinite(input.missing) || input.missing < 0) {
      throw new Error("missing must be a non-negative number");
    }

    if (input.missing === 0) {
      return { estimatedRuns: 0, estimatedResin: 0, estimated: true, warnings: [] };
    }

    if (!input.sourceType) {
      return nullEstimate(input, `No source type is available for ${input.materialKey}; runs cannot be estimated.`);
    }

    if (NORMAL_BOSS_SOURCE_TYPES.has(input.sourceType)) {
      const estimatedRuns = Math.ceil(input.missing / this.config.normalBossMaterialPerRun);
      const estimatedResin = input.resinCostPerRun === null || input.resinCostPerRun === undefined
        ? null
        : estimatedRuns * input.resinCostPerRun;

      return {
        estimatedRuns,
        estimatedResin,
        estimated: true,
        warnings: [
          `Estimated ${input.materialName} with rough normal boss assumption: ${this.config.normalBossMaterialPerRun} material per run.`,
        ],
      };
    }

    if (DOMAIN_SOURCE_TYPES.has(input.sourceType)) {
      return nullEstimate(input, `No reliable domain drop model is configured for ${input.materialKey}; keep demand quantity ${input.missing}.`);
    }

    if (LEY_LINE_SOURCE_TYPES.has(input.sourceType)) {
      return nullEstimate(input, `No reliable ley line reward model is configured for ${input.materialKey}; keep demand quantity ${input.missing}.`);
    }

    if (OPEN_WORLD_SOURCE_TYPES.has(input.sourceType)) {
      return { estimatedRuns: 0, estimatedResin: 0, estimated: true, warnings: [] };
    }

    return nullEstimate(input, `No run estimate model is configured for source type ${input.sourceType}.`);
  }
}

function nullEstimate(input: RunEstimateInput, warning: string): RunEstimateResult {
  return {
    estimatedRuns: null,
    estimatedResin: null,
    estimated: true,
    warnings: [warning],
  };
}
