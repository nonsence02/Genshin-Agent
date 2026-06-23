import { describe, expect, it } from "vitest";
import {
  aggregateInventoryItems,
  InventoryDiffError,
  InventoryDiffService,
  type DiffCharacter,
  type DiffInventoryItem,
  type DiffInventorySnapshot,
  type DiffPlayer,
  type DiffPlayerCharacter,
  type InventoryDiffRepository,
  type RequirementCalculator,
  type InventoryDiffEffectiveInventoryService,
  type InventoryDiffPlayerStateResolver,
} from "../../src/planner/services/InventoryDiffService.js";
import type { CharacterRequirementInput, CharacterRequirementResult } from "../../src/planner/services/CharacterRequirementService.js";
import { MaterialSourceService, type MaterialSourceLookupResult } from "../../src/planner/services/MaterialSourceService.js";
import type { EffectiveInventoryResult } from "../../src/player-state/services/EffectiveInventoryService.js";
import type { PlayerCharacterState } from "../../src/player-state/services/PlayerStateBuilder.js";

class MockInventoryDiffRepository implements InventoryDiffRepository {
  player: DiffPlayer | null = { id: 1, stableKey: "default" };
  character: DiffCharacter | null = { id: 10, stableKey: "char_furina", name: "Furina" };
  playerCharacter: DiffPlayerCharacter | null = {
    level: 70,
    ascension: 4,
    talentNormal: 2,
    talentSkill: 8,
    talentBurst: 7,
  };
  snapshots: DiffInventorySnapshot[] = [
    { id: 1, playerId: 1, source: "old", capturedAt: new Date("2024-01-01T00:00:00.000Z") },
    { id: 2, playerId: 1, source: "inventory-kamera", capturedAt: new Date("2024-02-01T00:00:00.000Z") },
  ];
  itemsBySnapshot = new Map<number, DiffInventoryItem[]>([
    [
      2,
      [
        { materialId: 1, quantity: 50 },
        { materialId: 2, quantity: 3 },
        { materialId: 2, quantity: 4 },
        { materialId: 3, quantity: 99 },
        { materialId: 4, quantity: 1 },
        { materialId: 5, stableKey: "mat_teachings_of_justice", name: "Teachings of Justice", quantity: 3 },
        { materialId: null, quantity: 999 },
      ],
    ],
  ]);

  async findPlayerByStableKey(stableKey: string): Promise<DiffPlayer | null> {
    return this.player?.stableKey === stableKey ? this.player : null;
  }

  async findCharacterByStableKey(stableKey: string): Promise<DiffCharacter | null> {
    return this.character?.stableKey === stableKey ? this.character : null;
  }

  async findPlayerCharacter(): Promise<DiffPlayerCharacter | null> {
    return this.playerCharacter;
  }

  async findInventorySnapshotById(_playerId: number, snapshotId: number): Promise<DiffInventorySnapshot | null> {
    return this.snapshots.find((snapshot) => snapshot.id === snapshotId) ?? null;
  }

  async findLatestInventorySnapshot(): Promise<DiffInventorySnapshot | null> {
    return [...this.snapshots].sort((left, right) => right.capturedAt.getTime() - left.capturedAt.getTime())[0] ?? null;
  }

  async listInventoryItems(snapshotId: number): Promise<DiffInventoryItem[]> {
    return this.itemsBySnapshot.get(snapshotId) ?? [];
  }
}

class MockRequirementCalculator implements RequirementCalculator {
  lastInput: CharacterRequirementInput | null = null;

  async calculate(input: CharacterRequirementInput): Promise<CharacterRequirementResult> {
    this.lastInput = input;

    return {
      character: { id: 10, stableKey: "char_furina", name: "Furina" },
      ascension: { currentPhase: 0, targetPhase: 6, includedPhases: [1, 2, 3, 4, 5, 6] },
      talents: {
        normal: { current: input.currentTalents?.normal ?? 1, target: input.targetTalents?.normal ?? 1, includedLevels: [] },
        skill: { current: input.currentTalents?.skill ?? 1, target: input.targetTalents?.skill ?? 1, includedLevels: [] },
        burst: { current: input.currentTalents?.burst ?? 1, target: input.targetTalents?.burst ?? 1, includedLevels: [] },
      },
      materials: [
        {
          materialId: 1,
          stableKey: "mat_mora",
          name: "Mora",
          quantity: 100,
          sources: ["ascension"],
          breakdown: [{ source: "ascension", phase: 1, quantity: 100 }],
        },
        {
          materialId: 2,
          stableKey: "mat_lakelight_lily",
          name: "Lakelight Lily",
          quantity: 7,
          sources: ["ascension"],
          breakdown: [{ source: "ascension", phase: 1, quantity: 7 }],
        },
        {
          materialId: 3,
          stableKey: "mat_teachings_of_justice",
          name: "Teachings of Justice",
          quantity: 10,
          sources: ["talent_skill"],
          breakdown: [{ source: "talent_skill", fromLevel: 1, toLevel: 2, quantity: 10 }],
        },
        {
          materialId: 4,
          stableKey: "mat_heros_wit",
          name: "Hero's Wit",
          quantity: 2,
          sources: ["level_exp"],
          breakdown: [{ source: "level_exp", fromLevel: 20, toLevel: 90, quantity: 2 }],
        },
      ],
      warnings: [],
    };
  }
}

