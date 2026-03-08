import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  platform: "node",
  target: "node22",
  format: "esm",
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ["vite"]
  },
  hooks: {
    "build:done": async () => {
      const outputFile = path.resolve(import.meta.dirname, "dist", "cli.mjs");
      const body = (await readFile(outputFile, "utf8")).replace(
        /^(#!.*\r?\n)+/,
        ""
      );
      await writeFile(outputFile, `#!/usr/bin/env node\n${body}`);
    }
  }
});
