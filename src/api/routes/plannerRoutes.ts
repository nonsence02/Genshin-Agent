import type { FastifyInstance } from "fastify";
import type { ApiServices } from "../createApp.js";
import { parseWithSchema } from "../errors.js";
import {
  characterDiffBodySchema,
  characterPlanBodySchema,
  characterRequirementsBodySchema,
  levelCostsQuerySchema,
  materialKeyParamsSchema,
} from "../schemas.js";

export async function registerPlannerRoutes(app: FastifyInstance, services: ApiServices): Promise<void> {
  app.get("/planner/materials/:materialKey/classification", async (request) => {
    const params = parseWithSchema(materialKeyParamsSchema, request.params);
    const lookup = await services.materialSources.lookup({
      materialKey: params.materialKey,
      includeCalendar: true,
    });

    return services.materialClassifier.classify({
      material: {
        materialId: lookup.material.id,
        stableKey: lookup.material.stableKey,
        name: lookup.material.name,
      },
      sourceLookup: lookup,
    });
  });

  app.get("/planner/level-costs", async (request) => {
    const query = parseWithSchema(levelCostsQuerySchema, request.query);
    return services.levelCosts.calculate(query);
  });

  app.post("/planner/character/requirements", async (request) => {
    const body = parseWithSchema(characterRequirementsBodySchema, request.body);
    return services.characterRequirements.calculate(body);
  });

  app.post("/planner/character/diff", async (request) => {
    const body = parseWithSchema(characterDiffBodySchema, request.body);
    return services.inventoryDiff.diffCharacter(body);
  });

  app.post("/planner/character/plan", async (request) => {
    const body = parseWithSchema(characterPlanBodySchema, request.body);
    return services.resinPlan.plan(body);
  });
}
