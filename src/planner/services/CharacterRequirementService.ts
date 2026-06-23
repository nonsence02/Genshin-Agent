import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { CHARACTER_LEVEL_UP_MORA_MATERIAL_KEY } from "../data/characterLevelCurve.js";
import { CharacterLevelCostService, type CharacterLevelCostResult } from "./CharacterLevelCostService.js";

export type TalentTrack = "normal" | "skill" | "burst";
export type RequirementSource = "level_exp" | "level_mora" | "ascension" | "talent_normal" | "talent_skill" | "talent_burst";

export interface TalentLevels {
  normal?: number;
  skill?: number;
  burst?: number;
}

export interface CharacterRequirementInput {
  characterKey: string;
  currentLevel: number;
  targetLevel: number;
  currentAscensionPhase?: number;
  targetAscensionPhase?: number;
  currentTalents?: TalentLevels;
  targetTalents?: TalentLevels;
}

export interface CharacterRequirementResult {
  character: {
    id: number;
    stableKey: string;
    name: string;
  };
  ascension: {
    currentPhase: number;
    targetPhase: number;
    includedPhases: number[];
  };
  talents: Record<TalentTrack, { current: number; target: number; includedLevels: number[] }>;
  materials: Array<{
    materialId: number;
    stableKey: string;
    name: string;
    quantity: number;
    sources: RequirementSource[];
    breakdown: Array<{
      source: RequirementSource;
      phase?: number;
      fromLevel?: number;
      toLevel?: number;
      quantity: number;
    }>;
  }>;
  warnings: string[];
}

export interface RequirementCharacter {
  id: number;
  stableKey: string;
  name: string;
}

export interface RequirementCostRow {
  materialId: number;
  materialStableKey: string;
  materialName: string;
  quantity: number;
}

export interface AscensionCostRow extends RequirementCostRow {
  phase: number;
}

export interface TalentCostRow extends RequirementCostRow {
  fromLevel: number;
  toLevel: number;
}

export interface CharacterRequirementRepository {
  findCharacterByStableKey(stableKey: string): Promise<RequirementCharacter | null>;
  listMaterialsByStableKeys(stableKeys: string[]): Promise<RequirementCostMaterial[]>;
  listAscensionCosts(characterId: number, phases: number[]): Promise<AscensionCostRow[]>;
  listTalentCosts(characterId: number, fromLevelExclusiveLowerBound: number, toLevelInclusive: number): Promise<TalentCostRow[]>;
}

export interface RequirementCostMaterial {
  id: number;
  stableKey: string;
  name: string;
}

export class CharacterRequirementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterRequirementError";
  }
}

export class CharacterNotFoundError extends CharacterRequirementError {
  constructor(characterKey: string) {
    super(`Character not found: ${characterKey}`);
    this.name = "CharacterNotFoundError";
  }
}

export class PrismaCharacterRequirementRepository implements CharacterRequirementRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findCharacterByStableKey(stableKey: string): Promise<RequirementCharacter | null> {
    return this.client.character.findUnique({
      where: {
        stableKey,
      },
      select: {
        id: true,
        stableKey: true,
        name: true,
      },
    });
  }

  async listMaterialsByStableKeys(stableKeys: string[]): Promise<RequirementCostMaterial[]> {
    if (stableKeys.length === 0) {
      return [];
    }

    return this.client.material.findMany({
      where: {
        stableKey: {
          in: [...new Set(stableKeys)],
        },
      },
      select: {
        id: true,
        stableKey: true,
        name: true,
      },
    });
  }

  async listAscensionCosts(characterId: number, phases: number[]): Promise<AscensionCostRow[]> {
    if (phases.length === 0) {
      return [];
    }

    const rows = await this.client.characterAscensionCost.findMany({
      where: {
        characterId,
        phase: {
          in: phases,
        },
      },
      include: {
        material: {
          select: {
            id: true,
            stableKey: true,
            name: true,
          },
        },
      },
      orderBy: [{ phase: "asc" }, { material: { stableKey: "asc" } }],
    });

    return rows.map((row) => ({
      phase: row.phase,
      materialId: row.material.id,
      materialStableKey: row.material.stableKey,
      materialName: row.material.name,
      quantity: row.quantity,
    }));
  }

  async listTalentCosts(
    characterId: number,
    fromLevelExclusiveLowerBound: number,
    toLevelInclusive: number,
  ): Promise<TalentCostRow[]> {
    if (toLevelInclusive <= fromLevelExclusiveLowerBound) {
      return [];
    }

    const rows = await this.client.characterTalentCost.findMany({
      where: {
        characterId,
        fromLevel: {
          gte: fromLevelExclusiveLowerBound,
        },
        toLevel: {
          lte: toLevelInclusive,
        },
      },
      include: {
        material: {
          select: {
            id: true,
            stableKey: true,
            name: true,
          },
        },
      },
      orderBy: [{ toLevel: "asc" }, { material: { stableKey: "asc" } }],
    });

    return rows.map((row) => ({
      fromLevel: row.fromLevel,
      toLevel: row.toLevel,
      materialId: row.material.id,
      materialStableKey: row.material.stableKey,
      materialName: row.material.name,
      quantity: row.quantity,
    }));
  }
}

