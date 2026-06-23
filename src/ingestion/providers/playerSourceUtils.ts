import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface JsonFileReadResult {
  filePath: string;
  fileHash: string;
  payload: unknown;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function optionalInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number(value);
  }

  return undefined;
}

export async function readJsonFile(filePath: string): Promise<JsonFileReadResult> {
  const rawText = await readFile(filePath, "utf-8");
  const fileHash = createHash("sha256").update(rawText).digest("hex");

  try {
    return {
      filePath,
      fileHash,
      payload: JSON.parse(rawText),
    };
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${(error as Error).message}`);
  }
}
