import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@syncore/core": path.resolve(
        import.meta.dirname,
        "../core/src/index.ts"
      ),
      "@syncore/schema": path.resolve(
        import.meta.dirname,
        "../schema/src/index.ts"
      ),
      "@syncore/devtools-protocol": path.resolve(
        import.meta.dirname,
        "../devtools-protocol/src/index.ts"
      ),
      "@syncore/react": path.resolve(
        import.meta.dirname,
        "../react/src/index.tsx"
      )
    }
  },
  test: {
    environment: "jsdom"
  }
});
