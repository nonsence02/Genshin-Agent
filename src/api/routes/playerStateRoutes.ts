import type { FastifyInstance } from "fastify";
import type { ApiServices } from "../createApp.js";
import { parseWithSchema } from "../errors.js";
import {
  effectiveInventoryQuerySchema,
  manualOverrideBodySchema,
  playerKeyParamsSchema,
  playerMaterialKeyParamsSchema,
} from "../schemas.js";

export async function registerPlayerStateRoutes(app: FastifyInstance, services: ApiServices): Promise<void> {
  app.get("/player/:playerKey/inventory/effective", async (request) => {
    const params = parseWithSchema(playerKeyParamsSchema, request.params);
    const query = parseWithSchema(effectiveInventoryQuerySchema, request.query);

    return services.effectiveInventory.resolve({
      playerKey: params.playerKey,
      inventorySnapshotId: query.snapshotId,
      includeManualOverrides: query.includeManualOverrides,
    });
  });

  app.get("/player/:playerKey/inventory/overrides", async (request) => {
    const params = parseWithSchema(playerKeyParamsSchema, request.params);
    return services.manualInventoryOverrides.listOverrides(params.playerKey);
  });

  app.put("/player/:playerKey/inventory/overrides/:materialKey", async (request) => {
    const params = parseWithSchema(playerMaterialKeyParamsSchema, request.params);
    const body = parseWithSchema(manualOverrideBodySchema, request.body);

    return services.manualInventoryOverrides.upsertOverride(params.playerKey, params.materialKey, body);
  });

  app.delete("/player/:playerKey/inventory/overrides/:materialKey", async (request) => {
    const params = parseWithSchema(playerMaterialKeyParamsSchema, request.params);
    return services.manualInventoryOverrides.deactivateOverride(params.playerKey, params.materialKey);
  });

  app.post("/player/:playerKey/inventory/overrides/clear", async (request) => {
    const params = parseWithSchema(playerKeyParamsSchema, request.params);
    return services.manualInventoryOverrides.clearOverrides(params.playerKey);
  });
}
