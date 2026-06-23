export interface InventoryKameraSnapshot {
  capturedAt: Date;
  sourceVersion?: string;
  rawPayload: unknown;
}

export class InventoryKameraProvider {
  async readSnapshot(filePath: string): Promise<InventoryKameraSnapshot> {
    void filePath;
    throw new Error("Inventory Kamera GOOD JSON import is not implemented yet.");
  }
}
