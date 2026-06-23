import {
  GameDataNormalizationService,
  type NormalizeGameDataOptions,
} from "../services/GameDataNormalizationService.js";

function parseOptions(args: string[]): NormalizeGameDataOptions {
  const options: NormalizeGameDataOptions = {};
  const folders: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--folder") {
      const folder = args[index + 1];

      if (!folder) {
        throw new Error("Missing value for --folder");
      }

      folders.push(folder);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const limit = Number(args[index + 1]);

      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Missing or invalid positive integer for --limit");
      }

      options.limit = limit;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (folders.length > 0) {
    options.folders = folders;
  }

  return options;
}

try {
  const service = new GameDataNormalizationService();
  const options = parseOptions(process.argv.slice(2));

  service.normalize(options).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
