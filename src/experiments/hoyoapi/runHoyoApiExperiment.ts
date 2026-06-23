import { getHoyoApiConfigDiagnostic, runHoyoApiExperiment } from "./HoyoApiExperimentClient.js";
import { sanitizeHoyoApiOutput } from "./sanitizeHoyoApiOutput.js";
import { writeHoyoApiOutput, type HoyoApiOutputWriteResult } from "./writeHoyoApiOutput.js";

interface CliOptions {
  json: boolean;
  out?: string;
  noWrite: boolean;
  claimDaily: boolean;
  yes: boolean;
  printConfig: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.printConfig) {
    console.log(JSON.stringify(getHoyoApiConfigDiagnostic(), null, 2));
    return;
  }

  if (options.claimDaily && !options.yes) {
    throw new Error("Refusing to claim daily rewards without --yes. Pass both --claim-daily and --yes.");
  }

  if (options.claimDaily) {
    console.warn("WARNING: --claim-daily will call hoyoapi daily.claim().");
  }

  const report = await runHoyoApiExperiment({
    claimDaily: options.claimDaily,
    yes: options.yes,
  });
  const sanitized = sanitizeHoyoApiOutput(report);
  const outputWrite = writeHoyoApiOutput(report, options);

  if (options.json) {
    console.log(JSON.stringify(sanitized, null, 2));
    return;
  }

  printSummary(report, options, outputWrite);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    json: false,
    noWrite: false,
    claimDaily: false,
    yes: false,
    printConfig: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-write") {
      options.noWrite = true;
    } else if (arg === "--claim-daily") {
      options.claimDaily = true;
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "--print-config") {
      options.printConfig = true;
    } else if (arg === "--out") {
      const out = args[index + 1];

      if (!out) {
        throw new Error("--out requires a path.");
      }

      options.out = out;
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printSummary(
  report: Awaited<ReturnType<typeof runHoyoApiExperiment>>,
  options: CliOptions,
  outputWrite: HoyoApiOutputWriteResult,
): void {
  const summary = report.summary;

  console.log("hoyoapi experiment summary");
  console.log(`setup mode: ${report.setupMode}`);
  console.log(`initialization strategy: ${report.initializationStrategy}`);
  console.log(`attempted init strategies: ${report.attemptedInitStrategies.join(", ")}`);
  console.log(`hoyolab.gamesList endpoint: ${summary.hoyolabGamesListEndpoint}`);
  console.log(`hoyolab.gamesList genshin endpoint: ${summary.hoyolabGamesListGenshinEndpoint}`);
  console.log(`game accounts count: ${summary.gameAccountsCount}`);
  console.log(`selected account uid present: ${yesNo(summary.selectedAccountUidPresent)}`);
  console.log(`selected account region/server present: ${yesNo(summary.selectedAccountRegionPresent)}`);
  console.log(`selected account level present: ${yesNo(summary.selectedAccountLevelPresent)}`);
  console.log(`selected uid: ${summary.selectedUid ?? "missing"}`);
  console.log(`selected region/server: ${summary.selectedRegion ?? "missing"}`);
  console.log(`records endpoint: ${summary.recordsEndpoint}`);
  console.log(`characters endpoint: ${summary.charactersEndpoint}`);
  console.log(`characters count: ${summary.charactersCount}`);
  console.log(`character ids extracted: ${summary.characterIdsExtracted.length}`);
  console.log(`charactersSummary endpoint: ${summary.charactersSummaryEndpoint}`);
  console.log(`charactersSummary count: ${summary.charactersSummaryCount}`);
  console.log(`dailyNote endpoint: ${summary.dailyNoteEndpoint}`);
  console.log(`dailyInfo endpoint: ${summary.dailyInfoEndpoint}`);
  console.log(`dailyRewards endpoint: ${summary.dailyRewardsEndpoint}`);
  console.log(`dailyReward endpoint: ${summary.dailyRewardEndpoint}`);
  console.log(`daily claim called: ${summary.dailyClaimCalled ? "yes" : "no"}`);
  console.log("character field coverage:");
  console.log(`  level: ${yesNo(summary.characterFieldCoverage.level)}`);
  console.log(`  rarity: ${yesNo(summary.characterFieldCoverage.rarity)}`);
  console.log(`  constellation: ${yesNo(summary.characterFieldCoverage.constellation)}`);
  console.log(`  talents: ${yesNo(summary.characterFieldCoverage.talents)}`);
  console.log(`  equipped weapon: ${yesNo(summary.characterFieldCoverage.equippedWeapon)}`);
  console.log(`  equipped artifacts: ${yesNo(summary.characterFieldCoverage.equippedArtifacts)}`);
  console.log(`  artifact set: ${yesNo(summary.characterFieldCoverage.artifactSet)}`);
  console.log(`  artifact slot: ${yesNo(summary.characterFieldCoverage.artifactSlot)}`);
  console.log(`  artifact level: ${yesNo(summary.characterFieldCoverage.artifactLevel)}`);
  console.log(`  artifact rarity: ${yesNo(summary.characterFieldCoverage.artifactRarity)}`);
  console.log(`  artifact main stat: ${yesNo(summary.characterFieldCoverage.artifactMainStat)}`);
  console.log(`  artifact substats: ${yesNo(summary.characterFieldCoverage.artifactSubstats)}`);
  console.log(`coverage verdict: ${summary.coverageVerdict}`);
  console.log("comparison:");
  console.log("  hoyolab_profile.json: character level, constellation, talent levels, weapon summary, weak artifact info");
  console.log("  Inventory Kamera: materials, weapons, artifacts/items depending on source, no live HoYoLAB data");

  console.log(`sanitized output written: ${yesNo(outputWrite.written)}`);
  console.log(`sanitized output path: ${outputWrite.path ?? options.out ?? "not requested"}`);
  console.log(`sanitized output ignored by git: ${outputWrite.ignoredByGit === undefined ? "unknown" : yesNo(outputWrite.ignoredByGit)}`);
  if (outputWrite.reason) console.log(`sanitized output reason: ${outputWrite.reason}`);

  for (const warning of summary.warnings) {
    console.warn(`warning: ${warning}`);
  }
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`hoyoapi experiment failed: ${message}`);
  process.exitCode = 1;
});
