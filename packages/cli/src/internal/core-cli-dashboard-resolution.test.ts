import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolvePackagedDashboardRoot } from "./core-cli.js";

/**
 * Regression tests for the dashboard resolution path bug.
 *
 * Background: the published `syncorejs` package ships the dashboard at
 * `dist/_dashboard/index.html`, while the CLI runtime (core-cli.mjs) is
 * vendored at `dist/_vendor/cli/internal/core-cli.mjs`. `CORE_PACKAGE_ROOT`
 * therefore resolves to `dist/_vendor/cli` in a published install, and the
 * resolver must climb two levels to reach `dist/_dashboard`. An earlier
 * version only climbed one level and fell back on a workspace-root walk
 * that yields nothing in a normal npm install, so `syncorejs dev` threw
 * "Syncore Dashboard build is missing" despite the asset being present.
 *
 * These tests build the published on-disk layout in an isolated tempdir
 * (outside the repo, so no ancestor `workspaces` package.json interferes)
 * and assert the resolver finds it.
 */
describe("resolvePackagedDashboardRoot", () => {
  let tmp: string;
  const previousCwd = process.cwd();

  beforeAll(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), "syncore-dashboard-res-"));
    // Run from the tempdir so the internal `process.cwd()` fallback in
    // resolveWorkspaceRoots does not climb into the repo workspace.
    process.chdir(tmp);
  });

  afterAll(async () => {
    process.chdir(previousCwd);
    await rm(tmp, { recursive: true, force: true });
  });

  // Extra safety: restore cwd even if a test throws mid-way.
  afterEach(() => {
    try {
      process.chdir(tmp);
    } catch {
      process.chdir(previousCwd);
    }
  });

  it("resolves the dashboard in the published vendored layout (dist/_vendor/cli + dist/_dashboard)", async () => {
    // Replicate the published layout inside the tempdir.
    const distDir = path.join(tmp, "dist");
    const cliInternalDir = path.join(distDir, "_vendor", "cli", "internal");
    const dashboardDir = path.join(distDir, "_dashboard");
    await mkdir(cliInternalDir, { recursive: true });
    await mkdir(dashboardDir, { recursive: true });
    await writeFile(path.join(cliInternalDir, "core-cli.mjs"), "");
    await writeFile(path.join(dashboardDir, "index.html"), "");

    // CORE_PACKAGE_ROOT in a published install is dist/_vendor/cli.
    const packageRoot = path.join(distDir, "_vendor", "cli");
    const resolved = await resolvePackagedDashboardRoot(packageRoot);

    expect(resolved).toBe(dashboardDir);
  });

  it("returns null when no dashboard exists at any candidate path", async () => {
    const distDir = path.join(tmp, "empty-layout");
    const cliInternalDir = path.join(distDir, "_vendor", "cli", "internal");
    await mkdir(cliInternalDir, { recursive: true });
    // Note: no dist/_dashboard/index.html created.

    const packageRoot = path.join(distDir, "_vendor", "cli");
    const resolved = await resolvePackagedDashboardRoot(packageRoot);

    expect(resolved).toBeNull();
  });

  it("resolves via the workspace fallback when a monorepo root is present", async () => {
    const workspaceRoot = path.join(tmp, "fake-monorepo");
    const dashboardDir = path.join(
      workspaceRoot,
      "packages",
      "syncore",
      "dist",
      "_dashboard"
    );
    const packageRootDir = path.join(workspaceRoot, "packages", "somepkg");
    await mkdir(packageRootDir, { recursive: true });
    await mkdir(dashboardDir, { recursive: true });
    await writeFile(path.join(dashboardDir, "index.html"), "");
    // Mark the monorepo root with a `workspaces` field so findWorkspaceRoot
    // stops there instead of climbing further.
    await writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "fake-monorepo", workspaces: ["packages/*"] })
    );

    const resolved = await resolvePackagedDashboardRoot(packageRootDir);

    expect(resolved).toBe(dashboardDir);
  });
});
