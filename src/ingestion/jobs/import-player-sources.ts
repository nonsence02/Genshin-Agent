import { PlayerSourceImportService, type PlayerSourceImportOptions, type PlayerSourceImportResult } from "../services/PlayerSourceImportService.js";

interface CliOptions extends PlayerSourceImportOptions {
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

    if (arg === "--player") {
      options.playerStableKey = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--good") {
      options.goodFile = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--weapons") {
      options.weaponsFile = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--hoyolab") {
      options.hoyolabFile = args[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.goodFile && !options.weaponsFile && !options.hoyolabFile) {
    throw new Error("Provide at least one of --good, --weapons, or --hoyolab");
  }

  return options as CliOptions;
}

function printReport(result: PlayerSourceImportResult): void {
  console.log(`Player: ${result.player.stableKey} (${result.player.id ?? "dry-run"})`);
  console.log(`Dry-run: ${result.dryRun ? "yes" : "no"}`);
  console.log(`Source files processed: ${result.sourceFilesProcessed.join(", ") || "none"}`);
  console.log(`Material/items parsed/resolved/unresolved: ${result.materialsParsed}/${result.materialsResolved}/${result.materialsUnresolved}`);
  console.log(`Weapons parsed/resolved/unresolved: ${result.weaponsParsed}/${result.weaponsResolved}/${result.weaponsUnresolved}`);
  console.log(
    `HoYoLAB characters parsed/resolved/unresolved: ${result.hoyolabCharactersParsed}/${result.hoyolabCharactersResolved}/${result.hoyolabCharactersUnresolved}`,
  );
  console.log(`Warnings: ${result.warnings.length}`);
  for (const warning of result.warnings.slice(0, 20)) {
    console.log(`- ${warning}`);
  }
  console.log("Resolved materials:");
  for (const item of result.examples.resolvedMaterials.slice(0, 10)) {
    console.log(`- ${item.rawName} -> ${item.materialKey ?? "unresolved"}: ${item.quantity}`);
  }
  console.log("Unresolved materials:");
  for (const item of result.examples.unresolvedMaterials.slice(0, 10)) {
    console.log(`- ${item.rawName}: ${item.quantity}`);
  }
  console.log("Weapons:");
  for (const weapon of result.examples.weapons.slice(0, 10)) {
    console.log(`- ${weapon.key} level=${weapon.level ?? "?"} location=${weapon.location ?? ""} resolved=${weapon.resolved}`);
  }
  console.log("HoYoLAB characters:");
  for (const character of result.examples.characters.slice(0, 10)) {
    console.log(
      `- ${character.sourceCharacterKey} -> ${character.characterKey ?? "unresolved"} level=${character.level ?? "?"} resolved=${character.resolved}`,
    );
  }
}

try {
  const { json, ...options } = parseOptions(process.argv.slice(2));
  const service = new PlayerSourceImportService();

  service
    .importSources(options)
    .then((result) => {
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printReport(result);
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
