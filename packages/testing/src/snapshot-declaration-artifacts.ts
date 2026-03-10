import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const snapshotRoot = path.resolve(import.meta.dirname, "..", ".declaration-artifacts");

const declarationArtifacts = [
  "packages/core/dist/runtime/runtime.d.mts",
  "packages/core/dist/runtime/functions.d.mts",
  "packages/schema/dist/validators.d.ts",
  "packages/react/dist/index.d.ts",
  "packages/svelte/dist/index.d.ts",
  "packages/platform-web/dist/index.d.ts",
  "packages/platform-web/dist/worker.d.ts",
  "packages/platform-web/dist/react.d.ts",
  "packages/platform-node/dist/index.d.mts",
  "packages/platform-node/dist/ipc.d.mts",
  "packages/platform-node/dist/ipc-react.d.mts",
  "packages/platform-expo/dist/index.d.ts",
  "packages/platform-expo/dist/react.d.ts",
  "packages/next/dist/index.d.ts",
  "packages/next/dist/config.d.ts"
] as const;

await rm(snapshotRoot, { recursive: true, force: true });

for (const relativePath of declarationArtifacts) {
  const sourcePath = path.resolve(workspaceRoot, relativePath);
  const targetPath = path.resolve(snapshotRoot, relativePath);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath);
}
