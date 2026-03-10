import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

export const workspaceRoot = path.resolve(scriptsDir, "..");
export const syncorePackageRoot = path.join(
  workspaceRoot,
  "packages",
  "syncore"
);
export const syncorePublishedPackageName = "syncorejs";
export const syncoreDistDir = path.join(syncorePackageRoot, "dist");
export const syncoreVendorDir = path.join(syncoreDistDir, "_vendor");
export const syncoreVendorLockDir = path.join(syncoreDistDir, ".vendor-lock");

export interface InternalPackageConfig {
  name: string;
  sourceDir: string;
  outputDir: string;
}

export interface ExecOptions {
  createCwd?: boolean;
}

export const syncoreInternalPackages: InternalPackageConfig[] = [
  createInternalPackage("@syncore/schema", "schema"),
  createInternalPackage("@syncore/devtools-protocol", "devtools-protocol"),
  createInternalPackage("@syncore/core", "core"),
  createInternalPackage("@syncore/cli", "cli"),
  createInternalPackage("@syncore/react", "react"),
  createInternalPackage("@syncore/platform-web", "platform-web"),
  createInternalPackage("@syncore/platform-node", "platform-node"),
  createInternalPackage("@syncore/platform-expo", "platform-expo"),
  createInternalPackage("@syncore/next", "next"),
  createInternalPackage("@syncore/svelte", "svelte")
];

export const runtimeReplacements = new Map<string, string>([
  ["@syncore/schema", "./_vendor/schema/index.js"],
  ["@syncore/devtools-protocol", "./_vendor/devtools-protocol/index.js"],
  ["@syncore/core", "./_vendor/core/index.mjs"],
  ["@syncore/core/cli", "./_vendor/core/cli.mjs"],
  ["@syncore/cli", "./_vendor/cli/index.mjs"],
  ["@syncore/react", "./_vendor/react/index.js"],
  ["@syncore/platform-web", "./_vendor/platform-web/index.js"],
  ["@syncore/platform-web/react", "./_vendor/platform-web/react.js"],
  ["@syncore/platform-node", "./_vendor/platform-node/index.mjs"],
  ["@syncore/platform-node/ipc", "./_vendor/platform-node/ipc.mjs"],
  ["@syncore/platform-node/ipc/react", "./_vendor/platform-node/ipc-react.mjs"],
  ["@syncore/platform-expo", "./_vendor/platform-expo/index.js"],
  ["@syncore/platform-expo/react", "./_vendor/platform-expo/react.js"],
  ["@syncore/next", "./_vendor/next/index.js"],
  ["@syncore/next/config", "./_vendor/next/config.js"],
  ["@syncore/svelte", "./_vendor/svelte/index.js"]
]);

export const typeReplacements = new Map<string, string>([
  ["@syncore/schema", "./_vendor/schema/index.d.ts"],
  ["@syncore/devtools-protocol", "./_vendor/devtools-protocol/index.d.ts"],
  ["@syncore/core", "./_vendor/core/index.d.mts"],
  ["@syncore/core/cli", "./_vendor/core/cli.d.mts"],
  ["@syncore/cli", "./_vendor/cli/index.d.mts"],
  ["@syncore/react", "./_vendor/react/index.d.ts"],
  ["@syncore/platform-web", "./_vendor/platform-web/index.d.ts"],
  ["@syncore/platform-web/react", "./_vendor/platform-web/react.d.ts"],
  ["@syncore/platform-node", "./_vendor/platform-node/index.d.mts"],
  ["@syncore/platform-node/ipc", "./_vendor/platform-node/ipc.d.mts"],
  [
    "@syncore/platform-node/ipc/react",
    "./_vendor/platform-node/ipc-react.d.mts"
  ],
  ["@syncore/platform-expo", "./_vendor/platform-expo/index.d.ts"],
  ["@syncore/platform-expo/react", "./_vendor/platform-expo/react.d.ts"],
  ["@syncore/next", "./_vendor/next/index.d.ts"],
  ["@syncore/next/config", "./_vendor/next/config.d.ts"],
  ["@syncore/svelte", "./_vendor/svelte/index.d.ts"]
]);

export async function vendorSyncoreInternals(): Promise<void> {
  await withVendorLock(async () => {
    await rm(syncoreVendorDir, { recursive: true, force: true });
    await mkdir(syncoreVendorDir, { recursive: true });

    for (const pkg of syncoreInternalPackages) {
      await cp(pkg.sourceDir, pkg.outputDir, { recursive: true, force: true });
      await rewriteTree(pkg.outputDir, (content, filePath) =>
        rewriteInternalImports(content, filePath, pkg.outputDir)
      );
    }

    await rewriteTree(syncoreDistDir, (content, filePath) =>
      rewritePublicEntry(content, filePath)
    );

    await assertVendoredArtifactsExist();
  });
}

async function withVendorLock<T>(callback: () => Promise<T>): Promise<T> {
  await mkdir(syncoreDistDir, { recursive: true });

  const deadline = Date.now() + 120_000;
  while (true) {
    try {
      await mkdir(syncoreVendorLockDir);
      break;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for the Syncore packaging lock.");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  try {
    return await callback();
  } finally {
    await rm(syncoreVendorLockDir, { recursive: true, force: true });
  }
}

export async function rewriteTree(
  rootDir: string,
  transform: (content: string, filePath: string) => string
): Promise<void> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await rewriteTree(fullPath, transform);
      continue;
    }
    if (!isTextArtifact(fullPath)) {
      continue;
    }
    const current = await readFile(fullPath, "utf8");
    const next = transform(current, fullPath);
    if (next !== current) {
      await writeFile(fullPath, next);
    }
  }
}

