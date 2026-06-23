import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { normalizeSearchText, prefixedStableKey } from "../../ingestion/normalizers/normalizeKey.js";
import {
  chooseByPriority,
  PLAYER_STATE_PRIORITY,
  PLAYER_STATE_SOURCES,
  type SourceConflict,
} from "../sourcePriority.js";

export interface PlayerCharacterState {
  character: {
    id?: number;
    stableKey?: string;
    key: string;
    name?: string;
  };
  level?: number;
  ascension?: number;
  constellation?: number;
  talents: {
    normal?: number;
    skill?: number;
    burst?: number;
  };
  equippedWeapon?: {
    name?: string;
    stableKey?: string;
    level?: number;
    refinement?: number;
    rarity?: number;
    source: string;
  };
  equippedArtifacts: PlayerArtifactState[];
  sources: Record<string, string>;
  conflicts: SourceConflict[];
  warnings: string[];
}

export interface PlayerArtifactState {
  name?: string;
  setKey?: string;
  setName?: string;
  slot: string;
  level?: number;
  rarity?: number;
  mainStatKey?: string;
  substats?: Array<{
    key?: string;
    value?: number;
  }>;
  source: string;
  confidence: "high" | "medium" | "low";
}

export interface PlayerStateResult {
  player: {
    id: number;
    stableKey: string;
  };
  characters: PlayerCharacterState[];
  sourceSummary: {
    goodCharacters: number;
    hoyolabCharacters: number;
    weapons: number;
    artifacts: number;
  };
  warnings: string[];
}

export interface BuildPlayerStateOptions {
  playerKey: string;
  characterKey?: string;
  includeArtifacts?: boolean;
}

interface PlayerStateRepository {
  loadPlayerStateData(playerKey: string): Promise<PlayerStateData | null>;
}

interface PlayerStateData {
  player: { id: number; stableKey: string };
  characters: DbPlayerCharacter[];
  weapons: DbPlayerWeapon[];
  latestGoodSnapshot: { rawPayload: unknown } | null;
  knownCharacters: CharacterResolutionEntry[];
}

interface DbPlayerCharacter {
  id: number;
  source: string | null;
  sourceCharacterKey: string | null;
  name: string | null;
  level: number | null;
  ascension: number | null;
  constellation: number | null;
  talentNormal: number | null;
  talentSkill: number | null;
  talentBurst: number | null;
  equippedWeaponName: string | null;
  equippedWeaponLevel: number | null;
  equippedWeaponRefinement: number | null;
  rawPayload: unknown;
  character: {
    id: number;
    stableKey: string;
    name: string;
  } | null;
}

interface DbPlayerWeapon {
  source: string | null;
  sourceWeaponKey: string | null;
  level: number | null;
  refinement: number | null;
  location: string | null;
  rawPayload: unknown;
  weapon: {
    stableKey: string;
    name: string;
    rarity: number | null;
  } | null;
}

interface CharacterResolutionEntry {
  id: number;
  stableKey: string;
  name: string;
  aliases: Array<{
    alias: string;
    normalized: string;
  }>;
}

interface GoodArtifactPayload {
  key?: string;
  setKey?: string;
  slot?: string;
  level?: number;
  rarity?: number;
  location?: string;
  mainStatKey?: string;
  substats?: unknown[];
  sourcePayload?: unknown;
}

export class PrismaPlayerStateRepository implements PlayerStateRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async loadPlayerStateData(playerKey: string): Promise<PlayerStateData | null> {
    const player = await this.client.player.findUnique({
      where: { stableKey: playerKey },
      select: { id: true, stableKey: true },
    });

    if (!player) {
      return null;
    }

    const [characters, weapons, latestGoodSnapshot, knownCharacters] = await Promise.all([
      this.client.playerCharacter.findMany({
        where: { playerId: player.id },
        orderBy: [{ importedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          source: true,
          sourceCharacterKey: true,
          name: true,
          level: true,
          ascension: true,
          constellation: true,
          talentNormal: true,
          talentSkill: true,
          talentBurst: true,
          equippedWeaponName: true,
          equippedWeaponLevel: true,
          equippedWeaponRefinement: true,
          rawPayload: true,
          character: { select: { id: true, stableKey: true, name: true } },
        },
      }),
      this.client.playerWeapon.findMany({
        where: { playerId: player.id },
        orderBy: [{ importedAt: "desc" }, { id: "desc" }],
        select: {
          source: true,
          sourceWeaponKey: true,
          level: true,
          refinement: true,
          location: true,
          rawPayload: true,
          weapon: { select: { stableKey: true, name: true, rarity: true } },
        },
      }),
      this.client.inventorySnapshot.findFirst({
        where: { playerId: player.id, source: PLAYER_STATE_SOURCES.good },
        orderBy: [{ capturedAt: "desc" }, { importedAt: "desc" }, { id: "desc" }],
        select: { rawPayload: true },
      }),
      this.client.character.findMany({
        select: {
          id: true,
          stableKey: true,
          name: true,
          aliases: {
            where: { entityType: "character" },
            select: { alias: true, normalized: true },
          },
        },
      }),
    ]);

    return { player, characters, weapons, latestGoodSnapshot, knownCharacters };
  }
}

