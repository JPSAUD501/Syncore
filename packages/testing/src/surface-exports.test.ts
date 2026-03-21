import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const syncorePackageJsonPath = path.join(
  workspaceRoot,
  "packages",
  "syncore",
  "package.json"
);

const expectedPublicSubpaths = [
  ".",
  "./cli",
  "./browser",
  "./browser/react",
  "./react",
  "./svelte",
  "./expo",
  "./expo/react",
  "./node",
  "./node/ipc",
  "./node/ipc/react",
  "./next",
  "./next/config"
] as const;

const runtimeImportableSubpaths = [
  "syncorejs",
  "syncorejs/cli",
  "syncorejs/browser",
  "syncorejs/browser/react",
  "syncorejs/react",
  "syncorejs/svelte",
  "syncorejs/node",
  "syncorejs/node/ipc",
  "syncorejs/node/ipc/react",
  "syncorejs/next",
  "syncorejs/next/config"
] as const;

describe("syncorejs public surface", () => {
  it("declares the supported public subpaths in package.json", async () => {
    const packageJson = JSON.parse(
      await readFile(syncorePackageJsonPath, "utf8")
    ) as { exports?: Record<string, unknown> };

    expect(packageJson.exports).toBeDefined();
    expect(Object.keys(packageJson.exports ?? {})).toEqual(
      expect.arrayContaining([...expectedPublicSubpaths])
    );
  });

  it(
    "loads the runtime-safe public subpaths from the public syncorejs surface",
    async () => {
    const [
      rootModule,
      cliModule,
      browserModule,
      browserReactModule,
      reactModule,
      svelteModule,
      nodeModule,
      nodeIpcModule,
      nodeIpcReactModule,
      nextModule,
      nextConfigModule
    ] = await Promise.all(runtimeImportableSubpaths.map((entry) => import(entry)));

    expect(rootModule.createFunctionReferenceFor).toBeTypeOf("function");
    expect(cliModule.runSyncoreCli).toBeTypeOf("function");
    expect(browserModule.createBrowserSyncoreRuntime).toBeTypeOf("function");
    expect(browserModule.createWebSyncoreRuntime).toBeTypeOf("function");
    expect(browserModule.createBrowserWorkerClient).toBeTypeOf("function");
    expect(browserReactModule.SyncoreBrowserProvider).toBeTypeOf("function");
    expect(reactModule.useQuery).toBeTypeOf("function");
    expect(svelteModule.createQueryStore).toBeTypeOf("function");
    expect(nodeModule.createNodeSyncoreRuntime).toBeTypeOf("function");
    expect(nodeIpcModule.createRendererSyncoreClient).toBeTypeOf("function");
    expect(nodeIpcReactModule.SyncoreElectronProvider).toBeTypeOf("function");
    expect(nextModule.createNextSyncoreClient).toBeTypeOf("function");
    expect(nextConfigModule.withSyncoreNext).toBeTypeOf("function");

    const nextConfig = nextConfigModule.withSyncoreNext({
      output: "export"
    });
    expect(nextConfig).toMatchObject({ output: "export" });
    },
    20_000
  );

  it("keeps examples free of packages/*/dist imports", async () => {
    const exampleRoot = path.join(workspaceRoot, "examples");
    const violations = await collectDistImportViolations(exampleRoot);

    expect(violations).toEqual([]);
  }, 20_000);
});

async function collectDistImportViolations(rootDir: string): Promise<string[]> {
  const violations: string[] = [];
  await walkFiles(rootDir, async (filePath) => {
    if (!/\.(?:[cm]?ts|[cm]?tsx|[cm]?js|[cm]?jsx)$/.test(filePath)) {
      return;
    }
    const content = await readFile(filePath, "utf8");
    if (!/packages(?:\/|\\)[^"'`\r\n]+(?:\/|\\)dist(?:\/|\\)/.test(content)) {
      return;
    }
    violations.push(path.relative(workspaceRoot, filePath));
  });
  return violations.sort();
}

async function walkFiles(
  rootDir: string,
  visit: (filePath: string) => Promise<void>
): Promise<void> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (
      entry.name === "node_modules" ||
      entry.name === ".next" ||
      entry.name === "dist" ||
      entry.name === "out" ||
      entry.name === "build"
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      await walkFiles(fullPath, visit);
      continue;
    }
    await visit(fullPath);
  }
}
