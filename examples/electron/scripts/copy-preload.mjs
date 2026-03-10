import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const source = path.resolve(import.meta.dirname, "..", "src", "preload.cjs");
const targetDirectory = path.resolve(
  import.meta.dirname,
  "..",
  "dist",
  "examples",
  "electron",
  "src"
);
const target = path.join(targetDirectory, "preload.cjs");

await mkdir(targetDirectory, { recursive: true });
await copyFile(source, target);