const TALENT_TRACKS: TalentTrack[] = ["normal", "skill", "burst"];

export function inferAscensionPhaseFromLevel(level: number): number {
  validateIntegerRange("level", level, 1, 90);

  if (level <= 20) {
    return 0;
  }
  if (level <= 40) {
    return 1;
  }
  if (level <= 50) {
    return 2;
  }
  if (level <= 60) {
    return 3;
  }
  if (level <= 70) {
    return 4;
  }
  if (level <= 80) {
    return 5;
  }

  return 6;
}

function validateIntegerRange(label: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CharacterRequirementError(`${label} must be an integer from ${min} to ${max}`);
  }
}

function includedAscensionPhases(currentPhase: number, targetPhase: number): number[] {
  return Array.from({ length: Math.max(0, targetPhase - currentPhase) }, (_, index) => currentPhase + index + 1);
}

function includedTalentLevels(current: number, target: number): number[] {
  return Array.from({ length: Math.max(0, target - current) }, (_, index) => current + index + 1);
}

function sourceForTalent(track: TalentTrack): RequirementSource {
  return `talent_${track}` as RequirementSource;
}

export class CharacterRequirementService {
  constructor(
    private readonly repository: CharacterRequirementRepository = new PrismaCharacterRequirementRepository(),
    private readonly levelCosts = new CharacterLevelCostService(),
  ) {}

  async calculate(input: CharacterRequirementInput): Promise<CharacterRequirementResult> {
    this.validateInput(input);

    const character = await this.repository.findCharacterByStableKey(input.characterKey);

    if (!character) {
      throw new CharacterNotFoundError(input.characterKey);
    }

    const currentPhase = input.currentAscensionPhase ?? inferAscensionPhaseFromLevel(input.currentLevel);
    const targetPhase = input.targetAscensionPhase ?? inferAscensionPhaseFromLevel(input.targetLevel);
    validateIntegerRange("currentAscensionPhase", currentPhase, 0, 6);
    validateIntegerRange("targetAscensionPhase", targetPhase, 0, 6);

    if (targetPhase < currentPhase) {
      throw new CharacterRequirementError("targetAscensionPhase must be greater than or equal to currentAscensionPhase");
    }

    const phases = includedAscensionPhases(currentPhase, targetPhase);
    const talentPlans = this.buildTalentPlans(input);
    const aggregation = new MaterialRequirementAggregation();
    const warnings: string[] = [];
    const levelCost = this.levelCosts.calculate({
      currentLevel: input.currentLevel,
      targetLevel: input.targetLevel,
    });

    await this.addLevelCosts(aggregation, levelCost, warnings);

    for (const row of await this.repository.listAscensionCosts(character.id, phases)) {
      aggregation.add({
        materialId: row.materialId,
        stableKey: row.materialStableKey,
        name: row.materialName,
        source: "ascension",
        phase: row.phase,
        quantity: row.quantity,
      });
    }

    for (const track of TALENT_TRACKS) {
      const plan = talentPlans[track];
      const source = sourceForTalent(track);

      for (const row of await this.repository.listTalentCosts(character.id, plan.current, plan.target)) {
        aggregation.add({
          materialId: row.materialId,
          stableKey: row.materialStableKey,
          name: row.materialName,
          source,
          fromLevel: row.fromLevel,
          toLevel: row.toLevel,
          quantity: row.quantity,
        });
      }
    }

    return {
      character,
      ascension: {
        currentPhase,
        targetPhase,
        includedPhases: phases,
      },
      talents: talentPlans,
      materials: aggregation.toSortedMaterials(),
      warnings,
    };
  }

