import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.tsx"],
  platform: "neutral",
  target: "es2022",
  format: "esm",
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true
});
