import type { GameDataProvider } from "../providers/GenshinDbProvider.js";

export interface GameDataImportResult {
  importRunId: number;
  rawObjectCount: number;
}

export class GameDataImportService {
  constructor(private readonly provider: GameDataProvider) {}

  async importAll(): Promise<GameDataImportResult> {
    void this.provider;
    throw new Error("Game data import orchestration is not implemented yet.");
  }
}
