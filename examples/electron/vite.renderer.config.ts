import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [react()],
  root: path.join(import.meta.dirname, "src", "renderer"),
  build: {
    outDir: path.join(import.meta.dirname, "dist", "renderer"),
    emptyOutDir: false
  }
});
