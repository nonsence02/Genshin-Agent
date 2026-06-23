import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://genshin_agent:genshin_agent_dev@localhost:5432/genshin_agent?schema=public";

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });
