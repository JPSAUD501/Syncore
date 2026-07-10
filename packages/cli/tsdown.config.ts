import { readFileSync } from "node:fs";
import { defineConfig } from "tsdown";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string };

export default defineConfig({
  entry: ["src/index.ts"],
  platform: "node",
  target: "node22",
  format: "esm",
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  define: {
    __SYNCORE_CLI_VERSION__: JSON.stringify(packageJson.version)
  }
});