class MockEffectiveInventoryService implements InventoryDiffEffectiveInventoryService {
  overrides = new Map<number, { mode: "absolute" | "delta"; quantity: number }>();
  lastIncludeManualOverrides: boolean | undefined;

  constructor(private readonly repository: MockInventoryDiffRepository) {}

  async resolve(input: { playerKey: string; inventorySnapshotId?: number; includeManualOverrides?: boolean }): Promise<EffectiveInventoryResult> {
    this.lastIncludeManualOverrides = input.includeManualOverrides;
    const player = await this.repository.findPlayerByStableKey(input.playerKey);
    const snapshot =
      input.inventorySnapshotId === undefined
        ? await this.repository.findLatestInventorySnapshot()
        : await this.repository.findInventorySnapshotById(player?.id ?? 0, input.inventorySnapshotId);

    if (!player) {
      throw new Error(`Player not found: ${input.playerKey}`);
    }
    if (!snapshot) {
      throw new Error("No inventory snapshot found for player");
    }

    const snapshotQuantities = new Map<number, number>();
    for (const item of await this.repository.listInventoryItems(snapshot.id)) {
      if (item.materialId === null) {
        continue;
      }
      snapshotQuantities.set(item.materialId, (snapshotQuantities.get(item.materialId) ?? 0) + item.quantity);
    }

    const materialIds = new Set([...snapshotQuantities.keys()]);
    if (input.includeManualOverrides !== false) {
      for (const materialId of this.overrides.keys()) {
        materialIds.add(materialId);
      }
    }

    const items = [...materialIds].map((materialId) => {
      const snapshotQuantity = snapshotQuantities.get(materialId) ?? 0;
      const override = input.includeManualOverrides === false ? undefined : this.overrides.get(materialId);
      const rawEffective =
        override === undefined
          ? snapshotQuantity
          : override.mode === "absolute"
            ? override.quantity
            : snapshotQuantity + override.quantity;

      return {
        materialId,
        stableKey: materialKeyById(materialId),
        name: materialNameById(materialId),
        snapshotQuantity,
        overrideMode: override?.mode,
        overrideQuantity: override?.quantity,
        effectiveQuantity: Math.max(0, rawEffective),
        overrideActive: override !== undefined,
      };
    });

    return {
      player,
      snapshot: { id: snapshot.id, source: snapshot.source, createdAt: snapshot.capturedAt.toISOString() },
      items,
      overridesApplied: input.includeManualOverrides === false ? 0 : this.overrides.size,
      warnings: [],
    };
  }
}

class MockPlayerStateResolver implements InventoryDiffPlayerStateResolver {
  state: PlayerCharacterState | null = {
    character: { id: 10, stableKey: "char_furina", key: "furina", name: "Furina" },
    level: 70,
    ascension: 4,
    talents: { normal: 2, skill: 8, burst: 7 },
    equippedArtifacts: [],
    sources: { level: "hoyolab_profile", ascension: "inventory-kamera-good" },
    conflicts: [],
    warnings: [],
  };

  async getCharacterState(): Promise<PlayerCharacterState> {
    if (!this.state) {
      throw new Error("No merged player state found for char_furina");
    }
    return this.state;
  }
}

class CraftingRequirementCalculator implements RequirementCalculator {
  async calculate(input: CharacterRequirementInput): Promise<CharacterRequirementResult> {
    return {
      character: { id: 10, stableKey: input.characterKey, name: "Furina" },
      ascension: { currentPhase: 0, targetPhase: 0, includedPhases: [] },
      talents: {
        normal: { current: 1, target: 1, includedLevels: [] },
        skill: { current: 1, target: 1, includedLevels: [] },
        burst: { current: 1, target: 1, includedLevels: [] },
      },
      materials: [
        {
          materialId: 6,
          stableKey: "mat_guide_to_justice",
          name: "Guide to Justice",
          quantity: 1,
          sources: ["talent_skill"],
          breakdown: [{ source: "talent_skill", fromLevel: 2, toLevel: 3, quantity: 1 }],
        },
      ],
      warnings: [],
    };
  }
}

