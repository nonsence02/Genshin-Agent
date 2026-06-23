export interface ResinPolicyConfig {
  resinCap: number;
  resinRegenMinutesPerUnit: number;
  naturalResinPerDay: number;
  domainCost: number;
  leyLineCost: number;
  normalBossCost: number;
  weeklyBossDiscountedCost: number;
  weeklyBossNormalCost: number;
  weeklyBossDiscountedClaimsPerWeek: number;
}

export const DEFAULT_RESIN_POLICY_CONFIG: ResinPolicyConfig = {
  resinCap: 200,
  resinRegenMinutesPerUnit: 8,
  naturalResinPerDay: 180,
  domainCost: 20,
  leyLineCost: 20,
  normalBossCost: 40,
  weeklyBossDiscountedCost: 30,
  weeklyBossNormalCost: 60,
  weeklyBossDiscountedClaimsPerWeek: 3,
};

const DOMAIN_SOURCE_TYPES = new Set(["domain", "artifact_domain", "talent_domain", "weapon_domain"]);
const LEY_LINE_SOURCE_TYPES = new Set(["ley_line"]);
const NORMAL_BOSS_SOURCE_TYPES = new Set(["boss", "normal_boss"]);
const WEEKLY_BOSS_SOURCE_TYPES = new Set(["weekly_boss", "trounce_domain"]);

export class ResinPolicy {
  readonly config: ResinPolicyConfig;

  constructor(config: Partial<ResinPolicyConfig> = {}) {
    this.config = {
      ...DEFAULT_RESIN_POLICY_CONFIG,
      ...config,
    };
  }

  getNaturalResinForDays(days: number): number {
    assertNonNegativeNumber(days, "days");
    return days * this.config.naturalResinPerDay;
  }

  getResinRecoveryMinutes(amount: number): number {
    assertNonNegativeNumber(amount, "amount");
    return amount * this.config.resinRegenMinutesPerUnit;
  }

  getBaseCostForSourceType(sourceType: string): number | null {
    if (DOMAIN_SOURCE_TYPES.has(sourceType)) {
      return this.config.domainCost;
    }

    if (LEY_LINE_SOURCE_TYPES.has(sourceType)) {
      return this.config.leyLineCost;
    }

    if (NORMAL_BOSS_SOURCE_TYPES.has(sourceType)) {
      return this.config.normalBossCost;
    }

    if (WEEKLY_BOSS_SOURCE_TYPES.has(sourceType)) {
      return null;
    }

    return null;
  }

  isResinGatedSourceType(sourceType: string): boolean {
    return (
      DOMAIN_SOURCE_TYPES.has(sourceType) ||
      LEY_LINE_SOURCE_TYPES.has(sourceType) ||
      NORMAL_BOSS_SOURCE_TYPES.has(sourceType) ||
      WEEKLY_BOSS_SOURCE_TYPES.has(sourceType)
    );
  }
}

function assertNonNegativeNumber(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
}
