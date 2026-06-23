export interface AppEnv {
  databaseUrl: string | undefined;
}

export function readEnv(): AppEnv {
  return {
    databaseUrl: process.env.DATABASE_URL,
  };
}
