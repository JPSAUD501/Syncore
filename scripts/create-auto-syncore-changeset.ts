import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

/**
 * Builds the summary of an automatic patch release. It lists the commits that
 * touched the published package, so the release notes say what shipped
 * instead of a generic line.
 */
export function buildAutoChangesetSummary(options: {
  subjects: string[];
  since: string | undefined;
  changedFileCount: number;
}): string {
  const subjects = [
    ...new Set(
      options.subjects
        .map((subject) => subject.trim())
        .filter((subject) => subject && !isReleaseCommit(subject))
    )
  ];
  if (subjects.length === 0) {
    return `Patch release for ${options.changedFileCount} changed file(s) in the published syncorejs package.`;
  }
  const heading = options.since
    ? `Changes since ${options.since}:`
    : "Changes in this release:";
  return [heading, "", ...subjects.map((subject) => `- ${subject}`)].join("\n");
}

function isReleaseCommit(subject: string): boolean {
  return /^chore(\(release\))?:\s*(version packages|release)\b/i.test(subject);
}

async function main(): Promise<void> {
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

  const since = await readLatestReleaseTag();
  const subjects = await readCommitSubjects(since ?? diffBase);
  const content = [
    "---",
    `"${syncorePublishedPackageName}": patch`,
    "---",
    "",
    buildAutoChangesetSummary({
      subjects,
      since,
      changedFileCount: changedFiles.length
    }),
    ""
  ].join("\n");
  await mkdir(changesetDir, { recursive: true });
  await writeFile(autoChangesetPath, content, "utf8");

  console.log(
    `Created ${path.relative(workspaceRoot, autoChangesetPath)} for ${changedFiles.length} changed file(s).`
  );
}

async function hasPendingChangeset(): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(changesetDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw error;
  }
  return entries.some(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      entry.name !== "README.md" &&
      entry.name !== path.basename(autoChangesetPath)
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function readLocalVersion(): Promise<string> {
  const packageJson = JSON.parse(
    await readFile(syncorePackageJsonPath, "utf8")
  ) as { version: string };
  return packageJson.version;
}

async function readPublishedVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await exec(
      "npm",
      ["view", syncorePublishedPackageName, "version", "--json"],
      workspaceRoot
    );
    const version: unknown = JSON.parse(stdout.trim());
    return typeof version === "string" ? version : undefined;
  } catch (error) {
    console.warn(
      `Failed to read published ${syncorePublishedPackageName} version from npm: ${formatError(error)}`
    );
  }

  const latestTag = await readLatestReleaseTag();
  return latestTag?.replace(`${syncorePublishedPackageName}@`, "");
}

async function readLatestReleaseTag(): Promise<string | undefined> {
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
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
  } catch (error) {
    console.warn(
      `Failed to read local ${syncorePublishedPackageName} tags: ${formatError(error)}`
    );
    return undefined;
  }
}

async function readCommitSubjects(since: string): Promise<string[]> {
  try {
    const { stdout } = await exec(
      "git",
      [
        "log",
        "--no-merges",
        "--format=%s",
        `${since}..HEAD`,
        "--",
        ...watchedPaths
      ],
      workspaceRoot
    );
    return stdout.split(/\r?\n/);
  } catch (error) {
    console.warn(`Failed to read commit subjects: ${formatError(error)}`);
    return [];
  }
}

async function resolveDiffBase(): Promise<string> {
  const before = process.env.GITHUB_EVENT_BEFORE?.trim();
  if (before && !/^0+$/.test(before)) {
    return before;
  }

  try {
    const { stdout } = await exec("git", ["rev-parse", "HEAD^"], workspaceRoot);
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

async function readChangedFiles(diffBase: string): Promise<string[]> {
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

async function exec(command: string, args: string[], cwd: string) {
  const executable = resolveExecutable(command);
  const executableArgs =
    process.platform === "win32" && command === "npm"
      ? ["/d", "/s", "/c", "npm.cmd", ...args]
      : args;
  return execFileAsync(executable, executableArgs, {
    cwd,
    env: process.env,
    windowsHide: true
  });
}

function resolveExecutable(command: string): string {
  if (process.platform === "win32" && command === "npm") {
    return process.env.ComSpec ?? "cmd.exe";
  }
  return command;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main();
}
