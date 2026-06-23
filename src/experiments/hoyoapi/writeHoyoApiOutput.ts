import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sanitizeHoyoApiOutput } from "./sanitizeHoyoApiOutput.js";

export interface HoyoApiOutputWriteOptions {
  out?: string;
  noWrite?: boolean;
}

export interface HoyoApiOutputWriteResult {
  written: boolean;
  path?: string;
  reason?: string;
  ignoredByGit?: boolean;
}

export function writeHoyoApiOutput(value: unknown, options: HoyoApiOutputWriteOptions): HoyoApiOutputWriteResult {
  if (!options.out) {
    return {
      written: false,
      reason: "--out was not provided",
    };
  }

  const outPath = resolve(options.out);

  if (options.noWrite) {
    return {
      written: false,
      path: outPath,
      reason: "--no-write",
    };
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(sanitizeHoyoApiOutput(value), null, 2)}\n`, "utf8");

  return {
    written: true,
    path: outPath,
    ignoredByGit: isIgnoredByGit(outPath),
  };
}

function isIgnoredByGit(path: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", path], {
      stdio: "ignore",
    });

    return true;
  } catch {
    return false;
  }
}
