import type { Command } from "commander";

import { CLI_VERSION } from "./preflight.js";

const ROOT_DESCRIPTION = [
  "Local-first product CLI for Syncore projects."
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
  "  npx syncorejs run tasks/list --target 10427",
  "  npx syncorejs data tasks --target project",
  "  npx syncorejs logs --target all --watch"
].join("\n");

export function applyRootHelp(program: Command): void {
  program
    .description(ROOT_DESCRIPTION)
    .version(CLI_VERSION)
    .addHelpText("after", ROOT_HELP_AFTER);
}
