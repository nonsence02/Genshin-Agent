export interface InventoryDiffInput {
  snapshotId: number;
  requiredMaterials: Array<{
    materialStableKey: string;
    quantity: number;
  }>;
}

export interface InventoryDiffResult {
  missingMaterials: Array<{
    materialStableKey: string;
    required: number;
    owned: number;
    missing: number;
  }>;
}

export class InventoryDiffService {
  async diff(input: InventoryDiffInput): Promise<InventoryDiffResult> {
    void input;
    throw new Error("Inventory diff calculation is not implemented yet.");
  }
}
