import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const configPath = path.join(workspaceRoot, ".changeset", "config.json");
const baseBranch = process.argv[2];

if (!baseBranch) {
  throw new Error("Expected a base branch argument.");
}

const config = JSON.parse(await readFile(configPath, "utf8"));
config.baseBranch = baseBranch;

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
