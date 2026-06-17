import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@syncore/internal": path.resolve(
        __dirname,
        "../../packages/internal/src/index.ts"
      ),
      "@": path.resolve(__dirname, "./src")
    }
  },
  test: {
    environment: "jsdom",
    maxWorkers: 1,
    pool: "threads"
  }
});
