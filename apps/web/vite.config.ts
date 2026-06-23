import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  define: {
    __GENSHIN_AGENT_API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3000"),
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
});
