import { EffectiveInventoryService } from "../services/EffectiveInventoryService.js";
import { ManualInventoryOverrideService, type ManualInventoryOverrideMode } from "../services/ManualInventoryOverrideService.js";

interface CliOptions {
  playerKey?: string;
  materialKey?: string;
  mode?: ManualInventoryOverrideMode;
  quantity?: number;
  reason?: string;
  list: boolean;
  effective: boolean;
  delete: boolean;
  clear: boolean;
  json: boolean;
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    list: false,
    effective: false,
    delete: false,
    clear: false,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--list") {
      options.list = true;
    } else if (arg === "--effective") {
      options.effective = true;
    } else if (arg === "--delete") {
      options.delete = true;
    } else if (arg === "--clear") {
      options.clear = true;
    } else if (arg === "--player") {
      options.playerKey = readString(args, ++index, arg);
    } else if (arg === "--material") {
      options.materialKey = readString(args, ++index, arg);
    } else if (arg === "--mode") {
      options.mode = readMode(args, ++index, arg);
    } else if (arg === "--quantity") {
      options.quantity = readNumber(args, ++index, arg);
    } else if (arg === "--reason") {
      options.reason = readString(args, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.playerKey) {
    throw new Error("--player is required");
  }

  return options;
}

function readString(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function readNumber(args: string[], index: number, option: string): number {
  const value = Number(args[index]);
  if (!Number.isInteger(value)) {
    throw new Error(`${option} requires an integer`);
  }
  return value;
}

function readMode(args: string[], index: number, option: string): ManualInventoryOverrideMode {
  const value = readString(args, index, option);
  if (value !== "absolute" && value !== "delta") {
    throw new Error("--mode must be absolute or delta");
  }
  return value;
}

async function run(options: CliOptions): Promise<unknown> {
  const overrides = new ManualInventoryOverrideService();

  if (options.effective) {
    return new EffectiveInventoryService().resolve({ playerKey: options.playerKey! });
  }

  if (options.list) {
    return overrides.listOverrides(options.playerKey!);
  }

  if (options.clear) {
    return overrides.clearOverrides(options.playerKey!);
  }

  if (options.delete) {
    if (!options.materialKey) {
      throw new Error("--material is required with --delete");
    }
    return overrides.deactivateOverride(options.playerKey!, options.materialKey);
  }

  if (!options.materialKey || !options.mode || options.quantity === undefined) {
    throw new Error(
      'Usage: npm run inventory:overrides -- --player default --material mat_heros_wit --mode absolute --quantity 40 --reason "manual correction"',
    );
  }

  return overrides.upsertOverride(options.playerKey!, options.materialKey, {
    mode: options.mode,
    quantity: options.quantity,
    reason: options.reason,
  });
}

function printReadable(result: unknown): void {
  if (Array.isArray(result)) {
    if (result.length === 0) {
      console.log("No manual inventory overrides.");
      return;
    }

    for (const override of result as Array<{ material: { stableKey: string; name: string }; mode: string; quantity: number; active: boolean; reason?: string }>) {
      console.log(
        `- ${override.material.name} (${override.material.stableKey}): ${override.mode} ${override.quantity}; active=${override.active}${override.reason ? `; reason=${override.reason}` : ""}`,
      );
    }
    return;
  }

  if (isEffectiveInventory(result)) {
    console.log(`Player: ${result.player.stableKey}`);
    console.log(`Inventory snapshot: #${result.snapshot.id} ${result.snapshot.source} ${result.snapshot.createdAt}`);
    console.log(`Manual overrides applied: ${result.overridesApplied}`);
    for (const item of result.items.filter((entry) => entry.overrideActive)) {
      console.log(
        `- ${item.name} (${item.stableKey}): snapshot ${item.snapshotQuantity}, override ${item.overrideMode} ${item.overrideQuantity}, effective ${item.effectiveQuantity}`,
      );
    }
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

function isEffectiveInventory(value: unknown): value is Awaited<ReturnType<EffectiveInventoryService["resolve"]>> {
  return typeof value === "object" && value !== null && "items" in value && "overridesApplied" in value;
}

try {
  const options = parseOptions(process.argv.slice(2));
  run(options)
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
