import { InventoryKameraProvider } from "../providers/InventoryKameraProvider.js";
import { InventoryImportService } from "../services/InventoryImportService.js";

const [, , playerStableKey, filePath] = process.argv;

if (!playerStableKey || !filePath) {
  console.error("Usage: npm run import:inventory -- <playerStableKey> <good-json-path>");
  process.exitCode = 1;
} else {
  const service = new InventoryImportService(new InventoryKameraProvider());

  service.importSnapshot(playerStableKey, filePath).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
