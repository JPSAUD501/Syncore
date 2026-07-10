import process from "node:process";
import { readFileSync } from "node:fs";

const MINIMUM_NODE_MAJOR = 22;

declare const __SYNCORE_CLI_VERSION__: string | undefined;

function resolveCliVersion(): string {
  if (typeof __SYNCORE_CLI_VERSION__ !== "undefined") {
    return __SYNCORE_CLI_VERSION__;
  }

  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  ) as { version: string };
  return packageJson.version;
}

export const CLI_VERSION = resolveCliVersion();

export function installCliWarningFilters(): void {
  const originalEmitWarning = process.emitWarning.bind(process);
  const originalEmit = process.emit.bind(process);

  function shouldSuppressSQLiteWarning(warning: unknown): boolean {
    const message =
      typeof warning === "string"
        ? warning
        : warning instanceof Error
          ? warning.message
          : String(warning);
    return /SQLite is an experimental feature/i.test(message);
  }

  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    if (shouldSuppressSQLiteWarning(warning)) {
      return;
    }

    return (originalEmitWarning as (...input: unknown[]) => void)(warning, ...args);
  }) as typeof process.emitWarning;

  process.emit = ((event: string | symbol, ...args: unknown[]) => {
    if (event === "warning" && shouldSuppressSQLiteWarning(args[0])) {
      return false;
    }
    return (originalEmit as (...input: unknown[]) => boolean)(event, ...args);
  }) as typeof process.emit;
}

export function ensureSupportedNodeVersion(): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (Number.isNaN(major) || major < MINIMUM_NODE_MAJOR) {
    const message = [
      `Syncore requires Node ${MINIMUM_NODE_MAJOR}+ and detected ${process.versions.node}.`,
      "Upgrade Node and rerun the command.",
      "The Syncore CLI depends on the stable Node 22 runtime surface, including local SQLite support."
    ].join("\n");
    throw new Error(message);
  }
}

