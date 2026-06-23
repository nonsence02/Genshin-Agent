import { access, readFile } from "node:fs/promises";
import { HoyolabProfileProvider } from "../../ingestion/providers/HoyolabProfileProvider.js";
import type { CharacterComparisonRecord, LoadedCharacterSource } from "./types.js";
import { normalizeCharacterKey, normalizeSourceKey } from "./normalize.js";

const DEFAULT_HOYOLAB_PROFILE_PATH = "data/raw/user_imports/hoyolab_profile.json";

export async function loadHoyolabProfile(
  filePath = DEFAULT_HOYOLAB_PROFILE_PATH,
  provider = new HoyolabProfileProvider(),
): Promise<LoadedCharacterSource> {
  try {
    await access(filePath);
  } catch {
    return {
      present: false,
      filePath,
      missingReason: "file missing",
      records: [],
      warnings: [`HoYoLAB profile file missing: ${filePath}`],
    };
  }

  try {
    const snapshot = await provider.readSnapshot(filePath);

    return {
      present: true,
      filePath,
      records: snapshot.characters.map((character): CharacterComparisonRecord => ({
        source: "hoyolabProfile",
        sourceKey: character.sourceCharacterKey,
        normalizedSourceKey: normalizeSourceKey(character.sourceCharacterKey),
        characterKey: normalizeCharacterKey(character.sourceCharacterKey),
        nameRu: character.nameRu,
        level: character.level,
        constellation: character.constellation,
        talentNormal: character.talents.normalAttack,
        talentSkill: character.talents.elementalSkill,
        talentBurst: character.talents.elementalBurst,
        equippedWeaponName: character.equippedWeapon?.name,
        equippedWeaponLevel: character.equippedWeapon?.level,
        equippedWeaponRefinement: character.equippedWeapon?.refinement,
        equippedWeaponRarity: character.equippedWeapon?.rarity,
        artifacts: character.equippedArtifacts.map((artifact) => ({
          slot: artifact.slot,
          name: artifact.name,
          setName: artifact.setName,
          level: artifact.level,
          rarity: artifact.rarity,
          mainStat: artifact.mainStat,
        })),
      })),
      warnings: snapshot.warnings,
    };
  } catch (error) {
    const raw = await readFile(filePath, "utf8").catch(() => "");
    return {
      present: false,
      filePath,
      missingReason: "parse failed",
      records: [],
      warnings: [`HoYoLAB profile parse failed: ${String(error)}`, `File bytes read: ${raw.length}`],
    };
  }
}
