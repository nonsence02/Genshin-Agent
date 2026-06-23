import { DEFAULT_RESIN_POLICY_CONFIG, type ResinPolicyConfig } from "./ResinPolicy.js";

export interface WeeklyBossCostInput {
  plannedClaims: number;
  discountedClaimsUsedThisWeek?: number;
}

export interface WeeklyBossCostResult {
  plannedClaims: number;
  discountedClaimsUsedBefore: number;
  discountedClaimsApplied: number;
  normalCostClaims: number;
  totalResinCost: number;
  perClaimCosts: number[];
}

export class WeeklyBossPolicy {
  readonly weeklyResetDay = "monday";
  readonly weeklyResetHour = 4;
  readonly maxClaimsPerBossPerWeek = 1;

  constructor(private readonly config: ResinPolicyConfig = DEFAULT_RESIN_POLICY_CONFIG) {}

  calculateCost(input: WeeklyBossCostInput): WeeklyBossCostResult {
    assertIntegerInRange(input.plannedClaims, "plannedClaims", 0);

    const discountedClaimsUsedBefore = input.discountedClaimsUsedThisWeek ?? 0;
    assertIntegerInRange(
      discountedClaimsUsedBefore,
      "discountedClaimsUsedThisWeek",
      0,
      this.config.weeklyBossDiscountedClaimsPerWeek,
    );

    const discountedClaimsRemaining = Math.max(
      0,
      this.config.weeklyBossDiscountedClaimsPerWeek - discountedClaimsUsedBefore,
    );
    const discountedClaimsApplied = Math.min(input.plannedClaims, discountedClaimsRemaining);
    const normalCostClaims = input.plannedClaims - discountedClaimsApplied;
    const perClaimCosts = [
      ...Array.from({ length: discountedClaimsApplied }, () => this.config.weeklyBossDiscountedCost),
      ...Array.from({ length: normalCostClaims }, () => this.config.weeklyBossNormalCost),
    ];

    return {
      plannedClaims: input.plannedClaims,
      discountedClaimsUsedBefore,
      discountedClaimsApplied,
      normalCostClaims,
      totalResinCost: perClaimCosts.reduce((sum, cost) => sum + cost, 0),
      perClaimCosts,
    };
  }
}

function assertIntegerInRange(value: number, field: string, min: number, max?: number): void {
  if (!Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
    const range = max === undefined ? `>= ${min}` : `${min}..${max}`;
    throw new Error(`${field} must be an integer in range ${range}`);
  }
}
