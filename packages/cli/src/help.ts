import type { Command } from "commander";

import { CLI_VERSION } from "./preflight.js";

const ROOT_DESCRIPTION = [
  "Local-first product CLI for Syncore projects.",
  "",
  "Recommended flow:",
  "  1. npx syncorejs init",
  "  2. npx syncorejs dev",
  "  3. npx syncorejs targets",
  "  4. npx syncorejs run/data/logs"
].join("\n");

const ROOT_HELP_AFTER = [
  "",
  "Command groups:",
  "  Setup: init, dev, codegen, migrate",
  "  Inspect: doctor, targets, logs",
  "  Operate: run, data, import, export",
  "  Reference: dashboard, docs",
  "",
  "Examples:",
  "  npx syncorejs dev",
  "  npx syncorejs targets",
  "  npx syncorejs run tasks/list --target project",
  "  npx syncorejs run tasks/list --target client:abc123",
  "  npx syncorejs data tasks --target project",
  "  npx syncorejs logs --target all --watch"
].join("\n");

export function applyRootHelp(program: Command): void {
  program
    .description(ROOT_DESCRIPTION)
    .version(CLI_VERSION)
    .addHelpText("after", ROOT_HELP_AFTER);
}

