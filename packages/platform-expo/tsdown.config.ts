import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/react.tsx"],
  platform: "neutral",
  target: "es2022",
  format: "esm",
  unbundle: true,
  dts: {
    build: true
  },
  sourcemap: true,
  clean: true,
  checks: {
    pluginTimings: false
  },
  deps: {
    neverBundle: ["react", "react/jsx-runtime", "@syncore/react"]
  }
});
