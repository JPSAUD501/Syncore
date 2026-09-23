/**
 * Fails when a pending changeset would produce useless or misleading release
 * notes. Run with `npm run changeset:check`; CI runs it on every pull request.
 *
 * Rules (see .changeset/README.md):
 * - every package named in the front matter exists and uses patch/minor/major,
 * - the summary is written for users: at least MIN_SUMMARY_WORDS words and not
 *   just a generic word such as "Improvements",
 * - a release that breaks `syncorejs` (major, or minor while it is 0.x) has a
 *   "Breaking changes" or "Migration" section.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MIN_SUMMARY_WORDS = 8;

const PUBLISHED_PACKAGE = "syncorejs";
const BUMP_TYPES = new Set(["patch", "minor", "major"]);
const GENERIC_SUMMARIES = new Set([
  "bug fixes",
  "bugfixes",
  "changes",
  "cleanup",
  "fix",
  "fixes",
  "improvement",
  "improvements",
  "internal changes",
  "maintenance",
  "minor changes",
  "minor fixes",
  "misc",
  "miscellaneous",
  "refactor",
  "small fixes",
  "tweaks",
  "update",
  "updates",
  "various fixes",
  "various improvements",
  "wip"
]);
// Written by scripts/create-auto-syncore-changeset.ts during a release; it
// is never part of a pull request.
const GENERATED_CHANGESETS = new Set(["auto-syncorejs-release.md"]);

export type BumpType = "patch" | "minor" | "major";

export interface ParsedChangeset {
  releases: Array<{ name: string; type: string }>;
  summary: string;
}

export interface ChangesetContext {
  /** Names of the workspace packages a changeset may release. */
  knownPackages: ReadonlySet<string>;
  /** Current version of `syncorejs`, used to tell whether minor is breaking. */
  publishedVersion: string;
}

export function parseChangeset(source: string): ParsedChangeset {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  if (!match) {
    throw new Error("is missing the --- front matter block.");
  }
  const [, frontMatter = "", summary = ""] = match;
  const releases = frontMatter
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const release = /^["']?([^"':]+)["']?\s*:\s*([A-Za-z]+)\s*$/.exec(line);
      if (!release) {
        throw new Error(`has an unreadable front matter line: ${line}`);
      }
      return { name: release[1]!.trim(), type: release[2]! };
    });
  return { releases, summary: summary.trim() };
}

/** Returns the problems with one changeset; an empty list means it is fine. */
export function checkChangeset(
  source: string,
  context: ChangesetContext
): string[] {
  let parsed: ParsedChangeset;
  try {
    parsed = parseChangeset(source);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  const problems: string[] = [];
  if (parsed.releases.length === 0) {
    problems.push("does not release any package.");
  }
  for (const release of parsed.releases) {
    if (!context.knownPackages.has(release.name)) {
      problems.push(`releases "${release.name}", which is not a workspace package.`);
    }
    if (!BUMP_TYPES.has(release.type)) {
      problems.push(
        `uses "${release.type}" for "${release.name}"; use patch, minor or major.`
      );
    }
  }

  const words = countWords(parsed.summary);
  if (GENERIC_SUMMARIES.has(normalizeSummary(parsed.summary))) {
    problems.push(
      `has a generic summary ("${parsed.summary}"). Say what changed for people using syncorejs.`
    );
  } else if (words < MIN_SUMMARY_WORDS) {
    problems.push(
      `has a ${words}-word summary; write at least ${MIN_SUMMARY_WORDS} words about what changed for users.`
    );
  }

  const published = parsed.releases.find(
    (release) => release.name === PUBLISHED_PACKAGE
  );
  if (
    published &&
    isBreakingBump(published.type, context.publishedVersion) &&
    !hasMigrationSection(parsed.summary)
  ) {
    problems.push(
      `is a ${published.type} release of ${PUBLISHED_PACKAGE}@${context.publishedVersion}, which is a breaking release. ` +
        'Add a "Breaking changes" or "Migration" section that tells users what to change, ' +
        "or use patch if nothing breaks."
    );
  }
  return problems;
}

export function isBreakingBump(type: string, currentVersion: string): boolean {
  if (type === "major") {
    return true;
  }
  // Before 1.0, Changesets turns a minor bump into 0.(x+1).0, which semver
  // treats as breaking.
  return type === "minor" && currentVersion.startsWith("0.");
}

function hasMigrationSection(summary: string): boolean {
  return /^(#{1,6}\s*|\*\*)?(breaking changes?|migration|migrating|upgrade guide)\b/im.test(
    summary
  );
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word)).length;
}

function normalizeSummary(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function readKnownPackages(workspaceRoot: string): Promise<Set<string>> {
  const names = new Set<string>();
  for (const group of ["packages", "apps", "examples"]) {
    let entries;
    try {
      entries = await readdir(path.join(workspaceRoot, group), {
        withFileTypes: true
      });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      try {
        const packageJson = JSON.parse(
          await readFile(
            path.join(workspaceRoot, group, entry.name, "package.json"),
            "utf8"
          )
        ) as { name?: string };
        if (packageJson.name) {
          names.add(packageJson.name);
        }
      } catch {
        // Not a package directory.
      }
    }
  }
  return names;
}

export async function checkPendingChangesets(
  workspaceRoot: string
): Promise<Array<{ file: string; problems: string[] }>> {
  const changesetDir = path.join(workspaceRoot, ".changeset");
  const packageJson = JSON.parse(
    await readFile(
      path.join(workspaceRoot, "packages", "syncore", "package.json"),
      "utf8"
    )
  ) as { version: string };
  const context: ChangesetContext = {
    knownPackages: await readKnownPackages(workspaceRoot),
    publishedVersion: packageJson.version
  };

  const files = (await readdir(changesetDir))
    .filter(
      (file) =>
        file.endsWith(".md") &&
        file !== "README.md" &&
        !GENERATED_CHANGESETS.has(file)
    )
    .sort();
  const results = [];
  for (const file of files) {
    const source = await readFile(path.join(changesetDir, file), "utf8");
    results.push({ file, problems: checkChangeset(source, context) });
  }
  return results;
}

async function main(): Promise<void> {
  const workspaceRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const results = await checkPendingChangesets(workspaceRoot);
  const failing = results.filter((result) => result.problems.length > 0);
  for (const result of failing) {
    for (const problem of result.problems) {
      console.error(`.changeset/${result.file} ${problem}`);
    }
  }
  if (failing.length > 0) {
    console.error(
      "\nSee .changeset/README.md for how to write a changeset that makes useful release notes."
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Checked ${results.length} pending changeset(s).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main();
}
