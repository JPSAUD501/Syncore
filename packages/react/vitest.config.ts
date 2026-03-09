import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@syncore/core": resolve(__dirname, "../core/src/index.ts"),
      "@syncore/devtools-protocol": resolve(
        __dirname,
        "../devtools-protocol/src/index.ts"
      ),
      "@syncore/schema": resolve(__dirname, "../schema/src/index.ts")
    }
  },
  test: {
    environment: "jsdom"
  }
});