export function rewritePublicEntry(content: string, filePath: string): string {
  if (
    !isInside(filePath, syncoreDistDir) ||
    isInside(filePath, syncoreVendorDir)
  ) {
    return content;
  }
  const replacements = isTypeArtifact(filePath)
    ? typeReplacements
    : runtimeReplacements;
  let next = content;
  for (const [specifier, replacement] of replacements) {
    next = replaceModuleSpecifier(next, specifier, replacement);
  }
  return next;
}

export function rewriteInternalImports(
  content: string,
  filePath: string,
  packageRootDir: string
): string {
  const replacements = isTypeArtifact(filePath)
    ? typeReplacements
    : runtimeReplacements;
  let next = content;
  for (const [specifier, replacementFromDist] of replacements) {
    const absoluteTarget = path.join(
      syncoreDistDir,
      replacementFromDist.split("/").join(path.sep)
    );
    const relativeTarget = toPosixRelative(
      path.dirname(filePath),
      absoluteTarget
    );
    next = replaceModuleSpecifier(next, specifier, relativeTarget);
  }
  if (packageRootDir.includes(`${path.sep}core`)) {
    if (filePath.endsWith(`${path.sep}index.mjs`)) {
      next = next.replace(
        /export \* from "[^"]+schema\/index\.js";/,
        'export * from "../schema/index.js";'
      );
    }
    if (filePath.endsWith(`${path.sep}index.d.mts`)) {
      next = next.replace(
        /export \* from "[^"]+schema\/index\.d\.ts";/,
        'export * from "../schema/index.d.ts";'
      );
    }
  }
  return next;
}

export function replaceModuleSpecifier(
  content: string,
  specifier: string,
  replacement: string
): string {
  const escaped = escapeRegex(specifier);
  return content
    .replace(new RegExp(`from "${escaped}"`, "g"), `from "${replacement}"`)
    .replace(new RegExp(`from '${escaped}'`, "g"), `from '${replacement}'`)
    .replace(
      new RegExp(`export * from "${escaped}"`, "g"),
      `export * from "${replacement}"`
    )
    .replace(
      new RegExp(`export * from '${escaped}'`, "g"),
      `export * from '${replacement}'`
    )
    .replace(
      new RegExp(`import("${escaped}")`, "g"),
      `import("${replacement}")`
    )
    .replace(
      new RegExp(`import('${escaped}')`, "g"),
      `import('${replacement}')`
    );
}

export async function execCommand(
  command: string,
  args: string[],
  cwd: string,
  options: ExecOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  if (options.createCwd) {
    await mkdir(cwd, { recursive: true });
  }
  try {
    return await execFileAsync(command, args, {
      cwd,
      env: process.env,
      windowsHide: true
    });
  } catch (error) {
    const stdout =
      error instanceof Error && "stdout" in error
        ? typeof error.stdout === "string"
          ? error.stdout
          : String(error.stdout)
        : "";
    const stderr =
      error instanceof Error && "stderr" in error
        ? typeof error.stderr === "string"
          ? error.stderr
          : String(error.stderr)
        : "";
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}${stdout ? `\nSTDOUT:\n${stdout}` : ""}${stderr ? `\nSTDERR:\n${stderr}` : ""}`
    );
  }
}

export async function walkFiles(
  rootDir: string,
  visitor: (filePath: string) => Promise<void>
): Promise<void> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, visitor);
    } else {
      await visitor(fullPath);
    }
  }
}

export function isTextArtifact(filePath: string): boolean {
  return /\.(?:[cm]?js|d\.[cm]?ts|map)$/.test(filePath);
}

export function isTypeArtifact(filePath: string): boolean {
  return /d\.[cm]?ts$/.test(filePath);
}

export function isInside(filePath: string, parentDir: string): boolean {
  const relative = path.relative(parentDir, filePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

export function toPosixRelative(fromDir: string, toFile: string): string {
  let relative = path.relative(fromDir, toFile).split(path.sep).join("/");
  if (!relative.startsWith(".")) {
    relative = `./${relative}`;
  }
  return relative;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAlreadyExistsError(
  error: unknown
): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

export async function assertVendoredArtifactsExist(): Promise<void> {
  const requiredFiles = [
    path.join(syncoreVendorDir, "core", "index.mjs"),
    path.join(syncoreVendorDir, "cli", "index.mjs"),
    path.join(syncoreVendorDir, "schema", "index.js"),
    path.join(syncoreVendorDir, "react", "index.js"),
    path.join(syncoreVendorDir, "platform-web", "index.js"),
    path.join(syncoreVendorDir, "platform-node", "index.mjs")
  ];
  for (const filePath of requiredFiles) {
    await stat(filePath);
  }
}

function createInternalPackage(
  name: string,
  folderName: string
): InternalPackageConfig {
  return {
    name,
    sourceDir: path.join(workspaceRoot, "packages", folderName, "dist"),
    outputDir: path.join(syncoreVendorDir, folderName)
  };
}
