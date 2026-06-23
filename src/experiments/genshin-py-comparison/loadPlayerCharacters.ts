import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import type { CharacterComparisonRecord, DatabaseCharacterSource } from "./types.js";
import { asRecord, normalizeCharacterKey, normalizeSourceKey } from "./normalize.js";

export async function loadPlayerCharacters(
  playerStableKey: string,
  client: PrismaClient = prisma,
): Promise<DatabaseCharacterSource> {
  const player = await client.player.findUnique({
    where: { stableKey: playerStableKey },
    select: {
      id: true,
      stableKey: true,
      characters: {
        orderBy: [{ sourceCharacterKey: "asc" }, { importedAt: "desc" }],
        include: {
          character: {
            select: {
              stableKey: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!player) {
    return {
      present: false,
      records: [],
      warnings: [`Player not found in database: ${playerStableKey}`],
    };
  }

  return {
    present: true,
    player: {
      id: player.id,
      stableKey: player.stableKey,
    },
    records: player.characters.map((character): CharacterComparisonRecord => {
      const rawPayload = asRecord(character.rawPayload);
      const artifacts = Array.isArray(rawPayload.equippedArtifacts) ? rawPayload.equippedArtifacts : [];

      return {
        source: "database",
        sourceKey: character.sourceCharacterKey ?? undefined,
        normalizedSourceKey: normalizeSourceKey(character.sourceCharacterKey),
        characterKey: normalizeCharacterKey(character.sourceCharacterKey),
        resolvedCharacterKey: character.character?.stableKey,
        name: character.character?.name ?? character.name ?? undefined,
        nameRu: character.nameRu ?? undefined,
        level: character.level ?? undefined,
        ascension: character.ascension ?? undefined,
        constellation: character.constellation ?? undefined,
        talentNormal: character.talentNormal ?? undefined,
        talentSkill: character.talentSkill ?? undefined,
        talentBurst: character.talentBurst ?? undefined,
        equippedWeaponName: character.equippedWeaponName ?? undefined,
        equippedWeaponLevel: character.equippedWeaponLevel ?? undefined,
        equippedWeaponRefinement: character.equippedWeaponRefinement ?? undefined,
        artifacts: artifacts.map((artifact) => {
          const item = asRecord(artifact);
          return {
            slot: typeof item.slot === "string" ? item.slot : undefined,
            name: typeof item.name === "string" ? item.name : undefined,
            setName: typeof item.setName === "string" ? item.setName : undefined,
            level: typeof item.level === "number" ? item.level : undefined,
            rarity: typeof item.rarity === "number" ? item.rarity : undefined,
            mainStat: typeof item.mainStat === "string" ? item.mainStat : undefined,
          };
        }),
      };
    }),
    warnings: [],
  };
}
