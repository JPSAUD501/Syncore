import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const source = require.resolve("sql.js/dist/sql-wasm.wasm");
const destinationDirectory = path.resolve(root, "public");
const destination = path.resolve(destinationDirectory, "sql-wasm.wasm");

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
console.log(`Copied sql-wasm.wasm to ${destination}`);
