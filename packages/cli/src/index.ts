#!/usr/bin/env node

import { runSyncoreCli } from "./app.js";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSupportedNodeVersion, installCliWarningFilters } from "./preflight.js";

export { runSyncoreCli };

installCliWarningFilters();
ensureSupportedNodeVersion();

if (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(path.resolve(fileURLToPath(import.meta.url)))
) {
  await runSyncoreCli();
}
