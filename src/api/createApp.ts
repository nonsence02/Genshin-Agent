import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { CharacterLevelCostService } from "../planner/services/CharacterLevelCostService.js";
import { CharacterRequirementService } from "../planner/services/CharacterRequirementService.js";
import { InventoryDiffService } from "../planner/services/InventoryDiffService.js";
import { MaterialDemandClassifier } from "../planner/services/MaterialDemandClassifier.js";
import { MaterialSourceService } from "../planner/services/MaterialSourceService.js";
import { ResinPlanService } from "../planner/services/ResinPlanService.js";
import { EffectiveInventoryService } from "../player-state/services/EffectiveInventoryService.js";
import { ManualInventoryOverrideService } from "../player-state/services/ManualInventoryOverrideService.js";
import { PlayerStateBuilder } from "../player-state/services/PlayerStateBuilder.js";
import { installErrorHandlers } from "./errors.js";
import { registerHealthRoutes } from "./routes/healthRoutes.js";
import { registerMaterialRoutes } from "./routes/materialRoutes.js";
import { registerPlayerStateRoutes } from "./routes/playerStateRoutes.js";
import { registerPlannerRoutes } from "./routes/plannerRoutes.js";

export interface ApiServices {
  materialSources: Pick<MaterialSourceService, "lookup">;
  materialClassifier: Pick<MaterialDemandClassifier, "classify">;
  characterRequirements: Pick<CharacterRequirementService, "calculate">;
  inventoryDiff: Pick<InventoryDiffService, "diffCharacter">;
  resinPlan: Pick<ResinPlanService, "plan">;
  levelCosts: Pick<CharacterLevelCostService, "calculate">;
  effectiveInventory: Pick<EffectiveInventoryService, "resolve">;
  manualInventoryOverrides: Pick<ManualInventoryOverrideService, "listOverrides" | "upsertOverride" | "deactivateOverride" | "clearOverrides">;
  playerState: Pick<PlayerStateBuilder, "build" | "getCharacterState">;
}

export interface CreateAppOptions {
  services?: Partial<ApiServices>;
  logger?: boolean;
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const services = createServices(options.services);

  await app.register(cors, {
    origin: parseCorsOrigin(process.env.API_CORS_ORIGIN),
  });

  installErrorHandlers(app);
  await registerHealthRoutes(app);
  await registerMaterialRoutes(app, services);
  await registerPlayerStateRoutes(app, services);
  await registerPlannerRoutes(app, services);
  registerOpenApiRoute(app);

  return app;
}

function createServices(overrides: Partial<ApiServices> | undefined): ApiServices {
  return {
    materialSources: overrides?.materialSources ?? new MaterialSourceService(),
    materialClassifier: overrides?.materialClassifier ?? new MaterialDemandClassifier(),
    characterRequirements: overrides?.characterRequirements ?? new CharacterRequirementService(),
    inventoryDiff: overrides?.inventoryDiff ?? new InventoryDiffService(),
    resinPlan: overrides?.resinPlan ?? new ResinPlanService(),
    levelCosts: overrides?.levelCosts ?? new CharacterLevelCostService(),
    effectiveInventory: overrides?.effectiveInventory ?? new EffectiveInventoryService(),
    manualInventoryOverrides: overrides?.manualInventoryOverrides ?? new ManualInventoryOverrideService(),
    playerState: overrides?.playerState ?? new PlayerStateBuilder(),
  };
}

function parseCorsOrigin(value: string | undefined): string[] | boolean {
  if (!value || value.trim() === "") {
    return ["http://localhost:3000", "http://127.0.0.1:3000"];
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function registerOpenApiRoute(app: FastifyInstance): void {
  app.get("/docs/openapi.json", async () => ({
    openapi: "3.1.0",
    info: {
      title: "Genshin-Agent Local API",
      version: "0.1.0",
    },
    paths: {
      "/health": { get: { summary: "Health check" } },
      "/knowledge/materials/{materialKey}/sources": { get: { summary: "Look up normalized material sources" } },
      "/planner/materials/{materialKey}/classification": { get: { summary: "Classify material demand source behavior" } },
      "/planner/level-costs": { get: { summary: "Calculate character level EXP and Mora costs" } },
      "/planner/character/requirements": { post: { summary: "Calculate deterministic character requirements" } },
      "/planner/character/diff": { post: { summary: "Compare character requirements against player inventory" } },
      "/planner/character/plan": { post: { summary: "Build a deterministic resin farming plan" } },
      "/player/{playerKey}/inventory/effective": { get: { summary: "Resolve snapshot inventory with manual overrides" } },
      "/player/{playerKey}/state": { get: { summary: "Build merged player state from imported sources" } },
      "/player/{playerKey}/characters/{characterKey}/state": { get: { summary: "Build merged character state" } },
      "/player/{playerKey}/inventory/overrides": { get: { summary: "List manual inventory overrides" } },
      "/player/{playerKey}/inventory/overrides/{materialKey}": { put: { summary: "Create or update a manual inventory override" } },
    },
  }));
}
