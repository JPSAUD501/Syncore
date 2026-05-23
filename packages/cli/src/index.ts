#!/usr/bin/env node

import { runSyncoreCli } from "./app.js";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSupportedNodeVersion, installCliWarningFilters } from "./preflight.js";

export { runSyncoreCli };

installCliWarningFilters();
ensureSupportedNodeVersion();

function isDirectInvocation(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }

  const normalizedEntry = path.normalize(path.resolve(entry)).toLowerCase();
  if (normalizedEntry.endsWith(path.join("packages", "cli", "src", "index.ts"))) {
    return true;
  }

  try {
    return (
      realpathSync(path.resolve(entry)) ===
      realpathSync(path.resolve(fileURLToPath(moduleUrl)))
    );
  } catch {
    return false;
  }
}

if (isDirectInvocation(import.meta.url)) {
  void runSyncoreCli()
    .then(() => {
      process.exit(process.exitCode ?? 0);
    })
    .catch((error) => {
      process.nextTick(() => {
        throw error;
      });
    });
}
