import { MaterialSourceService } from "../services/MaterialSourceService.js";

interface MaterialSourceCliOptions {
  material?: string;
  json?: boolean;
}

function parseOptions(args: string[]): MaterialSourceCliOptions {
  const options: MaterialSourceCliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    if (arg === "--material") {
      const material = args[index + 1];

      if (!material) {
        throw new Error("Missing value for --material");
      }

      options.material = material;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.material) {
    throw new Error("--material is required");
  }

  return options;
}

function printReadable(result: Awaited<ReturnType<MaterialSourceService["lookup"]>>): void {
  console.log(`Material: ${result.material.name} (${result.material.stableKey})`);

  if (result.sources.length === 0) {
    console.log("Sources: none");
  } else {
    console.log("Sources:");

    for (const source of result.sources) {
      const label = source.sourceName ?? source.sourceKey ?? "(unknown source)";
      const pieces = [`${source.sourceType}: ${label}`];

      if (source.days?.length) {
        pieces.push(`days=${source.days.join(",")}`);
      }

      if (source.resinCost !== undefined) {
        pieces.push(`resin=${source.resinCost}`);
      }

      if (source.notes) {
        pieces.push(`notes=${source.notes}`);
      }

      console.log(`- ${pieces.join(" | ")}`);
    }
  }

  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }
}

try {
  const options = parseOptions(process.argv.slice(2));
  const service = new MaterialSourceService();

  service
    .lookup({ materialKey: options.material, includeCalendar: true })
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
