import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  platform: "neutral",
  target: "es2022",
  format: "esm",
  unbundle: true,
  dts: {
    build: true
  },
  sourcemap: true,
  clean: true
});
