import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiNotFoundError";
  }
}

export function installErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler(async (request, reply) => {
    await reply.code(404).send(errorBody("NOT_FOUND", `Route not found: ${request.method} ${request.url}`));
  });

  app.setErrorHandler(async (error, request, reply) => {
    await sendApiError(normalizeError(error), request, reply);
  });
}

export function parseWithSchema<T>(schema: { parse: (value: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}

async function sendApiError(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const mapped = mapError(error, request);
  await reply.code(mapped.statusCode).send(mapped.body);
}

function mapError(error: Error, request: FastifyRequest): { statusCode: number; body: ApiErrorBody } {
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: errorBody("VALIDATION_ERROR", "Request validation failed", error.issues),
    };
  }

  if (isNotFoundError(error)) {
    return {
      statusCode: 404,
      body: errorBody("NOT_FOUND", error.message),
    };
  }

  if (isDomainError(error)) {
    return {
      statusCode: 400,
      body: errorBody("DOMAIN_ERROR", error.message),
    };
  }

  request.log.error(error);

  return {
    statusCode: 500,
    body: errorBody(
      "INTERNAL_ERROR",
      "Unexpected API error",
      process.env.NODE_ENV === "development" ? { name: error.name, message: error.message, stack: error.stack } : undefined,
    ),
  };
}

function isNotFoundError(error: Error): boolean {
  return error instanceof ApiNotFoundError || error.name.endsWith("NotFoundError") || /not found/i.test(error.message);
}

function isDomainError(error: Error): boolean {
  return [
    "CharacterRequirementError",
    "CharacterLevelCostError",
    "InventoryDiffError",
    "MaterialSourceError",
  ].includes(error.name);
}

function errorBody(code: string, message: string, details?: unknown): ApiErrorBody {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}