class EmptyMaterialSourceService extends MaterialSourceService {
  override async lookup(input: { materialKey?: string }): Promise<MaterialSourceLookupResult> {
    return {
      material: { id: 1, stableKey: input.materialKey ?? "unknown", name: input.materialKey ?? "unknown" },
      sources: [],
      warnings: [],
    };
  }
}

function setup(): {
  repository: MockInventoryDiffRepository;
  requirements: MockRequirementCalculator;
  service: InventoryDiffService;
} {
  const repository = new MockInventoryDiffRepository();
  const requirements = new MockRequirementCalculator();
  const effectiveInventory = new MockEffectiveInventoryService(repository);
  const service = new InventoryDiffService(repository, requirements, undefined, undefined, undefined, effectiveInventory, new MockPlayerStateResolver());

  return { repository, requirements, service };
}

describe("InventoryDiffService", () => {
  it("aggregates inventory items by materialId and ignores unresolved items", () => {
    expect(
      Object.fromEntries(
        aggregateInventoryItems([
          { materialId: 1, quantity: 2 },
          { materialId: 1, quantity: 3 },
          { materialId: null, quantity: 99 },
        ]),
      ),
    ).toEqual({ 1: 5 });
  });

  it("calculates missing and satisfied materials", async () => {
    const { service } = setup();
    const result = await service.diffCharacter({
      playerKey: "default",
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
      targetTalents: { skill: 9 },
    });

    expect(result.materials.find((material) => material.stableKey === "mat_mora")).toMatchObject({
      required: 100,
      owned: 50,
      missing: 50,
      status: "missing",
    });
    expect(result.materials.find((material) => material.stableKey === "mat_lakelight_lily")).toMatchObject({
      required: 7,
      owned: 7,
      missing: 0,
      status: "satisfied",
    });
    expect(result.materials.find((material) => material.stableKey === "mat_teachings_of_justice")).toMatchObject({
      required: 10,
      owned: 99,
      missing: 0,
      status: "satisfied",
    });
    expect(result.materials.find((material) => material.stableKey === "mat_heros_wit")).toMatchObject({
      required: 2,
      owned: 1,
      missing: 1,
      status: "missing",
    });
  });

  it("can project craftable inventory into effective owned quantities", async () => {
    const repository = new MockInventoryDiffRepository();
    const service = new InventoryDiffService(
      repository,
      new CraftingRequirementCalculator(),
      undefined,
      undefined,
      new EmptyMaterialSourceService(),
      new MockEffectiveInventoryService(repository),
    );

    const result = await service.diffCharacter({
      playerKey: "default",
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
      useCrafting: true,
    });
    const guide = result.materials.find((material) => material.stableKey === "mat_guide_to_justice");

    expect(guide).toMatchObject({
      directOwned: 0,
      effectiveOwned: 1,
      missingBeforeCrafting: 1,
      missingAfterCrafting: 0,
      missing: 0,
      status: "satisfied",
    });
    expect(result.craftingActions?.[0]).toMatchObject({
      inputMaterialKey: "mat_teachings_of_justice",
      outputMaterialKey: "mat_guide_to_justice",
    });
  });

  it("uses effective inventory with manual overrides by default", async () => {
    const repository = new MockInventoryDiffRepository();
    const requirements = new MockRequirementCalculator();
    const effectiveInventory = new MockEffectiveInventoryService(repository);
    effectiveInventory.overrides.set(4, { mode: "absolute", quantity: 40 });
    const service = new InventoryDiffService(repository, requirements, undefined, undefined, undefined, effectiveInventory, new MockPlayerStateResolver());

    const result = await service.diffCharacter({
      playerKey: "default",
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
    });

    expect(result.overridesApplied).toBe(1);
    expect(result.materials.find((material) => material.stableKey === "mat_heros_wit")).toMatchObject({
      snapshotOwned: 1,
      effectiveOwnedBeforeCrafting: 40,
      owned: 40,
      missing: 0,
      overrideMode: "absolute",
      overrideQuantity: 40,
    });
  });

  it("can disable manual overrides", async () => {
    const repository = new MockInventoryDiffRepository();
    const requirements = new MockRequirementCalculator();
    const effectiveInventory = new MockEffectiveInventoryService(repository);
    effectiveInventory.overrides.set(4, { mode: "absolute", quantity: 40 });
    const service = new InventoryDiffService(repository, requirements, undefined, undefined, undefined, effectiveInventory, new MockPlayerStateResolver());

    const result = await service.diffCharacter({
      playerKey: "default",
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
      includeManualOverrides: false,
    });

    expect(result.overridesApplied).toBe(0);
    expect(result.materials.find((material) => material.stableKey === "mat_heros_wit")).toMatchObject({
      snapshotOwned: 1,
      owned: 1,
      missing: 1,
    });
  });

  it("uses effective inventory as the crafting projection base", async () => {
    const repository = new MockInventoryDiffRepository();
    const effectiveInventory = new MockEffectiveInventoryService(repository);
    effectiveInventory.overrides.set(5, { mode: "absolute", quantity: 3 });
    const service = new InventoryDiffService(
      repository,
      new CraftingRequirementCalculator(),
      undefined,
      undefined,
      new EmptyMaterialSourceService(),
      effectiveInventory,
    );

    const result = await service.diffCharacter({
      playerKey: "default",
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
      useCrafting: true,
    });

    expect(result.craftingActions?.[0]).toMatchObject({
      inputQuantity: 3,
      outputQuantity: 1,
    });
  });

  it("selects the latest snapshot when no snapshot id is provided", async () => {
    const { service } = setup();
    const result = await service.diffCharacter({
      playerKey: "default",
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
    });

    expect(result.inventorySnapshot.id).toBe(2);
    expect(result.inventorySnapshot.source).toBe("inventory-kamera");
  });

  it("passes explicit current state input into CharacterRequirementService", async () => {
    const { requirements, service } = setup();
    await service.diffCharacter({
      playerKey: "default",
      characterKey: "char_furina",
      currentLevel: 20,
      targetLevel: 90,
      currentTalents: { normal: 1, skill: 2, burst: 3 },
      targetTalents: { skill: 9 },
    });

    expect(requirements.lastInput).toMatchObject({
      currentLevel: 20,
      targetLevel: 90,
      currentTalents: { normal: 1, skill: 2, burst: 3 },
      targetTalents: { normal: 1, skill: 9, burst: 3 },
    });
  });

  it("resolves current level, ascension, and talents from PlayerStateBuilder when usePlayerState is true", async () => {
    const { requirements, service } = setup();
    const result = await service.diffCharacter({
      playerKey: "default",
      characterKey: "char_furina",
      targetLevel: 90,
      usePlayerState: true,
      targetTalents: { skill: 9 },
    });

    expect(result.goal.currentLevel).toBe(70);
    expect(result.goal.currentTalents).toEqual({ normal: 2, skill: 8, burst: 7 });
    expect(result.goal.targetTalents).toEqual({ normal: 2, skill: 9, burst: 7 });
    expect(requirements.lastInput?.currentAscensionPhase).toBe(4);
  });

  it("lets explicit values override merged player-state values", async () => {
    const { requirements, service } = setup();
    await service.diffCharacter({
      playerKey: "default",
      characterKey: "char_furina",
      targetLevel: 90,
      usePlayerState: true,
      currentLevel: 20,
      currentTalents: { skill: 1 },
    });

    expect(requirements.lastInput?.currentLevel).toBe(20);
    expect(requirements.lastInput?.currentTalents).toMatchObject({ normal: 2, skill: 1, burst: 7 });
  });

  it("lets explicit currentAscensionPhase override merged player-state ascension", async () => {
    const { requirements, service } = setup();
    await service.diffCharacter({
      playerKey: "default",
      characterKey: "char_furina",
      targetLevel: 90,
      usePlayerState: true,
      currentAscensionPhase: 2,
    });

    expect(requirements.lastInput?.currentAscensionPhase).toBe(2);
  });

  it("throws a clear error when no snapshot exists", async () => {
    const { repository, service } = setup();
    repository.snapshots = [];

    await expect(
      service.diffCharacter({
        playerKey: "default",
        characterKey: "char_furina",
        currentLevel: 20,
        targetLevel: 90,
      }),
    ).rejects.toThrow("No inventory snapshot found for player");
  });

  it("throws a clear error when usePlayerState cannot resolve PlayerCharacter", async () => {
    const repository = new MockInventoryDiffRepository();
    const playerState = new MockPlayerStateResolver();
    playerState.state = null;
    const service = new InventoryDiffService(
      repository,
      new MockRequirementCalculator(),
      undefined,
      undefined,
      undefined,
      new MockEffectiveInventoryService(repository),
      playerState,
    );

    await expect(
      service.diffCharacter({
        playerKey: "default",
        characterKey: "char_furina",
        targetLevel: 90,
        usePlayerState: true,
      }),
    ).rejects.toThrow(InventoryDiffError);
  });
});

function materialKeyById(materialId: number): string {
  return (
    {
      1: "mat_mora",
      2: "mat_lakelight_lily",
      3: "mat_teachings_of_justice",
      4: "mat_heros_wit",
      5: "mat_teachings_of_justice",
      6: "mat_guide_to_justice",
    }[materialId] ?? `mat_${materialId}`
  );
}

function materialNameById(materialId: number): string {
  return (
    {
      1: "Mora",
      2: "Lakelight Lily",
      3: "Teachings of Justice",
      4: "Hero's Wit",
      5: "Teachings of Justice",
      6: "Guide to Justice",
    }[materialId] ?? `Material ${materialId}`
  );
}