  private async addLevelCosts(
    aggregation: MaterialRequirementAggregation,
    levelCost: CharacterLevelCostResult,
    warnings: string[],
  ): Promise<void> {
    const quantities = new Map<string, number>();

    for (const book of levelCost.expBooks) {
      if (book.quantity > 0) {
        quantities.set(book.materialKey, book.quantity);
      }
    }

    if (levelCost.levelUpMora > 0) {
      quantities.set(CHARACTER_LEVEL_UP_MORA_MATERIAL_KEY, levelCost.levelUpMora);
    }

    if (quantities.size === 0) {
      return;
    }

    const materials = await this.repository.listMaterialsByStableKeys([...quantities.keys()]);
    const materialByKey = new Map(materials.map((material) => [material.stableKey, material]));

    for (const [stableKey, quantity] of quantities.entries()) {
      const material = materialByKey.get(stableKey);

      if (!material) {
        warnings.push(`Level cost material not found: ${stableKey}`);
        continue;
      }

      aggregation.add({
        materialId: material.id,
        stableKey: material.stableKey,
        name: material.name,
        source: stableKey === CHARACTER_LEVEL_UP_MORA_MATERIAL_KEY ? "level_mora" : "level_exp",
        fromLevel: levelCost.currentLevel,
        toLevel: levelCost.targetLevel,
        quantity,
      });
    }
  }

  private validateInput(input: CharacterRequirementInput): void {
    if (!input.characterKey.trim()) {
      throw new CharacterRequirementError("characterKey is required");
    }

    validateIntegerRange("currentLevel", input.currentLevel, 1, 90);
    validateIntegerRange("targetLevel", input.targetLevel, 1, 90);

    if (input.targetLevel < input.currentLevel) {
      throw new CharacterRequirementError("targetLevel must be greater than or equal to currentLevel");
    }

    if (input.currentAscensionPhase !== undefined) {
      validateIntegerRange("currentAscensionPhase", input.currentAscensionPhase, 0, 6);
    }

    if (input.targetAscensionPhase !== undefined) {
      validateIntegerRange("targetAscensionPhase", input.targetAscensionPhase, 0, 6);
    }

    for (const track of TALENT_TRACKS) {
      const current = input.currentTalents?.[track] ?? 1;
      const target = input.targetTalents?.[track] ?? current;
      validateIntegerRange(`currentTalents.${track}`, current, 1, 10);
      validateIntegerRange(`targetTalents.${track}`, target, 1, 10);

      if (target < current) {
        throw new CharacterRequirementError(`targetTalents.${track} must be greater than or equal to currentTalents.${track}`);
      }
    }
  }

  private buildTalentPlans(input: CharacterRequirementInput): CharacterRequirementResult["talents"] {
    return {
      normal: this.buildTalentPlan(input, "normal"),
      skill: this.buildTalentPlan(input, "skill"),
      burst: this.buildTalentPlan(input, "burst"),
    };
  }

  private buildTalentPlan(
    input: CharacterRequirementInput,
    track: TalentTrack,
  ): { current: number; target: number; includedLevels: number[] } {
    const current = input.currentTalents?.[track] ?? 1;
    const target = input.targetTalents?.[track] ?? current;

    return {
      current,
      target,
      includedLevels: includedTalentLevels(current, target),
    };
  }
}

interface AggregationInput {
  materialId: number;
  stableKey: string;
  name: string;
  source: RequirementSource;
  phase?: number;
  fromLevel?: number;
  toLevel?: number;
  quantity: number;
}

class MaterialRequirementAggregation {
  private readonly items = new Map<number, CharacterRequirementResult["materials"][number]>();

  add(input: AggregationInput): void {
    const existing =
      this.items.get(input.materialId) ??
      ({
        materialId: input.materialId,
        stableKey: input.stableKey,
        name: input.name,
        quantity: 0,
        sources: [],
        breakdown: [],
      } satisfies CharacterRequirementResult["materials"][number]);

    existing.quantity += input.quantity;

    if (!existing.sources.includes(input.source)) {
      existing.sources.push(input.source);
    }

    existing.breakdown.push({
      source: input.source,
      phase: input.phase,
      fromLevel: input.fromLevel,
      toLevel: input.toLevel,
      quantity: input.quantity,
    });

    this.items.set(input.materialId, existing);
  }

  toSortedMaterials(): CharacterRequirementResult["materials"] {
    return [...this.items.values()].sort((left, right) => {
      if (left.stableKey === "mat_mora") {
        return right.stableKey === "mat_mora" ? 0 : -1;
      }

      if (right.stableKey === "mat_mora") {
        return 1;
      }

      return left.stableKey.localeCompare(right.stableKey) || left.name.localeCompare(right.name);
    });
  }
}
