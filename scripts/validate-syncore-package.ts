import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  execCommand,
  syncorePublishedPackageName,
  syncorePackageRoot,
  walkFiles,
  workspaceRoot
} from "./syncore-packaging";

const syncorePublishedBinName = "syncorejs";

async function main(): Promise<void> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "syncore-pack-"));

  try {
    await execCommand(
      "bun",
      ["run", "--filter", syncorePublishedPackageName, "build:standalone"],
      workspaceRoot
    );

    const { stdout } = await execCommand(
      "npm",
      ["pack", "--json"],
      syncorePackageRoot
    );
    const packInfo = JSON.parse(stdout.trim()) as Array<{ filename?: string }>;
    const tarballName = packInfo[0]?.filename;
    if (!tarballName) {
      throw new Error("Failed to determine syncore tarball name.");
    }

    const tarballPath = path.join(syncorePackageRoot, tarballName);
    const fixtureDir = path.join(tempRoot, "fixture");

    await execCommand("npm", ["init", "-y"], fixtureDir, { createCwd: true });
    await execCommand(
      "npm",
      [
        "install",
        tarballPath,
        "react@19.0.0",
        "react-dom@19.0.0",
        "next@15.2.0",
        "svelte@5.0.0",
        "sql.js@1.14.1",
        "ws@8.18.0",
        "commander@13.1.0",
        "date-fns-tz@3.2.0",
        "tsx@4.19.3"
      ],
      fixtureDir
    );

    const entryCheckPath = path.join(fixtureDir, "check-exports.mjs");
    await writeFile(
      entryCheckPath,
      [
        `await import(${JSON.stringify(syncorePublishedPackageName)});`,
        `await import(${JSON.stringify(`${syncorePublishedPackageName}/react`)});`,
        `await import(${JSON.stringify(`${syncorePublishedPackageName}/browser`)});`,
        `await import(${JSON.stringify(`${syncorePublishedPackageName}/browser/react`)});`,
        `await import(${JSON.stringify(`${syncorePublishedPackageName}/node`)});`,
        `await import(${JSON.stringify(`${syncorePublishedPackageName}/node/ipc`)});`,
        `await import(${JSON.stringify(`${syncorePublishedPackageName}/node/ipc/react`)});`,
        `await import(${JSON.stringify(`${syncorePublishedPackageName}/next`)});`,
        `await import(${JSON.stringify(`${syncorePublishedPackageName}/next/config`)});`,
        `await import(${JSON.stringify(`${syncorePublishedPackageName}/svelte`)});`,
        `await import(${JSON.stringify(`${syncorePublishedPackageName}/cli`)});`,
        `console.log(${JSON.stringify(`${syncorePublishedPackageName} exports ok`)});`
      ].join("\n") + "\n"
    );
    await execCommand("node", [entryCheckPath], fixtureDir);

    const cliCheckPath = path.join(fixtureDir, "cli-check.mjs");
    await writeFile(
      cliCheckPath,
      [
        `import { runSyncoreCli } from ${JSON.stringify(`${syncorePublishedPackageName}/cli`)};`,
        `if (typeof runSyncoreCli !== "function") throw new Error(${JSON.stringify(`${syncorePublishedPackageName} cli export missing`)});`,
        `console.log(${JSON.stringify(`${syncorePublishedPackageName} cli export ok`)});`
      ].join("\n") + "\n"
    );
    await execCommand("node", [cliCheckPath], fixtureDir);

    const npxResult = await execCommand(
      "npx",
      [syncorePublishedBinName, "--help"],
      fixtureDir
    );
    if (!npxResult.stdout.includes(syncorePublishedBinName)) {
      throw new Error(
        `Expected npx ${syncorePublishedBinName} --help to mention the CLI name.`
      );
    }

    const publishedPackageJson = JSON.parse(
      await readFile(
        path.join(
          fixtureDir,
          "node_modules",
          syncorePublishedPackageName,
          "package.json"
        ),
        "utf8"
      )
    ) as { dependencies?: Record<string, string> };

    if (
      Object.keys(publishedPackageJson.dependencies ?? {}).some((name) =>
        name.startsWith("@syncore/")
      )
    ) {
      throw new Error(
        "Published syncore package still depends on private @syncore/* packages."
      );
    }

    const distRoot = path.join(
      fixtureDir,
      "node_modules",
      syncorePublishedPackageName,
      "dist"
    );
    const forbiddenReferences = await collectForbiddenReferences(distRoot);
    if (forbiddenReferences.length > 0) {
      throw new Error(
        `Found private @syncore references in packaged output:\n${forbiddenReferences.join("\n")}`
      );
    }

    console.log(`Validated ${tarballName}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

void main();

async function collectForbiddenReferences(rootDir: string): Promise<string[]> {
  const results: string[] = [];
  await walkFiles(rootDir, async (filePath) => {
    if (!/\.(?:[cm]?js|d\.[cm]?ts)$/.test(filePath)) {
      return;
    }
    const content = await readFile(filePath, "utf8");
    if (content.includes("@syncore/")) {
      results.push(path.relative(rootDir, filePath));
    }
  });
  return results;
}
