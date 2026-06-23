import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../db/client.js";

export interface MaterialSourceLookupInput {
  materialKey?: string;
  materialId?: number;
  includeCalendar?: boolean;
}

export interface MaterialSourceLookupResult {
  material: {
    id: number;
    stableKey: string;
    name: string;
  };
  sources: Array<{
    sourceType: string;
    sourceKey?: string;
    sourceName?: string;
    resinCost?: number;
    days?: string[];
    notes?: string;
  }>;
  warnings: string[];
}

export interface MaterialSourceMaterial {
  id: number;
  stableKey: string;
  name: string;
}

export interface MaterialSourceRow {
  sourceType: string;
  sourceKey: string | null;
  sourceName: string | null;
  resinCost: number | null;
  notes: string | null;
}

export interface FarmCalendarRow {
  sourceType: string;
  sourceKey: string;
  dayOfWeek: string;
  materialId: number | null;
}

export interface MaterialSourceRepository {
  findMaterial(input: { materialKey?: string; materialId?: number }): Promise<MaterialSourceMaterial | null>;
  listMaterialSources(materialId: number): Promise<MaterialSourceRow[]>;
  listCalendarEntries(materialId: number, sourceKeys: Array<{ sourceType: string; sourceKey: string }>): Promise<FarmCalendarRow[]>;
}

export class MaterialSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialSourceError";
  }
}

export class PrismaMaterialSourceRepository implements MaterialSourceRepository {
  constructor(private readonly client: PrismaClient = prisma) {}

  async findMaterial(input: { materialKey?: string; materialId?: number }): Promise<MaterialSourceMaterial | null> {
    if (input.materialId !== undefined) {
      return this.client.material.findUnique({
        where: { id: input.materialId },
        select: { id: true, stableKey: true, name: true },
      });
    }

    if (!input.materialKey) {
      return null;
    }

    return this.client.material.findUnique({
      where: { stableKey: input.materialKey },
      select: { id: true, stableKey: true, name: true },
    });
  }

  async listMaterialSources(materialId: number): Promise<MaterialSourceRow[]> {
    return this.client.materialSource.findMany({
      where: { materialId },
      orderBy: [{ sourceType: "asc" }, { sourceKey: "asc" }, { sourceName: "asc" }],
      select: {
        sourceType: true,
        sourceKey: true,
        sourceName: true,
        resinCost: true,
        notes: true,
      },
    });
  }

  async listCalendarEntries(
    materialId: number,
    sourceKeys: Array<{ sourceType: string; sourceKey: string }>,
  ): Promise<FarmCalendarRow[]> {
    if (sourceKeys.length === 0) {
      return [];
    }

    return this.client.farmCalendarEntry.findMany({
      where: {
        OR: sourceKeys.map((source) => ({
          sourceType: source.sourceType,
          sourceKey: source.sourceKey,
          OR: [{ materialId }, { materialId: null }],
        })),
      },
      select: {
        sourceType: true,
        sourceKey: true,
        dayOfWeek: true,
        materialId: true,
      },
    });
  }
}

const SOURCE_ORDER = new Map<string, number>([
  ["domain", 0],
  ["boss", 1],
  ["weekly_boss", 2],
  ["enemy", 3],
  ["local_specialty", 4],
  ["ley_line", 5],
  ["shop", 6],
  ["crafting", 7],
  ["expedition", 8],
  ["event", 9],
  ["unknown", 99],
]);

const DAY_ORDER = new Map<string, number>([
  ["monday", 0],
  ["tuesday", 1],
  ["wednesday", 2],
  ["thursday", 3],
  ["friday", 4],
  ["saturday", 5],
  ["sunday", 6],
]);

export class MaterialSourceService {
  constructor(private readonly repository: MaterialSourceRepository = new PrismaMaterialSourceRepository()) {}

  async lookup(input: MaterialSourceLookupInput): Promise<MaterialSourceLookupResult> {
    const material = await this.repository.findMaterial(input);

    if (!material) {
      const key = input.materialKey ?? input.materialId ?? "(missing material identifier)";
      throw new MaterialSourceError(`Material not found: ${key}`);
    }

    const sourceRows = await this.repository.listMaterialSources(material.id);
    const sourceKeys = sourceRows
      .filter((source): source is MaterialSourceRow & { sourceKey: string } => source.sourceKey !== null)
      .map((source) => ({ sourceType: source.sourceType, sourceKey: source.sourceKey }));
    const calendarRows =
      input.includeCalendar === false ? [] : await this.repository.listCalendarEntries(material.id, sourceKeys);
    const calendarIndex = buildCalendarIndex(calendarRows);
    const sources = sourceRows
      .map((source) => ({
        sourceType: source.sourceType,
        sourceKey: source.sourceKey ?? undefined,
        sourceName: source.sourceName ?? undefined,
        resinCost: source.resinCost ?? undefined,
        days: source.sourceKey ? calendarIndex.get(`${source.sourceType}|${source.sourceKey}`) ?? undefined : undefined,
        notes: source.notes ?? undefined,
      }))
      .sort(compareSources);

    return {
      material,
      sources,
      warnings: sources.length === 0 ? [`No normalized sources found for ${material.stableKey}`] : [],
    };
  }
}

function buildCalendarIndex(rows: FarmCalendarRow[]): Map<string, string[]> {
  const specific = new Map<string, Set<string>>();
  const generic = new Map<string, Set<string>>();

  for (const row of rows) {
    const key = `${row.sourceType}|${row.sourceKey}`;
    const target = row.materialId === null ? generic : specific;
    const current = target.get(key) ?? new Set<string>();
    current.add(row.dayOfWeek);
    target.set(key, current);
  }

  const index = new Map([...generic.entries(), ...specific.entries()]);

  return new Map(
    [...index.entries()].map(([key, days]) => [
      key,
      [...days].sort((left, right) => (DAY_ORDER.get(left) ?? 99) - (DAY_ORDER.get(right) ?? 99) || left.localeCompare(right)),
    ]),
  );
}

function compareSources(
  left: MaterialSourceLookupResult["sources"][number],
  right: MaterialSourceLookupResult["sources"][number],
): number {
  return (
    (SOURCE_ORDER.get(left.sourceType) ?? 50) - (SOURCE_ORDER.get(right.sourceType) ?? 50) ||
    (left.sourceName ?? "").localeCompare(right.sourceName ?? "") ||
    (left.sourceKey ?? "").localeCompare(right.sourceKey ?? "") ||
    (left.notes ?? "").localeCompare(right.notes ?? "")
  );
}
