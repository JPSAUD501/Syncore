import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "syncorejs/next/config",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "next-config.ts"
        )
      },
      {
        find: "@syncore/next/config",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "next",
          "src",
          "config.ts"
        )
      },
      {
        find: "expo-file-system",
        replacement: path.resolve(
          import.meta.dirname,
          "src",
          "mocks",
          "expo-file-system.ts"
        )
      },
      {
        find: "expo-sqlite",
        replacement: path.resolve(
          import.meta.dirname,
          "src",
          "mocks",
          "expo-sqlite.ts"
        )
      },
      {
        find: "@syncore/core/cli",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "core",
          "src",
          "cli.ts"
        )
      },
      {
        find: "@syncore/core/transport",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "core",
          "src",
          "transport.ts"
        )
      },
      {
        find: "@syncore/cli",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "cli",
          "src",
          "index.ts"
        )
      },
      {
        find: "@syncore/platform-node/ipc/react",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "platform-node",
          "src",
          "ipc-react.tsx"
        )
      },
      {
        find: "@syncore/platform-node/ipc",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "platform-node",
          "src",
          "ipc.ts"
        )
      },
      {
        find: "@syncore/platform-web/react",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "platform-web",
          "src",
          "react.tsx"
        )
      },
      {
        find: "@syncore/platform-expo/react",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "platform-expo",
          "src",
          "react.tsx"
        )
      },
      {
        find: "syncorejs/node/ipc/react",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "node-ipc-react.tsx"
        )
      },
      {
        find: "syncorejs/browser/react",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "browser-react.tsx"
        )
      },
      {
        find: "syncorejs/expo/react",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "expo-react.tsx"
        )
      },
      {
        find: "syncorejs/node/ipc",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "node-ipc.ts"
        )
      },
      {
        find: "syncorejs/browser",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "browser.ts"
        )
      },
      {
        find: "syncorejs/react",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "react.ts"
        )
      },
      {
        find: "syncorejs/svelte",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "svelte.ts"
        )
      },
      {
        find: "syncorejs/expo",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "expo.ts"
        )
      },
      {
        find: "syncorejs/node",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "node.ts"
        )
      },
      {
        find: "syncorejs/next",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "next.ts"
        )
      },
      {
        find: "syncorejs/cli",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "cli.ts"
        )
      },
      {
        find: "syncorejs",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "index.ts"
        )
      },
      {
        find: "syncore",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "syncore",
          "src",
          "index.ts"
        )
      },
      {
        find: "@syncore/core",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "core",
          "src",
          "index.ts"
        )
      },
      {
        find: "@syncore/schema",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "schema",
          "src",
          "index.ts"
        )
      },
      {
        find: "@syncore/devtools-protocol",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "devtools-protocol",
          "src",
          "index.ts"
        )
      },
      {
        find: "@syncore/platform-node",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "platform-node",
          "src",
          "index.ts"
        )
      },
      {
        find: "@syncore/platform-web",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "platform-web",
          "src",
          "index.ts"
        )
      },
      {
        find: "@syncore/react",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "react",
          "src",
          "index.tsx"
        )
      },
      {
        find: "@syncore/svelte",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "svelte",
          "src",
          "index.ts"
        )
      },
      {
        find: "@syncore/platform-expo",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "platform-expo",
          "src",
          "index.ts"
        )
      },
      {
        find: "@syncore/next",
        replacement: path.resolve(
          import.meta.dirname,
          "..",
          "next",
          "src",
          "index.tsx"
        )
      }
    ]
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
