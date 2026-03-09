import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@syncore/react": path.join(
        import.meta.dirname,
        "node_modules",
        "@syncore",
        "react"
      )
    }
  },
  root: path.join(import.meta.dirname, "src", "renderer"),
  build: {
    outDir: path.join(import.meta.dirname, "dist", "renderer"),
    emptyOutDir: false
  }
});
