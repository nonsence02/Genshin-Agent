import { GenshinDbProvider } from "../providers/GenshinDbProvider.js";
import { GameDataImportService } from "../services/GameDataImportService.js";

const service = new GameDataImportService(new GenshinDbProvider());

service.importAll().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
