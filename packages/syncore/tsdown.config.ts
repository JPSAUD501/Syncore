import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/cli.ts",
    "src/browser.ts",
    "src/browser-react.tsx",
    "src/react.ts",
    "src/svelte.ts",
    "src/expo.ts",
    "src/expo-react.tsx",
    "src/node.ts",
    "src/node-ipc.ts",
    "src/node-ipc-react.tsx",
    "src/next.ts",
    "src/next-config.ts"
  ],
  platform: "neutral",
  target: "es2022",
  format: "esm",
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  deps: {
    neverBundle: ["node:fs", "node:path", "node:url"]
  }
});
