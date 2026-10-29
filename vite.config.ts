import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const dir = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        "content/main-world": resolve(dir, "src/content/main-world.ts"),
        "content/bridge": resolve(dir, "src/content/bridge.ts"),
        background: resolve(dir, "src/background.ts"),
        popup: resolve(dir, "src/ui/popup.html"),
      },
      output: { entryFileNames: "[name].js", chunkFileNames: "[name].js", assetFileNames: "[name][extname]" },
    },
  },
});
