import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  platform: "neutral",
  target: "es2022",
  format: "esm",
  dts: true,
  sourcemap: true
});
