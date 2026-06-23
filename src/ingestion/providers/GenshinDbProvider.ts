export interface GenshinDbObject {
  folder: string;
  externalKey: string;
  payload: unknown;
}

export interface GameDataProvider {
  source: string;
  sourceVersion(): Promise<string>;
  listObjects(): Promise<GenshinDbObject[]>;
}

export class GenshinDbProvider implements GameDataProvider {
  readonly source = "genshin-db";

  async sourceVersion(): Promise<string> {
    return "unknown";
  }

  async listObjects(): Promise<GenshinDbObject[]> {
    throw new Error("genshin-db import is not implemented yet.");
  }
}
