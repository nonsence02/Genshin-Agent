import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { prisma } from "../../db/client.js";
import { buildComparisonReport } from "./comparisonReport.js";
import { loadGenshinPyOutput } from "./loadGenshinPyOutput.js";
import { loadHoyolabProfile } from "./loadHoyolabProfile.js";
import { loadPlayerCharacters } from "./loadPlayerCharacters.js";
import type { CharacterSourceComparisonReport } from "./types.js";

interface CliOptions {
  player: string;
  hoyolabProfile: string;
  genshinPy: string;
  json: boolean;
  out?: string;
  noWrite: boolean;
}

const DEFAULT_HOYOLAB_PROFILE_PATH = "data/raw/user_imports/hoyolab_profile.json";
const DEFAULT_GENSHIN_PY_PATH = "data/raw/genshin_py/latest.sanitized.json";

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    player: "default",
    hoyolabProfile: DEFAULT_HOYOLAB_PROFILE_PATH,
    genshinPy: DEFAULT_GENSHIN_PY_PATH,
    json: false,
    noWrite: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-write") {
      options.noWrite = true;
    } else if (arg === "--player") {
      options.player = readValue(args, ++index, arg);
    } else if (arg === "--hoyolab-profile") {
      options.hoyolabProfile = readValue(args, ++index, arg);
    } else if (arg === "--genshin-py") {
      options.genshinPy = readValue(args, ++index, arg);
    } else if (arg === "--out") {
      options.out = readValue(args, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readValue(args: string[], index: number, option: string): string {
  const value = args[index];

  if (!value) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function printReadable(report: CharacterSourceComparisonReport): void {
  console.log(`Player: ${report.player.stableKey}${report.player.id ? ` (#${report.player.id})` : ""}`);
  console.log("Source presence:");
  console.log(`- hoyolab_profile.json: ${report.sources.hoyolabProfile.present ? "yes" : "no"} (${report.sources.hoyolabProfile.characterCount})`);
  console.log(`- genshin.py output: ${report.sources.genshinPy.present ? "yes" : "no"} (${report.sources.genshinPy.characterCount})`);
  console.log(`- database PlayerCharacter: ${report.sources.database.present ? "yes" : "no"} (${report.sources.database.characterCount})`);
  console.log("Matching summary:");
  console.log(`- matched: ${report.summary.matchedCharacters}`);
  console.log(`- only in hoyolab_profile.json: ${report.summary.onlyInHoyolabProfile}`);
  console.log(`- only in genshin.py: ${report.summary.onlyInGenshinPy}`);
  console.log(`- only in database: ${report.summary.onlyInDatabase}`);
  console.log("Field coverage:");
  console.log(`- hoyolab_profile.json: ${compactCoverage(report.fieldCoverage.hoyolabProfile)}`);
  console.log(`- genshin.py: ${compactCoverage(report.fieldCoverage.genshinPy)}`);
  console.log(`- database: ${compactCoverage(report.fieldCoverage.database)}`);
  console.log("Top mismatches:");

  const mismatches = report.comparisons.flatMap((comparison) =>
    comparison.fields
      .filter((field) => field.status === "mismatch")
      .slice(0, 3)
      .map((field) => `${comparison.displayName ?? comparison.characterKey ?? "unknown"} ${field.field}`),
  );

  if (mismatches.length === 0) {
    console.log("- none");
  } else {
    for (const mismatch of mismatches.slice(0, 10)) {
      console.log(`- ${mismatch}`);
    }
  }

  console.log(`Verdict: ${report.verdict}`);

  for (const warning of report.warnings.slice(0, 20)) {
    console.warn(`Warning: ${warning}`);
  }
}

function compactCoverage(coverage: Record<string, boolean | number>): string {
  return [
    `level=${coverage.level ?? 0}`,
    `cons=${coverage.constellation ?? 0}`,
    `talents=${Number(coverage.talentNormal ?? 0)}/${Number(coverage.talentSkill ?? 0)}/${Number(coverage.talentBurst ?? 0)}`,
    `weapon=${coverage.equippedWeaponName ?? 0}`,
    `artifacts=${coverage.artifactCount ?? 0}`,
    `mainStats=${coverage.artifactMainStats ?? 0}`,
    `substats=${coverage.artifactSubstats ?? 0}`,
  ].join(", ");
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const [hoyolabProfile, genshinPy, database] = await Promise.all([
    loadHoyolabProfile(options.hoyolabProfile),
    loadGenshinPyOutput(options.genshinPy),
    loadPlayerCharacters(options.player),
  ]);
  const report = buildComparisonReport({
    playerStableKey: options.player,
    hoyolabProfile,
    genshinPy,
    database,
  });

  if (options.out && !options.noWrite) {
    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReadable(report);
    if (options.out) {
      console.log(`Output written: ${options.noWrite ? "no (--no-write)" : "yes"}`);
      console.log(`Output path: ${options.out}`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
