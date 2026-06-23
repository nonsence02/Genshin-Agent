import { InventoryDiffService, type CharacterInventoryDiffInput, type CharacterInventoryDiffResult } from "./InventoryDiffService.js";

export class CraftAwareInventoryDiffService {
  constructor(private readonly inventoryDiff = new InventoryDiffService()) {}

  diffCharacter(input: CharacterInventoryDiffInput): Promise<CharacterInventoryDiffResult> {
    return this.inventoryDiff.diffCharacter({
      ...input,
      useCrafting: true,
    });
  }
}
