// Content scripts run as classic scripts: a static `import` in them is a syntax error
// and silently kills the whole script (this is why the panel never appeared).
import { readFileSync, readdirSync } from "node:fs";
for (const f of readdirSync("dist/content")) {
  const src = readFileSync(`dist/content/${f}`, "utf8");
  if (/^\s*import[\s{]/m.test(src) || /from\s*["']/.test(src)) {
    console.error(`FAIL: ${f} contains an import — content scripts must be self-contained`);
    process.exit(1);
  }
}
console.log("content scripts are self-contained");
