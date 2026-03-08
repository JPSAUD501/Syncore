import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  platform: "node",
  target: "node22",
  format: "esm",
  deps: {
    neverBundle: ["vite"]
  },
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  hooks: {
    "build:done": async () => {
      const outputFile = path.resolve(import.meta.dirname, "dist", "index.mjs");
      const body = (await readFile(outputFile, "utf8")).replace(/^(#!.*\r?\n)+/, "");
      await writeFile(outputFile, `#!/usr/bin/env node\n${body}`);
    }
  }
});
