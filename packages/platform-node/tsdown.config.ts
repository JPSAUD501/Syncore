import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/ipc.ts"],
  platform: "node",
  target: "node22",
  format: "esm",
  unbundle: true,
  dts: false,
  sourcemap: true,
  clean: true
});
