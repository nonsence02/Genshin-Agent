import { config } from "dotenv";
import { createApp } from "./createApp.js";

config();

export async function startApi(): Promise<void> {
  const host = process.env.API_HOST ?? "127.0.0.1";
  const port = Number(process.env.API_PORT ?? 3123);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be an integer from 1 to 65535");
  }

  const app = await createApp();
  await app.listen({ host, port });
  console.log(`Genshin-Agent API listening on http://${host}:${port}`);
}

if (require.main === module) {
  startApi().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
