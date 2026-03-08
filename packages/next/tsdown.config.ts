import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.tsx", "src/config.ts"],
  platform: "neutral",
  target: "es2022",
  format: "esm",
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true
});