export class PlayerStateBuilder {
  constructor(private readonly repository: PlayerStateRepository = new PrismaPlayerStateRepository()) {}

  async build(options: BuildPlayerStateOptions): Promise<PlayerStateResult> {
    const data = await this.repository.loadPlayerStateData(options.playerKey);
    if (!data) {
      throw new Error(`Player not found: ${options.playerKey}`);
    }

    const resolver = new CharacterResolver(data.knownCharacters);
    const artifacts = readGoodArtifacts(data.latestGoodSnapshot?.rawPayload);
    const grouped = groupCharacters(data.characters, resolver);
    const warnings: string[] = [];
    const states = [...grouped.entries()]
      .map(([stableKey, rows]) => this.buildCharacterState(stableKey, rows, data.weapons, artifacts, options.includeArtifacts !== false))
      .sort((left, right) => (left.character.stableKey ?? left.character.key).localeCompare(right.character.stableKey ?? right.character.key));

    for (const unresolved of data.characters.filter((character) => !character.character && character.sourceCharacterKey)) {
      warnings.push(`Unresolved player character ${unresolved.sourceCharacterKey} from ${unresolved.source ?? "unknown source"}`);
    }

    const filtered = options.characterKey
      ? states.filter((state) => state.character.stableKey === options.characterKey || state.character.key === options.characterKey)
      : states;

    if (options.characterKey && filtered.length === 0) {
      warnings.push(`No merged player state found for ${options.characterKey}`);
    }

    return {
      player: data.player,
      characters: filtered,
      sourceSummary: {
        goodCharacters: data.characters.filter((character) => canonicalSource(character.source) === PLAYER_STATE_SOURCES.good).length,
        hoyolabCharacters: data.characters.filter((character) => canonicalSource(character.source) === PLAYER_STATE_SOURCES.hoyolab).length,
        weapons: data.weapons.length,
        artifacts: artifacts.length,
      },
      warnings,
    };
  }

  async getCharacterState(options: BuildPlayerStateOptions & { characterKey: string }): Promise<PlayerCharacterState> {
    const result = await this.build(options);
    const state = result.characters[0];

    if (!state) {
      throw new Error(`No merged player state found for ${options.characterKey}`);
    }

    return state;
  }

