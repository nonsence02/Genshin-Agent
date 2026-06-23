import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import {
  CharacterRequirementService,
  type CharacterRequirementInput,
  type CharacterRequirementResult,
  type TalentLevels,
} from "./CharacterRequirementService.js";
import { CraftingRuleService, type CraftingRuleMaterial } from "./CraftingRuleService.js";
import { InventoryProjectionService, type CraftingAction, type InventoryProjectionOptions } from "./InventoryProjectionService.js";
import { MaterialSourceService } from "./MaterialSourceService.js";

export type MaterialDiffStatus = "satisfied" | "missing";
export type TalentTrack = "normal" | "skill" | "burst";

export interface CharacterInventoryDiffInput {
  playerKey: string;
  characterKey: string;
  inventorySnapshotId?: number;
  usePlayerState?: boolean;
  currentLevel?: number;
  targetLevel: number;
  currentAscensionPhase?: number;
  targetAscensionPhase?: number;
  currentTalents?: TalentLevels;
  targetTalents?: TalentLevels;
  useCrafting?: boolean;
  allowDustOfAzoth?: boolean;
  allowDreamSolvent?: boolean;
}

export interface CharacterInventoryDiffResult {
  player: {
    id: number;
    stableKey: string;
  };
  character: {
    id: number;
    stableKey: string;
    name: string;
  };
  inventorySnapshot: {
    id: number;
    source: string;
    createdAt: string;
  };
  goal: {
    currentLevel: number;
    targetLevel: number;
    currentTalents: Required<TalentLevels>;
    targetTalents: Required<TalentLevels>;
  };
  summary: {
    totalMaterials: number;
    satisfiedMaterials: number;
    missingMaterials: number;
    totalRequiredQuantity: number;
    totalOwnedQuantityForRequiredMaterials: number;
  };
  materials: Array<{
    materialId: number;
    stableKey: string;
    name: string;
    required: number;
    owned: number;
    directOwned?: number;
    effectiveOwned?: number;
    missing: number;
    missingBeforeCrafting?: number;
    missingAfterCrafting?: number;
    status: MaterialDiffStatus;
    sources: string[];
    breakdown: CharacterRequirementResult["materials"][number]["breakdown"];
  }>;
  craftingActions?: CraftingAction[];
  conversionActions?: CraftingAction[];
  warnings: string[];
}

export interface DiffPlayer {
  id: number;
  stableKey: string;
}

export interface DiffCharacter {
  id: number;
  stableKey: string;
  name: string;
}

export interface DiffInventorySnapshot {
  id: number;
  playerId: number;
  source: string;
  capturedAt: Date;
}

export interface DiffInventoryItem {
  materialId: number | null;
  stableKey?: string;
  name?: string;
  quantity: number;
}

export interface DiffPlayerCharacter {
  level: number | null;
  ascension: number | null;
  talentNormal: number | null;
  talentSkill: number | null;
  talentBurst: number | null;
}

export interface InventoryDiffRepository {
  findPlayerByStableKey(stableKey: string): Promise<DiffPlayer | null>;
  findCharacterByStableKey(stableKey: string): Promise<DiffCharacter | null>;
  findPlayerCharacter(playerId: number, characterId: number): Promise<DiffPlayerCharacter | null>;
  findInventorySnapshotById(playerId: number, snapshotId: number): Promise<DiffInventorySnapshot | null>;
  findLatestInventorySnapshot(playerId: number): Promise<DiffInventorySnapshot | null>;
  listInventoryItems(snapshotId: number): Promise<DiffInventoryItem[]>;
}

export interface RequirementCalculator {
  calculate(input: CharacterRequirementInput): Promise<CharacterRequirementResult>;
}

export class InventoryDiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryDiffError";
  }
}

