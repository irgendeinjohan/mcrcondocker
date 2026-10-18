import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/web",
  publicDir: "public",
  plugins: [svelte()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: false },
      "/healthz": "http://localhost:8080",
    },
  },
});
