import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

export interface HoyoApiEnvUpdate {
  cookieString: string;
  uid?: string | number;
  lang?: string;
}

export interface HoyoApiEnvWriteResult {
  written: boolean;
  path: string;
  updatedKeys: string[];
  reason?: string;
}

export function writeHoyoApiEnvFile(
  path: string,
  update: HoyoApiEnvUpdate,
  options: { noWrite?: boolean } = {},
): HoyoApiEnvWriteResult {
  const resolvedPath = resolve(path);
  const updatedKeys = ["HOYOAPI_COOKIE"];

  if (update.uid !== undefined) {
    updatedKeys.push("HOYOAPI_UID");
  }

  updatedKeys.push("HOYOAPI_LANG");

  if (options.noWrite) {
    return {
      written: false,
      path: resolvedPath,
      updatedKeys,
      reason: "--no-write",
    };
  }

  const existing = existsSync(resolvedPath) ? readFileSync(resolvedPath, "utf8") : "";
  const next = upsertEnvValues(existing, {
    HOYOAPI_COOKIE: quoteEnvValue(update.cookieString),
    ...(update.uid !== undefined ? { HOYOAPI_UID: String(update.uid) } : {}),
    HOYOAPI_LANG: update.lang ?? "en",
  });

  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, next, "utf8");

  return {
    written: true,
    path: resolvedPath,
    updatedKeys,
  };
}

export function upsertEnvValues(content: string, updates: Record<string, string>): string {
  const remaining = new Map(Object.entries(updates));
  const lines = content ? content.split(/\r?\n/) : [];
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);

    if (!match) {
      return line;
    }

    const key = match[1];
    const value = remaining.get(key);

    if (value === undefined) {
      return line;
    }

    remaining.delete(key);
    return `${key}=${value}`;
  });

  for (const [key, value] of remaining) {
    nextLines.push(`${key}=${value}`);
  }

  return `${nextLines.filter((line, index) => line !== "" || index < nextLines.length - 1).join("\n")}\n`;
}

function quoteEnvValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
