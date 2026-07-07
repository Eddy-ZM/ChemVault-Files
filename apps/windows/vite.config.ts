import { defineConfig } from "vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "src/renderer",
  base: "./",
  envPrefix: ["VITE_", "CHEMVAULT_"],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(currentDir, "src/renderer/index.html")
    }
  },
  resolve: {
    alias: {
      "@chemvault/files-api-client": resolve(currentDir, "../../packages/api-client/src/index.ts")
    }
  }
});
