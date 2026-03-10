#!/usr/bin/env node

import { runSyncoreCli } from "./app.js";
import { ensureSupportedNodeVersion, installCliWarningFilters } from "./preflight.js";

installCliWarningFilters();
ensureSupportedNodeVersion();

await runSyncoreCli();
