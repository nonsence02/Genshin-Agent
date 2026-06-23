import { InventoryImportService, type InventoryImportOptions, type InventoryImportResult } from "../services/InventoryImportService.js";

interface CliOptions extends InventoryImportOptions {
  json: boolean;
}

function parseOptions(args: string[]): CliOptions {
  const options: Partial<CliOptions> = {
    playerStableKey: "default",
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--file") {
      const filePath = args[index + 1];

      if (!filePath) {
        throw new Error("Missing value for --file");
      }

      options.filePath = filePath;
      index += 1;
      continue;
    }

    if (arg === "--player" || arg === "--player-id") {
      const playerStableKey = args[index + 1];

      if (!playerStableKey) {
        throw new Error(`Missing value for ${arg}`);
      }

      options.playerStableKey = playerStableKey;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.filePath) {
    throw new Error("Usage: npm run import:inventory -- --file ./data/inventory.good.json --player default [--dry-run] [--json]");
  }

  return options as CliOptions;
}

function printResult(result: InventoryImportResult): void {
  console.log(`Inventory import ${result.dryRun ? "dry-run" : "completed"}`);
  console.log(`Snapshot id: ${result.snapshotId ?? "dry-run"}`);
  console.log(`Source file hash: ${result.sourceFileHash}`);
  console.log(`Raw items parsed: ${result.totalRawItemsParsed}`);
  console.log(`Resolved material items: ${result.resolvedMaterialItems}`);
  console.log(`Unresolved items: ${result.unresolvedItems}`);
  console.log(`Skipped invalid items: ${result.skippedInvalidItems}`);
  console.log("Resolved examples:");

  for (const item of result.resolvedExamples) {
    console.log(`- ${item.rawName} -> ${item.materialKey ?? "unresolved"}: ${item.quantity}`);
  }

  console.log("Unresolved examples:");

  for (const item of result.unresolvedExamples) {
    console.log(`- ${item.rawName}: ${item.quantity}`);
  }
}

try {
  const { json, ...options } = parseOptions(process.argv.slice(2));
  const service = new InventoryImportService();

  service
    .importSnapshot(options)
    .then((result) => {
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printResult(result);
      }
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
