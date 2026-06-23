import {
  CharacterRequirementService,
  type CharacterRequirementInput,
  type CharacterRequirementResult,
  type TalentLevels,
} from "../services/CharacterRequirementService.js";

interface CliOptions {
  input: CharacterRequirementInput;
  json: boolean;
}

function readNumber(args: string[], index: number, option: string): number {
  const value = Number(args[index + 1]);

  if (!Number.isFinite(value)) {
    throw new Error(`Missing or invalid number for ${option}`);
  }

  return value;
}

function setTalent(targetTalents: TalentLevels, track: keyof TalentLevels, value: number): void {
  targetTalents[track] = value;
}

function parseOptions(args: string[]): CliOptions {
  const input: Partial<CharacterRequirementInput> & { targetTalents: TalentLevels; currentTalents: TalentLevels } = {
    targetTalents: {},
    currentTalents: {},
  };
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--character") {
      input.characterKey = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--current-level") {
      input.currentLevel = readNumber(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--target-level") {
      input.targetLevel = readNumber(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--current-ascension-phase") {
      input.currentAscensionPhase = readNumber(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--target-ascension-phase") {
      input.targetAscensionPhase = readNumber(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--normal" || arg === "--skill" || arg === "--burst") {
      setTalent(input.targetTalents, arg.slice(2) as keyof TalentLevels, readNumber(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--current-normal" || arg === "--current-skill" || arg === "--current-burst") {
      setTalent(input.currentTalents, arg.replace("--current-", "") as keyof TalentLevels, readNumber(args, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!input.characterKey || input.currentLevel === undefined || input.targetLevel === undefined) {
    throw new Error("Usage: npm run requirements:character -- --character char_furina --current-level 20 --target-level 90 [--skill 9] [--burst 10] [--json]");
  }

  return {
    input: input as CharacterRequirementInput,
    json,
  };
}

function printReadable(result: CharacterRequirementResult): void {
  console.log(`${result.character.name} (${result.character.stableKey})`);
  console.log(`Ascension phases: ${result.ascension.includedPhases.join(", ") || "none"}`);
  console.log(
    `Talents: normal ${result.talents.normal.current}->${result.talents.normal.target}, skill ${result.talents.skill.current}->${result.talents.skill.target}, burst ${result.talents.burst.current}->${result.talents.burst.target}`,
  );
  console.log("Materials:");

  for (const material of result.materials) {
    console.log(`- ${material.name} (${material.stableKey}): ${material.quantity}`);
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");

    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

try {
  const { input, json } = parseOptions(process.argv.slice(2));
  const service = new CharacterRequirementService();

  service
    .calculate(input)
    .then((result) => {
      if (json) {
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
