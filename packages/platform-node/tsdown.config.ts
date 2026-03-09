import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/ipc.ts", "src/ipc-react.tsx"],
  platform: "node",
  target: "node22",
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