export class PrismaInventoryDiffRepository implements InventoryDiffRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findPlayerByStableKey(stableKey: string): Promise<DiffPlayer | null> {
    return this.client.player.findUnique({
      where: { stableKey },
      select: { id: true, stableKey: true },
    });
  }

  async findCharacterByStableKey(stableKey: string): Promise<DiffCharacter | null> {
    return this.client.character.findUnique({
      where: { stableKey },
      select: { id: true, stableKey: true, name: true },
    });
  }

  async findPlayerCharacter(playerId: number, characterId: number): Promise<DiffPlayerCharacter | null> {
    return this.client.playerCharacter.findFirst({
      where: { playerId, characterId },
      orderBy: { importedAt: "desc" },
      select: {
        level: true,
        ascension: true,
        talentNormal: true,
        talentSkill: true,
        talentBurst: true,
      },
    });
  }

  async findInventorySnapshotById(playerId: number, snapshotId: number): Promise<DiffInventorySnapshot | null> {
    return this.client.inventorySnapshot.findFirst({
      where: { id: snapshotId, playerId },
      select: { id: true, playerId: true, source: true, capturedAt: true },
    });
  }

  async findLatestInventorySnapshot(playerId: number): Promise<DiffInventorySnapshot | null> {
    return this.client.inventorySnapshot.findFirst({
      where: { playerId },
      orderBy: [{ capturedAt: "desc" }, { importedAt: "desc" }, { id: "desc" }],
      select: { id: true, playerId: true, source: true, capturedAt: true },
    });
  }

  async listInventoryItems(snapshotId: number): Promise<DiffInventoryItem[]> {
    const rows = await this.client.inventoryItem.findMany({
      where: { snapshotId },
      select: {
        materialId: true,
        quantity: true,
        material: {
          select: {
            stableKey: true,
            name: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      materialId: row.materialId,
      stableKey: row.material?.stableKey,
      name: row.material?.name,
      quantity: row.quantity,
    }));
  }
}

export class InventoryDiffService {
  constructor(
    private readonly repository: InventoryDiffRepository = new PrismaInventoryDiffRepository(),
    private readonly requirements: RequirementCalculator = new CharacterRequirementService(),
    private readonly craftingRules = new CraftingRuleService(),
    private readonly projection = new InventoryProjectionService(),
    private readonly materialSources = new MaterialSourceService(),
  ) {}

  async diffCharacter(input: CharacterInventoryDiffInput): Promise<CharacterInventoryDiffResult> {
    const player = await this.requirePlayer(input.playerKey);
    const character = await this.requireCharacter(input.characterKey);
    const playerCharacter = input.usePlayerState
      ? await this.requirePlayerCharacter(player.id, character.id, input.characterKey)
      : null;
    const resolved = this.resolveGoal(input, playerCharacter);
    const snapshot = await this.requireSnapshot(player.id, input.inventorySnapshotId);
    const required = await this.requirements.calculate({
      characterKey: input.characterKey,
      currentLevel: resolved.currentLevel,
      targetLevel: input.targetLevel,
      currentAscensionPhase: resolved.currentAscensionPhase,
      targetAscensionPhase: input.targetAscensionPhase,
      currentTalents: resolved.currentTalents,
      targetTalents: resolved.targetTalents,
    });
    const inventoryItems = await this.repository.listInventoryItems(snapshot.id);
    const ownedByMaterialId = aggregateInventoryItems(inventoryItems);
    let materials = required.materials.map((material) => {
      const owned = ownedByMaterialId.get(material.materialId) ?? 0;
      const missing = Math.max(0, material.quantity - owned);

      return {
        materialId: material.materialId,
        stableKey: material.stableKey,
        name: material.name,
        required: material.quantity,
        owned,
        directOwned: owned,
        effectiveOwned: owned,
        missing,
        missingBeforeCrafting: missing,
        missingAfterCrafting: missing,
        status: missing > 0 ? ("missing" as const) : ("satisfied" as const),
        sources: material.sources,
        breakdown: material.breakdown,
      };
    }).sort(compareMaterialDiffs);
    const craftingWarnings: string[] = [];
    let craftingActions: CraftingAction[] | undefined;
    let conversionActions: CraftingAction[] | undefined;

    if (input.useCrafting || input.allowDustOfAzoth || input.allowDreamSolvent) {
      const projectionMaterials = await this.buildProjectionMaterials(required, inventoryItems, ownedByMaterialId);
      const rules = this.craftingRules.buildRules(projectionMaterials);
      const projection = this.projection.project(projectionMaterials, rules, projectionOptions(input));
      craftingActions = projection.craftingActions;
      conversionActions = projection.conversionActions;
      craftingWarnings.push(...projection.warnings);
      materials = materials.map((material) => {
        const effectiveOwned = projection.effectiveOwnedByMaterialKey.get(material.stableKey) ?? material.owned;
        const missingAfterCrafting = projection.missingAfterByMaterialKey.get(material.stableKey) ?? material.missing;

        return {
          ...material,
          owned: effectiveOwned,
          effectiveOwned,
          missing: missingAfterCrafting,
          missingAfterCrafting,
          status: missingAfterCrafting > 0 ? ("missing" as const) : ("satisfied" as const),
        };
      }).sort(compareMaterialDiffs);
    }

    return {
      player,
      character: required.character,
      inventorySnapshot: {
        id: snapshot.id,
        source: snapshot.source,
        createdAt: snapshot.capturedAt.toISOString(),
      },
      goal: {
        currentLevel: resolved.currentLevel,
        targetLevel: input.targetLevel,
        currentTalents: resolved.currentTalents,
        targetTalents: resolved.targetTalents,
      },
      summary: {
        totalMaterials: materials.length,
        satisfiedMaterials: materials.filter((material) => material.status === "satisfied").length,
        missingMaterials: materials.filter((material) => material.status === "missing").length,
        totalRequiredQuantity: materials.reduce((sum, material) => sum + material.required, 0),
        totalOwnedQuantityForRequiredMaterials: materials.reduce((sum, material) => sum + material.owned, 0),
      },
      materials,
      craftingActions,
      conversionActions,
      warnings: [
        ...required.warnings,
        ...craftingWarnings,
        "Manual inventory overrides are future work and are not included in this diff.",
      ],
    };
  }

  private async buildProjectionMaterials(
    required: CharacterRequirementResult,
    inventoryItems: DiffInventoryItem[],
    ownedByMaterialId: Map<number, number>,
  ): Promise<Array<CraftingRuleMaterial & { required: number; directQuantity: number }>> {
    const materialByKey = new Map<string, CraftingRuleMaterial & { required: number; directQuantity: number }>();

    for (const material of required.materials) {
      materialByKey.set(material.stableKey, {
        materialId: material.materialId,
        stableKey: material.stableKey,
        name: material.name,
        required: material.quantity,
        directQuantity: ownedByMaterialId.get(material.materialId) ?? 0,
      });
    }

    for (const item of inventoryItems) {
      if (item.materialId === null || !item.stableKey || !item.name) {
        continue;
      }

      const existing = materialByKey.get(item.stableKey);
      materialByKey.set(item.stableKey, {
        materialId: item.materialId,
        stableKey: item.stableKey,
        name: item.name,
        required: existing?.required ?? 0,
        directQuantity: ownedByMaterialId.get(item.materialId) ?? 0,
      });
    }

    const materials = [...materialByKey.values()];

    for (const material of materials) {
      try {
        const lookup = await this.materialSources.lookup({ materialKey: material.stableKey, includeCalendar: false });
        material.sourceTypes = [...new Set(lookup.sources.map((source) => source.sourceType))];
        material.sourceOptions = lookup.sources.map((source) => ({
          sourceType: source.sourceType,
          sourceKey: source.sourceKey,
          sourceName: source.sourceName,
        }));
      } catch {
        // Source metadata is best-effort for conversion rules; missing sources simply disable ambiguous conversions.
      }
    }

    return materials;
  }

  private async requirePlayer(playerKey: string): Promise<DiffPlayer> {
    const player = await this.repository.findPlayerByStableKey(playerKey);

    if (!player) {
      throw new InventoryDiffError(`Player not found: ${playerKey}`);
    }

    return player;
  }

  private async requireCharacter(characterKey: string): Promise<DiffCharacter> {
    const character = await this.repository.findCharacterByStableKey(characterKey);

    if (!character) {
      throw new InventoryDiffError(`Character not found: ${characterKey}`);
    }

    return character;
  }

  private async requirePlayerCharacter(
    playerId: number,
    characterId: number,
    characterKey: string,
  ): Promise<DiffPlayerCharacter> {
    const playerCharacter = await this.repository.findPlayerCharacter(playerId, characterId);

    if (!playerCharacter) {
      throw new InventoryDiffError(`No player character found for ${characterKey}`);
    }

    return playerCharacter;
  }

  private async requireSnapshot(playerId: number, snapshotId: number | undefined): Promise<DiffInventorySnapshot> {
    const snapshot =
      snapshotId === undefined
        ? await this.repository.findLatestInventorySnapshot(playerId)
        : await this.repository.findInventorySnapshotById(playerId, snapshotId);

    if (!snapshot) {
      throw new InventoryDiffError("No inventory snapshot found for player");
    }

    return snapshot;
  }

  private resolveGoal(
    input: CharacterInventoryDiffInput,
    playerCharacter: DiffPlayerCharacter | null,
  ): {
    currentLevel: number;
    currentAscensionPhase?: number;
    currentTalents: Required<TalentLevels>;
    targetTalents: Required<TalentLevels>;
  } {
    const currentLevel = input.currentLevel ?? playerCharacter?.level ?? undefined;

    if (currentLevel === undefined) {
      throw new InventoryDiffError("currentLevel is required unless --use-player-state can resolve it");
    }

    const currentTalents = normalizeCurrentTalents(input.currentTalents, playerCharacter);
    const targetTalents = normalizeTargetTalents(input.targetTalents, currentTalents);

    return {
      currentLevel,
      currentAscensionPhase: input.currentAscensionPhase ?? playerCharacter?.ascension ?? undefined,
      currentTalents,
      targetTalents,
    };
  }
}

function projectionOptions(input: CharacterInventoryDiffInput): InventoryProjectionOptions {
  return {
    allowTierUpgrades: input.useCrafting || input.allowDustOfAzoth || input.allowDreamSolvent,
    allowDustOfAzoth: input.allowDustOfAzoth,
    allowDreamSolvent: input.allowDreamSolvent,
    preserveLowerTierMaterials: false,
  };
}

export function aggregateInventoryItems(items: DiffInventoryItem[]): Map<number, number> {
  const quantities = new Map<number, number>();

  for (const item of items) {
    if (item.materialId === null) {
      continue;
    }

    quantities.set(item.materialId, (quantities.get(item.materialId) ?? 0) + item.quantity);
  }

  return quantities;
}

function normalizeCurrentTalents(
  explicit: TalentLevels | undefined,
  playerCharacter: DiffPlayerCharacter | null,
): Required<TalentLevels> {
  return {
    normal: explicit?.normal ?? playerCharacter?.talentNormal ?? 1,
    skill: explicit?.skill ?? playerCharacter?.talentSkill ?? 1,
    burst: explicit?.burst ?? playerCharacter?.talentBurst ?? 1,
  };
}

function normalizeTargetTalents(
  explicit: TalentLevels | undefined,
  current: Required<TalentLevels>,
): Required<TalentLevels> {
  return {
    normal: explicit?.normal ?? current.normal,
    skill: explicit?.skill ?? current.skill,
    burst: explicit?.burst ?? current.burst,
  };
}

function compareMaterialDiffs(
  left: CharacterInventoryDiffResult["materials"][number],
  right: CharacterInventoryDiffResult["materials"][number],
): number {
  if (left.status !== right.status) {
    return left.status === "missing" ? -1 : 1;
  }

  if (left.stableKey === "mat_mora") {
    return right.stableKey === "mat_mora" ? 0 : -1;
  }

  if (right.stableKey === "mat_mora") {
    return 1;
  }

  return left.stableKey.localeCompare(right.stableKey) || left.name.localeCompare(right.name);
}