  private buildCharacterState(
    stableKey: string,
    rows: DbPlayerCharacter[],
    weapons: DbPlayerWeapon[],
    artifacts: GoodArtifactPayload[],
    includeArtifacts: boolean,
  ): PlayerCharacterState {
    const sources: Record<string, string> = {};
    const conflicts: SourceConflict[] = [];
    const warnings: string[] = [];
    const normalizedRows = rows.map((row) => ({ row, source: canonicalSource(row.source) }));
    const primary = rows.find((row) => row.character) ?? rows[0];

    const level = chooseByPriority(
      "level",
      normalizedRows.map(({ row, source }) => ({ source, value: row.level })),
      PLAYER_STATE_PRIORITY.level,
    );
    const ascension = chooseByPriority(
      "ascension",
      normalizedRows.map(({ row, source }) => ({ source, value: row.ascension })),
      PLAYER_STATE_PRIORITY.ascension,
    );
    const constellation = chooseByPriority(
      "constellation",
      normalizedRows.map(({ row, source }) => ({ source, value: row.constellation })),
      PLAYER_STATE_PRIORITY.constellation,
    );
    const talents = {
      normal: chooseByPriority(
        "talents.normal",
        normalizedRows.map(({ row, source }) => ({ source, value: row.talentNormal })),
        PLAYER_STATE_PRIORITY.talents,
      ),
      skill: chooseByPriority(
        "talents.skill",
        normalizedRows.map(({ row, source }) => ({ source, value: row.talentSkill })),
        PLAYER_STATE_PRIORITY.talents,
      ),
      burst: chooseByPriority(
        "talents.burst",
        normalizedRows.map(({ row, source }) => ({ source, value: row.talentBurst })),
        PLAYER_STATE_PRIORITY.talents,
      ),
    };

    collectChoice("level", level, sources, conflicts);
    collectChoice("ascension", ascension, sources, conflicts);
    collectChoice("constellation", constellation, sources, conflicts);
    collectChoice("talents.normal", talents.normal, sources, conflicts);
    collectChoice("talents.skill", talents.skill, sources, conflicts);
    collectChoice("talents.burst", talents.burst, sources, conflicts);

    if (ascension.value === undefined) {
      warnings.push(`Ascension phase is missing for ${stableKey}`);
    }

    const equippedWeapon = resolveEquippedWeapon(stableKey, rows, weapons, sources, conflicts);
    const equippedArtifacts = includeArtifacts ? resolveArtifacts(stableKey, rows, artifacts) : [];
    if (includeArtifacts && equippedArtifacts.length === 0) {
      const lowConfidence = readHoyolabArtifacts(rows);
      equippedArtifacts.push(...lowConfidence);
    }
    if (equippedArtifacts.length > 0) {
      sources.equippedArtifacts = equippedArtifacts[0]?.source ?? PLAYER_STATE_SOURCES.good;
    }

    return {
      character: {
        id: primary?.character?.id,
        stableKey: primary?.character?.stableKey ?? stableKey,
        key: primary?.sourceCharacterKey ?? stableKey,
        name: primary?.character?.name ?? primary?.name ?? stableKey,
      },
      level: level.value,
      ascension: ascension.value,
      constellation: constellation.value,
      talents: {
        normal: talents.normal.value,
        skill: talents.skill.value,
        burst: talents.burst.value,
      },
      equippedWeapon,
      equippedArtifacts,
      sources,
      conflicts,
      warnings,
    };
  }
}

function collectChoice<T>(
  field: string,
  choice: { value?: T; source?: string; conflict?: SourceConflict },
  sources: Record<string, string>,
  conflicts: SourceConflict[],
): void {
  if (choice.source) {
    sources[field] = choice.source;
  }
  if (choice.conflict) {
    conflicts.push(choice.conflict);
  }
}

function groupCharacters(
  rows: DbPlayerCharacter[],
  resolver: CharacterResolver,
): Map<string, DbPlayerCharacter[]> {
  const grouped = new Map<string, DbPlayerCharacter[]>();

  for (const row of rows) {
    const stableKey = row.character?.stableKey ?? resolver.resolve(row.sourceCharacterKey ?? row.name ?? "")?.stableKey;
    if (!stableKey) {
      continue;
    }
    const existing = grouped.get(stableKey) ?? [];
    existing.push(row);
    grouped.set(stableKey, existing);
  }

  return grouped;
}

function resolveEquippedWeapon(
  stableKey: string,
  rows: DbPlayerCharacter[],
  weapons: DbPlayerWeapon[],
  sources: Record<string, string>,
  conflicts: SourceConflict[],
): PlayerCharacterState["equippedWeapon"] {
  const hoyolab = rows.find((row) => canonicalSource(row.source) === PLAYER_STATE_SOURCES.hoyolab && row.equippedWeaponName);
  const weaponMatch = weapons.find((weapon) => weapon.location && locationMatchesCharacter(weapon.location, stableKey, rows));
  const chosen = chooseByPriority(
    "equippedWeapon",
    [
      {
        source: PLAYER_STATE_SOURCES.hoyolab,
        value: hoyolab
          ? {
              name: hoyolab.equippedWeaponName ?? undefined,
              level: hoyolab.equippedWeaponLevel ?? undefined,
              refinement: hoyolab.equippedWeaponRefinement ?? undefined,
              source: PLAYER_STATE_SOURCES.hoyolab,
            }
          : undefined,
      },
      {
        source: PLAYER_STATE_SOURCES.weapons,
        value: weaponMatch
          ? {
              name: weaponMatch.weapon?.name ?? weaponMatch.sourceWeaponKey ?? undefined,
              stableKey: weaponMatch.weapon?.stableKey,
              level: weaponMatch.level ?? undefined,
              refinement: weaponMatch.refinement ?? undefined,
              rarity: weaponMatch.weapon?.rarity ?? undefined,
              source: PLAYER_STATE_SOURCES.weapons,
            }
          : undefined,
      },
    ],
    PLAYER_STATE_PRIORITY.equippedWeapon,
  );

  collectChoice("equippedWeapon", chosen, sources, conflicts);
  return chosen.value;
}

