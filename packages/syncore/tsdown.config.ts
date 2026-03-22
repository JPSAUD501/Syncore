import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/components.ts",
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
  // Examples consume this package through a workspace link. Avoid deleting
  // dist during rebuilds so long-lived dev servers do not resolve transient
  // missing files like dist/browser.js.
  clean: false,
  checks: {
    pluginTimings: false
  },
  deps: {
    neverBundle: [
      "@syncore/cli",
      "@syncore/core",
      "@syncore/core/cli",
      "@syncore/devtools-protocol",
      "@syncore/next",
      "@syncore/next/config",
      "@syncore/platform-expo",
      "@syncore/platform-expo/react",
      "@syncore/platform-node",
      "@syncore/platform-node/ipc",
      "@syncore/platform-node/ipc/react",
      "@syncore/platform-web",
      "@syncore/platform-web/react",
      "@syncore/react",
      "@syncore/schema",
      "@syncore/svelte",
      "commander",
      "next",
      "node:fs",
      "node:fs/promises",
      "node:http",
      "node:module",
      "node:net",
      "node:path",
      "node:sqlite",
      "node:url",
      "react",
      "react-dom",
      "react/jsx-runtime",
      "tsx",
      "tsx/esm/api",
      "vite",
      "ws"
    ]
  },
  hooks: {
    "build:done": async () => {
      const outputFile = path.resolve(import.meta.dirname, "dist", "cli.js");
      const body = (await readFile(outputFile, "utf8")).replace(
        /^(#!.*\r?\n)+/,
        ""
      );
      await writeFile(outputFile, `#!/usr/bin/env node\n${body}`);
    }
  }
});
