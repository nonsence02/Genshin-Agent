export interface TalentLevels {
  normal?: number;
  skill?: number;
  burst?: number;
}

export interface CharacterRequirementsPayload {
  characterKey: string;
  currentLevel: number;
  targetLevel: number;
  currentAscensionPhase?: number;
  targetAscensionPhase?: number;
  currentTalents?: TalentLevels;
  targetTalents?: TalentLevels;
}

export interface CharacterDiffPayload extends CharacterRequirementsPayload {
  playerKey: string;
  inventorySnapshotId?: number;
  usePlayerState?: boolean;
  withSources?: boolean;
  classify?: boolean;
  useCrafting?: boolean;
  allowDustOfAzoth?: boolean;
  allowDreamSolvent?: boolean;
}

export interface CharacterPlanPayload extends CharacterDiffPayload {
  startDate?: string;
  days?: number;
  dailyResinBudget?: number;
  currentResin?: number;
  includeOpenWorld?: boolean;
  discountedWeeklyBossClaimsUsed?: number;
}

export interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface PlannerMaterial {
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
  status: "satisfied" | "missing";
  sources?: string[];
}

export interface CraftingAction {
  ruleId: string;
  type: string;
  inputMaterialName: string;
  inputQuantity: number;
  outputMaterialName: string;
  outputQuantity: number;
  catalystMaterialName?: string;
  catalystQuantity?: number;
  warnings?: string[];
}

export interface InventoryDiffResult {
  player: { id: number; stableKey: string };
  character: { id: number; stableKey: string; name: string };
  inventorySnapshot: { id: number; source: string; createdAt: string };
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
  materials: PlannerMaterial[];
  craftingActions?: CraftingAction[];
  conversionActions?: CraftingAction[];
  warnings: string[];
}

export interface ResinPlanResult {
  goal: InventoryDiffResult["goal"] & { playerKey: string; characterKey: string };
  inventoryDiff: InventoryDiffResult;
  sourceGroups: unknown[];
  schedule: Array<{
    date: string;
    dayOfWeek: string;
    resinBudget: number;
    plannedResin: number;
    tasks: Array<{
      taskType: string;
      materialKey: string;
      materialName: string;
      sourceType: string;
      sourceName?: string;
      materials?: Array<{ materialKey: string; materialName: string; missing: number; role: string }>;
      runs?: number | null;
      resin?: number | null;
      warnings: string[];
    }>;
  }>;
  openWorldTasks: FarmTask[];
  unknownTasks: FarmTask[];
  summary: {
    totalMissingMaterials: number;
    totalEstimatedResin: number | null;
    scheduledEstimatedResin: number;
    unscheduledResinTasks: number;
    openWorldTasks: number;
    unknownTasks: number;
  };
  warnings: string[];
}

export interface FarmTask {
  materialKey: string;
  materialName: string;
  missing: number;
  sourceType: string;
  sourceName?: string;
  warnings: string[];
}

export interface CharacterRequirementResult {
  character: { id: number; stableKey: string; name: string };
  materials: Array<{ materialId: number; stableKey: string; name: string; quantity: number }>;
  warnings: string[];
}

export class PlannerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PlannerApiError";
  }
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";
declare const __GENSHIN_AGENT_API_BASE_URL__: string | undefined;

export function createPlannerApiClient(baseUrl = getDefaultBaseUrl()) {
  return {
    health: () => request<unknown>(baseUrl, "/health"),
    getMaterialSources: (materialKey: string) =>
      request<unknown>(baseUrl, `/knowledge/materials/${encodeURIComponent(materialKey)}/sources`),
    getMaterialClassification: (materialKey: string) =>
      request<unknown>(baseUrl, `/planner/materials/${encodeURIComponent(materialKey)}/classification`),
    getCharacterRequirements: (payload: CharacterRequirementsPayload) =>
      request<CharacterRequirementResult>(baseUrl, "/planner/character/requirements", { method: "POST", body: payload }),
    getCharacterDiff: (payload: CharacterDiffPayload) =>
      request<InventoryDiffResult>(baseUrl, "/planner/character/diff", { method: "POST", body: payload }),
    getCharacterPlan: (payload: CharacterPlanPayload) =>
      request<ResinPlanResult>(baseUrl, "/planner/character/plan", { method: "POST", body: payload }),
    getLevelCosts: (currentLevel: number, targetLevel: number) =>
      request<unknown>(baseUrl, `/planner/level-costs?currentLevel=${currentLevel}&targetLevel=${targetLevel}`),
  };
}

function getDefaultBaseUrl(): string {
  return typeof __GENSHIN_AGENT_API_BASE_URL__ === "string" && __GENSHIN_AGENT_API_BASE_URL__.length > 0
    ? __GENSHIN_AGENT_API_BASE_URL__
    : DEFAULT_API_BASE_URL;
}

async function request<T>(
  baseUrl: string,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new PlannerApiError(`Backend unavailable at ${baseUrl}`, 0, "BACKEND_UNAVAILABLE", error);
  }

  const data = (await response.json().catch(() => ({}))) as ApiErrorResponse | T;

  if (!response.ok) {
    const error = data as ApiErrorResponse;
    throw new PlannerApiError(
      error.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error.error?.code,
      error.error?.details,
    );
  }

  return data as T;
}
