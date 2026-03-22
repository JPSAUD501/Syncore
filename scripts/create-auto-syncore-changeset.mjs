import { execFile } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptsDir, "..");
const changesetDir = path.join(workspaceRoot, ".changeset");
const syncorePackageJsonPath = path.join(
  workspaceRoot,
  "packages",
  "syncore",
  "package.json"
);
const autoChangesetPath = path.join(changesetDir, "auto-syncorejs-release.md");
const syncorePublishedPackageName = "syncorejs";
const watchedPaths = [
  "packages/syncore",
  "packages/core",
  "packages/schema",
  "packages/devtools-protocol",
  "packages/cli",
  "packages/react",
  "packages/platform-web",
  "packages/platform-node",
  "packages/platform-expo",
  "packages/next",
  "packages/svelte",
  "scripts/syncore-packaging.ts",
  "scripts/validate-syncore-package.ts",
  "scripts/vendor-syncore-internals.ts"
];

async function main() {
  if (await hasPendingChangeset()) {
    console.log("Pending changeset detected. Skipping syncorejs auto-changeset.");
    return;
  }

  const localVersion = await readLocalVersion();
  const publishedVersion = await readPublishedVersion();
  if (publishedVersion && publishedVersion !== localVersion) {
    console.log(
      `syncorejs local version (${localVersion}) is ahead of the published version (${publishedVersion}). Skipping auto-changeset.`
    );
    return;
  }

  const diffBase = await resolveDiffBase();
  const changedFiles = await readChangedFiles(diffBase);
  if (changedFiles.length === 0) {
    console.log("No syncorejs publish-surface changes detected in this push.");
    return;
  }

  const content = [
    "---",
    `"${syncorePublishedPackageName}": patch`,
    "---",
    "",
    "Auto-generated patch release for published Syncore package changes.",
    ""
  ].join("\n");
  await writeFile(autoChangesetPath, content, "utf8");

  console.log(
    `Created ${path.relative(workspaceRoot, autoChangesetPath)} for ${changedFiles.length} changed file(s).`
  );
}

async function hasPendingChangeset() {
  const entries = await readdir(changesetDir, { withFileTypes: true });
  return entries.some(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      entry.name !== path.basename(autoChangesetPath)
  );
}

async function readLocalVersion() {
  const packageJson = JSON.parse(
    await readFile(syncorePackageJsonPath, "utf8")
  );
  return packageJson.version;
}

async function readPublishedVersion() {
  try {
    const { stdout } = await exec(
      "npm",
      ["view", syncorePublishedPackageName, "version", "--json"],
      workspaceRoot
    );
    const version = JSON.parse(stdout.trim());
    return typeof version === "string" ? version : undefined;
  } catch (error) {
    console.warn(
      `Failed to read published ${syncorePublishedPackageName} version from npm: ${formatError(error)}`
    );
  }

  try {
    const { stdout } = await exec(
      "git",
      [
        "tag",
        "--list",
        `${syncorePublishedPackageName}@*`,
        "--sort=-version:refname"
      ],
      workspaceRoot
    );
    const latestTag = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (!latestTag) {
      return undefined;
    }
    return latestTag.replace(`${syncorePublishedPackageName}@`, "");
  } catch (error) {
    console.warn(
      `Failed to read local ${syncorePublishedPackageName} tags: ${formatError(error)}`
    );
    return undefined;
  }
}

async function resolveDiffBase() {
  const before = process.env.GITHUB_EVENT_BEFORE?.trim();
  if (before && !/^0+$/.test(before)) {
    return before;
  }

  try {
    const { stdout } = await exec(
      "git",
      ["rev-parse", "HEAD^"],
      workspaceRoot
    );
    return stdout.trim();
  } catch {
    const { stdout } = await exec(
      "git",
      ["rev-list", "--max-parents=0", "HEAD"],
      workspaceRoot
    );
    return stdout.trim();
  }
}

async function readChangedFiles(diffBase) {
  const { stdout } = await exec(
    "git",
    ["diff", "--name-only", `${diffBase}..HEAD`, "--", ...watchedPaths],
    workspaceRoot
  );
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function exec(command, args, cwd) {
  return execFileAsync(command, args, {
    cwd,
    env: process.env,
    windowsHide: true
  });
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

void main();
