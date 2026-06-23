import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBaseUrl = env.VITE_API_BASE_URL ?? process.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3123";

  return {
    root: "apps/web",
    plugins: [react()],
    define: {
      __GENSHIN_AGENT_API_BASE_URL__: JSON.stringify(apiBaseUrl),
    },
    build: {
      outDir: "../../dist/web",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
    },
    preview: {
      port: 4173,
    },
  };
});
