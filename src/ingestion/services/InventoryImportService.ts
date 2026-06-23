import type { InventoryKameraProvider } from "../providers/InventoryKameraProvider.js";

export interface InventoryImportResult {
  snapshotId: number;
  itemCount: number;
}

export class InventoryImportService {
  constructor(private readonly provider: InventoryKameraProvider) {}

  async importSnapshot(playerStableKey: string, filePath: string): Promise<InventoryImportResult> {
    void playerStableKey;
    void filePath;
    void this.provider;
    throw new Error("Inventory import orchestration is not implemented yet.");
  }
}
