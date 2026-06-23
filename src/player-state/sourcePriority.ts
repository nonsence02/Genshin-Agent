export const PLAYER_STATE_SOURCES = {
  hoyolab: "hoyolab_profile",
  good: "inventory-kamera-good",
  weapons: "inventory-kamera-weapons",
  existing: "player-character",
} as const;

export const PLAYER_STATE_PRIORITY = {
  identity: ["normalized-character"],
  level: [PLAYER_STATE_SOURCES.hoyolab, PLAYER_STATE_SOURCES.good, PLAYER_STATE_SOURCES.existing],
  ascension: [PLAYER_STATE_SOURCES.good, PLAYER_STATE_SOURCES.existing],
  constellation: [PLAYER_STATE_SOURCES.hoyolab, PLAYER_STATE_SOURCES.good],
  talents: [PLAYER_STATE_SOURCES.hoyolab, PLAYER_STATE_SOURCES.good],
  equippedWeapon: [PLAYER_STATE_SOURCES.hoyolab, PLAYER_STATE_SOURCES.weapons],
  equippedArtifacts: [PLAYER_STATE_SOURCES.good, PLAYER_STATE_SOURCES.hoyolab],
  inventoryMaterials: [PLAYER_STATE_SOURCES.good],
  manualOverrides: ["manual-inventory-overrides"],
} as const;

export interface SourceValue<T> {
  source: string;
  value: T | undefined | null;
}

export interface SourceConflict {
  field: string;
  chosenSource: string;
  values: Array<{
    source: string;
    value: unknown;
  }>;
}

export function chooseByPriority<T>(
  field: string,
  values: SourceValue<T>[],
  priority: readonly string[],
): { value?: T; source?: string; conflict?: SourceConflict } {
  const present = values.filter((entry) => entry.value !== undefined && entry.value !== null) as Array<SourceValue<T> & { value: T }>;
  const chosen = [...present].sort((left, right) => priorityIndex(priority, left.source) - priorityIndex(priority, right.source))[0];

  if (!chosen) {
    return {};
  }

  const distinct = new Map<string, SourceValue<T> & { value: T }>();
  for (const entry of present) {
    distinct.set(JSON.stringify(entry.value), entry);
  }

  return {
    value: chosen.value,
    source: chosen.source,
    conflict: distinct.size > 1
      ? {
          field,
          chosenSource: chosen.source,
          values: present.map((entry) => ({ source: entry.source, value: entry.value })),
        }
      : undefined,
  };
}

function priorityIndex(priority: readonly string[], source: string): number {
  const index = priority.indexOf(source);
  return index === -1 ? priority.length + 1 : index;
}
