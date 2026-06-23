import { createRequire } from "node:module";
import * as genshinDb from "genshin-db";

const require = createRequire(__filename);
const genshinDbPackage = require("genshin-db/package.json") as { version: string };

export const GENSHIN_DB_SOURCE = "genshin-db";

export const DEFAULT_GENSHIN_DB_FOLDERS = [
  "characters",
  "talents",
  "constellations",
  "weapons",
  "materials",
  "domains",
  "enemies",
  "artifacts",
] as const;

export type GenshinDbFolder = (typeof DEFAULT_GENSHIN_DB_FOLDERS)[number];

export interface GenshinDbDumpObject {
  externalKey: string;
  raw: unknown;
}

export interface GenshinDbObject {
  folder: string;
  externalKey: string;
  payload: unknown;
}

export interface GameDataProvider {
  source: string;
  getSourceVersion(): string;
  listSupportedFolders(): string[];
  listNames(folder: string): string[];
  getObject(folder: string, name: string): unknown;
  dumpFolder(folder: string): GenshinDbDumpObject[];
}

type GenshinDbQueryFunction = (query: string, options?: Record<string, unknown>) => unknown;

function getFolderQuery(folder: string): GenshinDbQueryFunction | undefined {
  const candidate = (genshinDb as Record<string, unknown>)[folder];
  return typeof candidate === "function" ? (candidate as GenshinDbQueryFunction) : undefined;
}

export class GenshinDbProvider implements GameDataProvider {
  readonly source = GENSHIN_DB_SOURCE;

  constructor(
    private readonly folders: readonly string[] = DEFAULT_GENSHIN_DB_FOLDERS,
    private readonly warn: (message: string) => void = console.warn,
  ) {}

  getSourceVersion(): string {
    return genshinDbPackage.version;
  }

  listSupportedFolders(): string[] {
    return this.folders.filter((folder) => {
      const supported = getFolderQuery(folder) !== undefined;

      if (!supported) {
        this.warn(`Skipping unsupported genshin-db folder: ${folder}`);
      }

      return supported;
    });
  }

  listNames(folder: string): string[] {
    const query = getFolderQuery(folder);

    if (!query) {
      this.warn(`Skipping unsupported genshin-db folder: ${folder}`);
      return [];
    }

    try {
      const names = query("names", { matchCategories: true });
      return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : [];
    } catch (error) {
      this.warn(`Skipping genshin-db folder '${folder}' after name lookup failed: ${(error as Error).message}`);
      return [];
    }
  }

  getObject(folder: string, name: string): unknown {
    const query = getFolderQuery(folder);

    if (!query) {
      this.warn(`Skipping unsupported genshin-db folder: ${folder}`);
      return undefined;
    }

    try {
      return query(name, { matchNames: true });
    } catch (error) {
      this.warn(`Skipping genshin-db object '${folder}/${name}' after lookup failed: ${(error as Error).message}`);
      return undefined;
    }
  }

  dumpFolder(folder: string): GenshinDbDumpObject[] {
    const dumped: GenshinDbDumpObject[] = [];

    for (const name of this.listNames(folder)) {
      const raw = this.getObject(folder, name);

      if (raw === undefined || raw === null) {
        this.warn(`Skipping empty genshin-db object: ${folder}/${name}`);
        continue;
      }

      dumped.push({
        externalKey: name,
        raw,
      });
    }

    return dumped;
  }

  listObjects(): GenshinDbObject[] {
    return this.listSupportedFolders().flatMap((folder) =>
      this.dumpFolder(folder).map((object) => ({
        folder,
        externalKey: object.externalKey,
        payload: object.raw,
      })),
    );
  }
}
