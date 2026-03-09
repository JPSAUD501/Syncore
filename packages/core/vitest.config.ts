import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@syncore/schema": path.resolve(
        import.meta.dirname,
        "../schema/src/index.ts"
      ),
      "@syncore/devtools-protocol": path.resolve(
        import.meta.dirname,
        "../devtools-protocol/src/index.ts"
      )
    }
  },
  test: {
    environment: "node"
  }
});
