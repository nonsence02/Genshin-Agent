import { PlayerStateBuilder, type PlayerCharacterState, type PlayerStateResult } from "../services/PlayerStateBuilder.js";

interface CliOptions {
  playerKey?: string;
  characterKey?: string;
  includeArtifacts: boolean;
  json: boolean;
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    includeArtifacts: true,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-artifacts") {
      options.includeArtifacts = false;
    } else if (arg === "--player") {
      options.playerKey = readString(args, ++index, arg);
    } else if (arg === "--character") {
      options.characterKey = readString(args, ++index, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!options.playerKey) {
    throw new Error("Usage: npm run player:state -- --player default [--character char_furina] [--json]");
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

function printReadable(result: PlayerStateResult): void {
  console.log(`Player: ${result.player.stableKey}`);
  console.log(
    `Sources: GOOD characters ${result.sourceSummary.goodCharacters}, hoyolab characters ${result.sourceSummary.hoyolabCharacters}, weapons ${result.sourceSummary.weapons}, artifacts ${result.sourceSummary.artifacts}`,
  );

  for (const character of result.characters) {
    printCharacter(character);
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

function printCharacter(character: PlayerCharacterState): void {
  const name = character.character.name ?? character.character.stableKey ?? character.character.key;
  console.log(`${name} (${character.character.stableKey ?? character.character.key})`);
  console.log(`- level: ${character.level ?? "unknown"} [${character.sources.level ?? "unknown"}]`);
  console.log(`- ascension: ${character.ascension ?? "unknown"} [${character.sources.ascension ?? "unknown"}]`);
  console.log(`- constellation: ${character.constellation ?? "unknown"} [${character.sources.constellation ?? "unknown"}]`);
  console.log(
    `- talents: normal ${character.talents.normal ?? "unknown"} [${character.sources["talents.normal"] ?? "unknown"}], skill ${character.talents.skill ?? "unknown"} [${character.sources["talents.skill"] ?? "unknown"}], burst ${character.talents.burst ?? "unknown"} [${character.sources["talents.burst"] ?? "unknown"}]`,
  );
  console.log(
    `- weapon: ${character.equippedWeapon?.name ?? character.equippedWeapon?.stableKey ?? "none"} [${character.equippedWeapon?.source ?? "unknown"}]`,
  );
  console.log(`- artifacts: ${character.equippedArtifacts.length} ${character.equippedArtifacts.map((artifact) => artifact.slot).join(", ")}`);

  if (character.conflicts.length > 0) {
    console.log("- conflicts:");
    for (const conflict of character.conflicts) {
      console.log(`  - ${conflict.field}: chose ${conflict.chosenSource}`);
    }
  }

  if (character.warnings.length > 0) {
    console.log("- warnings:");
    for (const warning of character.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

try {
  const options = parseOptions(process.argv.slice(2));
  const builder = new PlayerStateBuilder();

  builder
    .build({
      playerKey: options.playerKey!,
      characterKey: options.characterKey,
      includeArtifacts: options.includeArtifacts,
    })
    .then((result) => {
      if (options.json) {
        console.log(JSON.stringify(options.characterKey ? result.characters[0] ?? result : result, null, 2));
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
