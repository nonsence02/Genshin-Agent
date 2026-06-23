import type { FastifyInstance } from "fastify";
import type { ApiServices } from "../createApp.js";
import { parseWithSchema } from "../errors.js";
import { materialKeyParamsSchema, materialSourcesQuerySchema } from "../schemas.js";

export async function registerMaterialRoutes(app: FastifyInstance, services: ApiServices): Promise<void> {
  app.get("/knowledge/materials/:materialKey/sources", async (request) => {
    const params = parseWithSchema(materialKeyParamsSchema, request.params);
    const query = parseWithSchema(materialSourcesQuerySchema, request.query);

    return services.materialSources.lookup({
      materialKey: params.materialKey,
      includeCalendar: query.includeCalendar,
    });
  });
}
