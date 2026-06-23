import { prisma } from "../../db/client.js";

interface InspectOptions {
  folder?: string;
  limit: number;
}

function parseOptions(args: string[]): InspectOptions {
  const options: InspectOptions = { limit: 5 };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--folder") {
      options.folder = args[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      const limit = Number(args[index + 1]);

      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("--limit requires a positive integer");
      }

      options.limit = limit;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.folder) {
    throw new Error("--folder is required");
  }

  return options;
}

function summarize(value: unknown, depth = 0): unknown {
  if (depth > 1) {
    return Array.isArray(value) ? `[array:${value.length}]` : typeof value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 2).map((item) => summarize(item, depth + 1));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 16)
        .map(([key, item]) => [key, summarize(item, depth + 1)]),
    );
  }

  return value;
}

try {
  const options = parseOptions(process.argv.slice(2));

  prisma.rawGameObject
    .findMany({
      where: {
        source: "genshin-db",
        folder: options.folder,
      },
      take: options.limit,
      orderBy: {
        externalKey: "asc",
      },
      select: {
        externalKey: true,
        payload: true,
      },
    })
    .then((rows) => {
      console.log(`RawGameObject folder=${options.folder} count=${rows.length}`);

      for (const row of rows) {
        const payload = row.payload as Record<string, unknown>;
        console.log(`\n${row.externalKey}`);
        console.log(`keys: ${Object.keys(payload).join(", ")}`);
        console.dir(summarize(payload), { depth: 6 });
      }
    })
    .finally(async () => {
      await prisma.$disconnect();
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
