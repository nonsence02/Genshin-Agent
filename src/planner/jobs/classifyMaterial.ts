import { MaterialDemandClassifier, type ClassifiedMaterialDemand } from "../services/MaterialDemandClassifier.js";
import { MaterialSourceService } from "../services/MaterialSourceService.js";

interface CliOptions {
  material?: string;
  json: boolean;
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = { json: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--material") {
      options.material = args[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.material) {
    throw new Error("--material is required");
  }

  return options;
}

function printReadable(result: ClassifiedMaterialDemand): void {
  console.log(`Material: ${result.name} (${result.stableKey})`);
  console.log(`Source types: ${result.sourceTypes.join(", ") || "none"}`);
  console.log(`Primary source: ${result.primarySourceType ?? "none"}`);
  console.log(`Resin gated: ${result.resinGated ? "yes" : "no"}`);
  console.log(`Resin cost per run: ${result.resinCostPerRun ?? "dynamic/none"}`);
  console.log(`Weekly boss: ${result.weeklyBoss ? "yes" : "no"}`);
  console.log(`Open world: ${result.openWorld ? "yes" : "no"}`);
  console.log(`Calendar days: ${result.calendarDays.join(", ") || "none"}`);

  if (result.notes.length > 0) {
    console.log("Notes:");
    for (const note of result.notes.slice(0, 10)) {
      console.log(`- ${note}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

try {
  const options = parseOptions(process.argv.slice(2));
  const sources = new MaterialSourceService();
  const classifier = new MaterialDemandClassifier();

  sources
    .lookup({ materialKey: options.material, includeCalendar: true })
    .then((lookup) =>
      classifier.classify({
        material: {
          materialId: lookup.material.id,
          stableKey: lookup.material.stableKey,
          name: lookup.material.name,
        },
        sourceLookup: lookup,
      }),
    )
    .then((result) => {
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printReadable(result);
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
