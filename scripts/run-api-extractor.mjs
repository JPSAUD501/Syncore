import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const publicPackageFilters = [
  "syncorejs",
  "@syncore/core",
  "@syncore/schema",
  "@syncore/devtools-protocol",
  "@syncore/svelte",
  "@syncore/react",
  "@syncore/platform-node",
  "@syncore/platform-expo",
  "@syncore/platform-web",
  "@syncore/next",
  "@syncore/cli"
];

const configFiles = [
  "packages/syncore/api-extractor.json",
  "packages/core/api-extractor.json",
  "packages/schema/api-extractor.json",
  "packages/devtools-protocol/api-extractor.json",
  "packages/svelte/api-extractor.json",
  "packages/react/api-extractor.json",
  "packages/platform-node/api-extractor.json",
  "packages/platform-node/api-extractor.ipc.json",
  "packages/platform-node/api-extractor.ipc-react.json",
  "packages/platform-expo/api-extractor.json",
  "packages/platform-web/api-extractor.json",
  "packages/next/api-extractor.json",
  "packages/cli/api-extractor.json"
];

const local = process.argv.includes("--local");

const projectFolders = [
  ...new Set(
    configFiles.map((configFile) =>
      path.dirname(path.join(workspaceRoot, configFile))
    )
  )
];

try {
  await runCommand(
    "bun",
    [
      "run",
      "turbo",
      "run",
      "build",
      ...publicPackageFilters.flatMap((filter) => ["--filter", filter])
    ],
    workspaceRoot
  );

  for (const configFile of configFiles) {
    await ensureApiExtractorDirectories(path.join(workspaceRoot, configFile));
    await runCommand(
      "node",
      [
        "./node_modules/@microsoft/api-extractor/bin/api-extractor",
        "run",
        "--config",
        configFile,
        ...(local ? ["--local"] : [])
      ],
      workspaceRoot
    );
  }
} finally {
  await Promise.all(
    projectFolders.map((projectFolder) =>
      rm(path.join(projectFolder, "temp"), {
        recursive: true,
        force: true
      })
    )
  );
}

async function runCommand(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Command failed: ${command} ${args.join(" ")} (exit ${code ?? "unknown"})`
        )
      );
    });
  });
}

async function ensureApiExtractorDirectories(configPath) {
  const projectFolder = path.dirname(configPath);
  await mkdir(path.join(projectFolder, "etc"), { recursive: true });
  await mkdir(path.join(projectFolder, "temp", "api"), { recursive: true });
}
