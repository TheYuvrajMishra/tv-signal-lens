// Content scripts run as classic scripts, so each one must be a single
// self-contained file — no shared chunks. Build each content entry on its
// own (inlineDynamicImports, iife) into dist/content/.
import { build } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(new URL("../vite.config.ts", import.meta.url)));
const entries = {
  "main-world": "src/content/main-world.ts",
  bridge: "src/content/bridge.ts",
  "draw-main": "src/content/draw-main.ts",
};
for (const [name, file] of Object.entries(entries)) {
  // draw-main lands in commit d; skip it until it exists.
  const fs = await import("node:fs");
  if (!fs.existsSync(resolve(root, file))) { console.log(`skip ${name} (not yet present)`); continue; }
  await build({
    configFile: false, root, publicDir: false, logLevel: "warn",
    build: {
      outDir: "dist/content", emptyOutDir: false, target: "es2022",
      rollupOptions: { input: { [name]: resolve(root, file) },
        output: { entryFileNames: "[name].js", format: "iife", inlineDynamicImports: true } },
    },
  });
  console.log(`built content/${name}.js`);
}