function resolveArtifacts(stableKey: string, rows: DbPlayerCharacter[], artifacts: GoodArtifactPayload[]): PlayerArtifactState[] {
  return artifacts
    .filter((artifact) => artifact.location && locationMatchesCharacter(artifact.location, stableKey, rows))
    .map((artifact) => ({
      name: readString(readRecord(artifact.sourcePayload).name),
      setKey: artifact.setKey,
      setName: readString(readRecord(artifact.sourcePayload).setName),
      slot: artifact.slot ?? "unknown",
      level: artifact.level,
      rarity: artifact.rarity,
      mainStatKey: artifact.mainStatKey,
      substats: readSubstats(artifact.substats),
      source: PLAYER_STATE_SOURCES.good,
      confidence: "high",
    }));
}

function readHoyolabArtifacts(rows: DbPlayerCharacter[]): PlayerArtifactState[] {
  const row = rows.find((candidate) => canonicalSource(candidate.source) === PLAYER_STATE_SOURCES.hoyolab);
  const rawPayload = readRecord(row?.rawPayload);
  const artifacts = Array.isArray(rawPayload.equippedArtifacts) ? rawPayload.equippedArtifacts : [];

  return artifacts.map((artifact) => {
    const record = readRecord(artifact);
    return {
      name: readString(record.name),
      setName: readString(record.setName),
      slot: readString(record.slot) ?? readString(record.pos) ?? "unknown",
      level: readNumber(record.level),
      rarity: readNumber(record.rarity),
      source: PLAYER_STATE_SOURCES.hoyolab,
      confidence: "low",
    };
  });
}

function locationMatchesCharacter(location: string, stableKey: string, rows: DbPlayerCharacter[]): boolean {
  const normalizedLocation = normalizeSearchText(location);
  const candidates = new Set([
    normalizeSearchText(stableKey),
    normalizeSearchText(stableKey.replace(/^char_/, "")),
    ...rows.flatMap((row) => [row.sourceCharacterKey, row.name, row.character?.name, row.character?.stableKey].filter((value): value is string => Boolean(value)).map(normalizeSearchText)),
  ]);

  return candidates.has(normalizedLocation) || prefixedStableKey("char", location) === stableKey;
}

function readGoodArtifacts(rawPayload: unknown): GoodArtifactPayload[] {
  const payload = readRecord(rawPayload);
  return Array.isArray(payload.artifacts) ? payload.artifacts.map((artifact) => readRecord(artifact) as GoodArtifactPayload) : [];
}

function canonicalSource(source: string | null | undefined): string {
  if (source === "hoyolab-profile") {
    return PLAYER_STATE_SOURCES.hoyolab;
  }
  return source ?? PLAYER_STATE_SOURCES.existing;
}

function readSubstats(substats: unknown[] | undefined): PlayerArtifactState["substats"] {
  if (!substats) {
    return undefined;
  }

  return substats.map((substat) => {
    const record = readRecord(substat);
    return {
      key: readString(record.key) ?? readString(record.statKey),
      value: readNumber(record.value),
    };
  });
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

class CharacterResolver {
  private readonly byAlias = new Map<string, CharacterResolutionEntry>();
  private readonly byStableKey = new Map<string, CharacterResolutionEntry>();
  private readonly byName = new Map<string, CharacterResolutionEntry>();

  constructor(characters: CharacterResolutionEntry[]) {
    for (const character of characters) {
      this.byStableKey.set(character.stableKey, character);
      this.byName.set(normalizeSearchText(character.name), character);

      for (const alias of character.aliases) {
        this.byAlias.set(alias.normalized, character);
      }
    }
  }

  resolve(sourceCharacterKey: string): CharacterResolutionEntry | undefined {
    if (!sourceCharacterKey || normalizeSearchText(sourceCharacterKey).includes("traveler")) {
      return undefined;
    }

    const normalized = normalizeSearchText(sourceCharacterKey);
    const stableKey = prefixedStableKey("char", sourceCharacterKey);
    return this.byAlias.get(normalized) ?? this.byStableKey.get(sourceCharacterKey) ?? this.byStableKey.get(stableKey) ?? this.byName.get(normalized);
  }
}
