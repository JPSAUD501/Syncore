import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import type { SyncoreDevtoolsSubscriptionResultPayload } from "@syncore/devtools-protocol";
import {
  createSchemaSnapshot,
  diffSchemaSnapshots,
  renderMigrationSql
} from "@syncore/core";
import {
  type SyncoreTemplateName,
  VALID_SYNCORE_TEMPLATES,
  applyProjectMigrations,
  detectProjectTemplate,
  formatError,
  getNextMigrationNumber,
  hasSyncoreProject,
  isLocalPortInUse,
  loadProjectSchema,
  readStoredSnapshot,
  resolveRequestedTemplate,
  runCodegen,
  runDevProjectBootstrap,
  scaffoldProject,
  slugify,
  startDevHub,
  writeStoredSnapshot
} from "@syncore/core/cli";
import { CliContext, type CliChoice, type GlobalCliOptions, openTarget } from "./context.js";
import { runShellCommand, printCompactDevPhase, printDevSessionIntro, withConsoleCapture } from "./dev-session.js";
import { buildDoctorReport } from "./doctor.js";
import { applyRootHelp } from "./help.js";
import {
  buildDevBootstrapNextSteps,
  buildInitNextSteps,
  buildTargetCommandNextSteps,
  buildHubUnavailableNextSteps,
  templateUsesConnectedClients
} from "./messages.js";
import {
  buildRuntimeLookup,
  type ClientRuntimeLookupEntry,
  type ClientTargetDescriptor,
  type TargetCapability,
  connectToProjectHub,
  createPublicRuntimeId,
  createManagedProjectClient,
  exportProjectData,
  importProjectData,
  isKnownTemplate,
  listAvailableTargets,
  listConnectedClientTargets,
  listProjectTables,
  loadImportDocumentBatches,
  readProjectTable,
  resolveDashboardUrl,
  resolveDevtoolsUrl,
  resolveDocsTarget,
  resolveProjectFunction,
  targetSupportsCapability,
  writeExportData
} from "./project.js";
import {
  type JsonLikeFormat,
  type PersistedLogEntry,
  printDevReadySummary,
  printDoctorReport,
  printTargetsTable,
  renderOutput
} from "./render.js";
import { resolveClientRuntime, resolveOperationalTarget } from "./targets.js";

interface InitCommandOptions {
  template: SyncoreTemplateName | "auto";
  force?: boolean;
}

interface DevCommandOptions {
  template: string;
  once?: boolean;
  openDashboard?: boolean;
  untilSuccess?: boolean;
  run?: string;
  runSh?: string;
}

interface RunCommandOptions {
  watch?: boolean;
  format: JsonLikeFormat;
  target?: string;
  runtime?: string;
}

interface DataCommandOptions {
  limit: string;
  order?: "asc" | "desc";
  format: JsonLikeFormat;
  target?: string;
  runtime?: string;
  watch?: boolean;
}

interface ImportCommandOptions {
  table?: string;
  target?: string;
  runtime?: string;
}

interface ExportCommandOptions {
  path: string;
  table?: string;
  target?: string;
  runtime?: string;
}

interface LogsCommandOptions {
  target?: string;
  runtime?: string;
  limit: string;
  watch?: boolean;
  kind?: "query" | "mutation" | "action" | "system";
  format: JsonLikeFormat;
}

interface TargetsCommandOptions {
  onlineOnly?: boolean;
  capability?: TargetCapability;
}

interface OpenCommandOptions {
  open?: boolean;
}

export async function runSyncoreCli(argv = process.argv): Promise<void> {
  const program = buildProgram();

  if (argv.length <= 2) {
    argv = [...argv, "--help"];
  }

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const context = new CliContext(parseGlobalOptionsFromArgv(argv));
    context.handleError(error);
  }
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("syncorejs")
    .usage("<command> [options]")
    .option("--cwd <path>", "Run the command as if started from the given directory")
    .option("--json", "Emit machine-readable JSON output")
    .option("--verbose", "Print additional diagnostics")
    .option("--no-interactive", "Disable prompts and terminal UX")
    .option("-y, --yes", "Assume yes for confirmations")
    .showHelpAfterError()
    .showSuggestionAfterError()
    .helpCommand("help <command>", "Show help for a command");
  applyRootHelp(program);

  addInitCommand(program);
  addCodegenCommand(program);
  addDoctorCommand(program);
  addTargetsCommand(program);
  addDevCommand(program);
  addMigrateCommand(program);
  addRunCommand(program);
  addDataCommand(program);
  addImportCommand(program);
  addExportCommand(program);
  addLogsCommand(program);
  addDashboardCommand(program);
  addDocsCommand(program);

  return program;
}

function addInitCommand(program: Command): void {
  program
    .command("init")
    .summary("Scaffold Syncore into the current project")
    .description("Scaffold Syncore files, scripts, and generated types into the selected directory.")
    .option(
      "--template <template>",
      `Template to scaffold (${VALID_SYNCORE_TEMPLATES.join(", ")}, or auto)`,
      "auto"
    )
    .option("--force", "Overwrite Syncore-managed files")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  npx syncorejs init",
        "  npx syncorejs init --template react-web",
        "  npx syncorejs init --cwd ./examples/my-app"
      ].join("\n")
    )
    .action(async (options: InitCommandOptions, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        if (
          !options.force &&
          !(await isDirectoryEmpty(ctx.cwd)) &&
          !(await ctx.confirm(
            "The target directory is not empty. Continue scaffolding into it?",
            false
          ))
        ) {
          ctx.fail("Scaffolding cancelled by user.", 1);
        }

        let template = options.template;
        if (template === "auto") {
          const detectedTemplate = await detectProjectTemplate(ctx.cwd);
          template =
            detectedTemplate === "minimal" && ctx.interactive
              ? await promptForTemplate(ctx, detectedTemplate)
              : detectedTemplate;
        }

        if (!isKnownTemplate(template)) {
          ctx.fail(
            `Unknown template ${JSON.stringify(template)}. Expected one of ${VALID_SYNCORE_TEMPLATES.join(", ")} or auto.`
          );
        }
        const resolvedTemplate: SyncoreTemplateName = template;

        const result = await ctx.withSpinner("Scaffolding Syncore", async () =>
          scaffoldProject(ctx.cwd, {
            template: resolvedTemplate,
            ...(options.force ? { force: true } : {})
          })
        );
        await ctx.withSpinner("Generating typed references", async () =>
          runCodegen(ctx.cwd)
        );

        ctx.printResult({
          summary: `Syncore scaffolded with the ${resolvedTemplate} template.`,
          command: "init",
          data: result,
          nextSteps: buildInitNextSteps(resolvedTemplate)
        });

        if (!ctx.json) {
          printScaffoldChanges(ctx, result);
        }
      });
    });
}

function addCodegenCommand(program: Command): void {
  program
    .command("codegen")
    .summary("Generate typed Syncore references")
    .description("Regenerate syncore/_generated from the current syncore/functions tree.")
    .addHelpText(
      "after",
      ["", "Examples:", "  npx syncorejs codegen", "  npx syncorejs codegen --cwd ./apps/web"].join(
        "\n"
      )
    )
    .action(async (_options: Record<string, never>, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        await ctx.withSpinner("Generating typed references", async () =>
          runCodegen(ctx.cwd)
        );
        ctx.printResult({
          summary: "Generated syncore/_generated files.",
          command: "codegen"
        });
      });
    });
}

function addDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .summary("Inspect the current Syncore project state")
    .description("Check project structure, template capabilities, hub state, and available targets.")
    .addHelpText(
      "after",
      ["", "Examples:", "  npx syncorejs doctor", "  npx syncorejs doctor --json"].join("\n")
    )
    .action(async (_options: Record<string, never>, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        const report = await buildDoctorReport(ctx.cwd);
        if (ctx.json) {
          ctx.printResult({
            command: "doctor",
            data: report
          });
          return;
        }

        ctx.info(`Detected template: ${report.template}`);
        ctx.info(`Project status: ${report.status}`);
        ctx.info(
          `Project target: ${report.projectTarget ? report.projectTarget.databasePath : "not configured"}`
        );
        ctx.info(`Devtools hub: ${report.hub.running ? report.hub.url : "not running"}`);
        printDoctorReport(report, {
          verbose: ctx.verbose
        });
        if (report.workspaceMatches.length > 0) {
          ctx.warn("You appear to be at a workspace root instead of inside an app package.");
          for (const match of report.workspaceMatches) {
            process.stdout.write(
              `  - ${match.relativePath} (${match.template}) -> use --cwd ${match.relativePath}\n`
            );
          }
        }
        for (const suggestion of report.suggestions) {
          ctx.nextStep(suggestion);
        }
      });
    });
}

function addTargetsCommand(program: Command): void {
  program
    .command("targets")
    .summary("List available Syncore targets")
    .description("Inspect project and connected client targets for run, data, import, export, and logs.")
    .option("--online-only", "Only show online targets")
    .option(
      "--capability <capability>",
      "Filter targets by capability: run, readData, writeData, exportData, streamLogs"
    )
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  npx syncorejs targets",
        "  npx syncorejs targets --capability run",
        "  npx syncorejs targets --json"
      ].join("\n")
    )
    .action(async (options: TargetsCommandOptions, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        if (options.capability && !isTargetCapability(options.capability)) {
          ctx.fail(
            `Unknown capability ${JSON.stringify(options.capability)}. Expected run, readData, writeData, exportData, or streamLogs.`
          );
        }
        const targets = await listAvailableTargets(ctx.cwd);
        const filtered = targets.filter((target) => {
          if (options.onlineOnly && !target.online) {
            return false;
          }
          if (options.capability && !targetSupportsCapability(target, options.capability)) {
            return false;
          }
          return true;
        });

        ctx.printResult({
          command: "targets",
          summary: `Found ${filtered.length} target(s).`,
          data: filtered,
          nextSteps: buildTargetCommandNextSteps(filtered[0]?.id)
        });

        if (!ctx.json) {
          printTargetsTable(filtered, {
            verbose: ctx.verbose
          });
        }
      });
    });
}

function addDevCommand(program: Command): void {
  program
    .command("dev")
    .summary("Run the Syncore development loop")
    .description(
      "Bootstrap the local Syncore project, start the hub, discover targets, and keep the local workflow in sync."
    )
    .option(
      "--template <template>",
      `Template to scaffold when Syncore is missing (${VALID_SYNCORE_TEMPLATES.join(", ")}, or auto)`,
      "auto"
    )
    .option("--once", "Run bootstrap once and exit")
    .option("--until-success", "Retry bootstrap until it succeeds")
    .option("--run <function>", "Run a Syncore function after bootstrap succeeds")
    .option("--run-sh <command>", "Run a shell command after bootstrap succeeds")
    .option("--open-dashboard", "Open the dashboard URL even in non-interactive mode")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  npx syncorejs dev",
        "  npx syncorejs dev --once",
        "  npx syncorejs dev --until-success",
        "  npx syncorejs dev --run tasks/list",
        "  npx syncorejs dev --open-dashboard",
        "  npx syncorejs dev --run-sh \"npm run dev\""
      ].join("\n")
    )
    .action(async (options: DevCommandOptions, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        if (options.run && options.runSh) {
          ctx.fail("`syncorejs dev` accepts either --run or --run-sh, not both.");
        }
        const shouldOpenDashboard =
          Boolean(options.openDashboard) || isRealInteractiveTerminal(ctx);
        await ensureLocalPortConfiguration(ctx);

        const template = await resolveRequestedTemplate(ctx.cwd, options.template);
        printDevSessionIntro(ctx);
        await ensureDevProjectExists(ctx, template);

        if (options.once) {
          await runDevBootstrapLoop(ctx, template, options.untilSuccess ?? false);
          await runDevFollowup(ctx, options);
          const targets = await listAvailableTargets(ctx.cwd);
          ctx.printResult({
            summary: "Syncore dev bootstrap completed.",
            command: "dev",
            nextSteps: buildDevBootstrapNextSteps()
          });
          if (!ctx.json) {
            printDevReadySummary(ctx, {
              template,
              projectTargetConfigured: targets.some((target) => target.kind === "project"),
              dashboardUrl: resolveDashboardUrl(),
              devtoolsUrl: resolveDevtoolsUrl(),
              targets
            });
          }
          return;
        }

        await runDevBootstrapLoop(ctx, template, options.untilSuccess ?? false);
        const targets = await listAvailableTargets(ctx.cwd);
        printDevReadySummary(ctx, {
          template,
          projectTargetConfigured: targets.some((target) => target.kind === "project"),
          dashboardUrl: resolveDashboardUrl(),
          devtoolsUrl: resolveDevtoolsUrl(),
          targets
        });

        await startManagedDevHub(ctx, template);
        await maybeOpenDashboard(ctx, shouldOpenDashboard);
        await monitorLiveDevSession(ctx, template);
      });
    });
}

function isRealInteractiveTerminal(context: CliContext): boolean {
  return context.interactive && Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function maybeOpenDashboard(
  context: CliContext,
  shouldOpenDashboard: boolean
): Promise<void> {
  if (!shouldOpenDashboard) {
    return;
  }
  const opened = await openTarget(resolveDashboardUrl());
  if (opened) {
    context.info(`Opened dashboard at ${resolveDashboardUrl()}.`);
    return;
  }
  context.warn("Unable to open the dashboard automatically.");
}

function addMigrateCommand(program: Command): void {
  const migrate = program
    .command("migrate")
    .summary("Generate and apply local SQL migrations")
    .description("Work with schema diffs, migration SQL, and the local Syncore database.");

  migrate
    .command("status")
    .summary("Show the current schema diff status")
    .action(async (_options: Record<string, never>, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        const schema = await loadProjectSchema(ctx.cwd);
        const currentSnapshot = createSchemaSnapshot(schema);
        const storedSnapshot = await readStoredSnapshot(ctx.cwd);
        const plan = diffSchemaSnapshots(storedSnapshot, currentSnapshot);

        ctx.printResult({
          summary: "Migration status computed.",
          command: "migrate status",
          data: {
            currentSchemaHash: currentSnapshot.hash,
            storedSchemaHash: storedSnapshot?.hash ?? null,
            statements: plan.statements,
            warnings: plan.warnings,
            destructiveChanges: plan.destructiveChanges
          }
        });

        if (!ctx.json) {
          process.stdout.write(`Current schema hash: ${currentSnapshot.hash}\n`);
          process.stdout.write(`Stored snapshot: ${storedSnapshot?.hash ?? "none"}\n`);
          process.stdout.write(`Statements to generate: ${plan.statements.length}\n`);
          process.stdout.write(`Warnings: ${plan.warnings.length}\n`);
          process.stdout.write(`Destructive changes: ${plan.destructiveChanges.length}\n`);
          for (const warning of plan.warnings) {
            ctx.warn(warning);
          }
          for (const change of plan.destructiveChanges) {
            ctx.error(change);
          }
        }
      });
    });

  migrate
    .command("generate")
    .argument("[name]", "Optional migration name", "auto")
    .summary("Generate a SQL migration from the current schema diff")
    .action(
      async (name: string, _options: Record<string, never>, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        const schema = await loadProjectSchema(ctx.cwd);
        const currentSnapshot = createSchemaSnapshot(schema);
        const storedSnapshot = await readStoredSnapshot(ctx.cwd);
        const plan = diffSchemaSnapshots(storedSnapshot, currentSnapshot);

        if (plan.destructiveChanges.length > 0) {
          ctx.fail(
            `Destructive schema changes require a manual migration: ${plan.destructiveChanges.join("; ")}`
          );
        }
        if (plan.statements.length === 0 && plan.warnings.length === 0) {
          ctx.printResult({
            summary: "No schema changes detected."
          });
          return;
        }

        const migrationsDirectory = path.join(ctx.cwd, "syncore", "migrations");
        await mkdir(migrationsDirectory, { recursive: true });
        const migrationNumber = await getNextMigrationNumber(migrationsDirectory);
        const slug = slugify(name);
        const fileName = `${String(migrationNumber).padStart(4, "0")}_${slug}.sql`;
        const migrationSql = renderMigrationSql(plan, {
          title: `Syncore migration ${fileName}`
        });
        await writeFile(path.join(migrationsDirectory, fileName), migrationSql);
        await writeStoredSnapshot(ctx.cwd, currentSnapshot);

        ctx.printResult({
          summary: `Generated syncore/migrations/${fileName}.`,
          command: "migrate generate",
          data: {
            path: path.join("syncore", "migrations", fileName),
            statements: plan.statements,
            warnings: plan.warnings
          },
          nextSteps: ["Run `npx syncorejs migrate apply` to apply pending migrations."]
        });
      });
      }
    );

  migrate
    .command("apply")
    .summary("Apply SQL migrations to the local database")
    .action(async (_options: Record<string, never>, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        const appliedCount = await ctx.withSpinner("Applying migrations", async () =>
          applyProjectMigrations(ctx.cwd)
        );
        ctx.printResult({
          summary: `Applied ${appliedCount} migration(s).`,
          command: "migrate apply"
        });
      });
    });
}

function addRunCommand(program: Command): void {
  program
    .command("run")
    .summary("Run a local Syncore function")
    .description("Execute a query, mutation, or action against the local runtime.")
    .argument("<functionName>", "Function name like tasks/list or api.tasks.list")
    .argument("[args]", "JSON object of arguments", "{}")
    .option("--watch", "Watch a query for local changes")
    .option("--target <target>", "Target id: project or a 5-digit client target id")
    .option("--runtime <runtime>", "Runtime id inside the selected client target")
    .option(
      "--format <format>",
      "Output format: pretty, json, or jsonl",
      "pretty"
    )
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  npx syncorejs run tasks/list",
        "  npx syncorejs run api.tasks.create '{\"text\":\"Ship Syncore\"}' --target project",
        "  npx syncorejs run tasks/list --watch --target 10427 --runtime 20318 --format json"
      ].join("\n")
    )
    .action(
      async (
        functionName: string,
        argsText: string,
        options: RunCommandOptions,
        command: Command
      ) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        if (options.runtime && !options.target) {
          ctx.fail("`syncorejs run --runtime` requires --target.");
        }
        const resolved = await resolveProjectFunction(ctx.cwd, functionName);
        const args = parseJsonObject(argsText, "Function arguments");

        if (options.watch && resolved.definition.kind !== "query") {
          ctx.fail("`syncorejs run --watch` only supports query functions.");
        }

        const target = await resolveOperationalTarget(ctx, options.target, {
          command: "run",
          capability: "run"
        });
        const runtime = resolveClientRuntime(target, options.runtime, {
          command: "run"
        });
        ctx.info(
          options.watch
            ? `Watching ${resolved.name} on ${target.id}${runtime ? ` (${runtime.id} ${runtime.label})` : ""}.`
            : `Running ${resolved.name} on ${target.id}${runtime ? ` (${runtime.id} ${runtime.label})` : ""}.`
        );
        if (target.kind === "project") {
          const managed = await createManagedProjectClient(ctx.cwd);
          try {
            if (options.watch) {
              const watch = managed.client.watchQuery(
                resolved.reference as never,
                args
              );
              const render = () => {
                const error = watch.localQueryError();
                if (error) {
                  ctx.handleError(error);
                  return;
                }
                renderOutput(ctx, watch.localQueryResult(), options.format);
              };
              const unsubscribe = watch.onUpdate(render);
              ctx.info("Watching query. Press Ctrl+C to stop.");
              await waitForSignal();
              unsubscribe();
              watch.dispose?.();
              return;
            }

            const result =
              resolved.definition.kind === "query"
                ? await managed.client.query(resolved.reference as never, args)
                : resolved.definition.kind === "mutation"
                  ? await managed.client.mutation(
                      resolved.reference as never,
                      args
                    )
                  : await managed.client.action(resolved.reference as never, args);

            renderOutput(ctx, result, options.format);
            return;
          } finally {
            await managed.dispose();
          }
        }

        const hub = await requireHubConnection(ctx);
        try {
          if (options.watch) {
            const unsubscribe = hub.subscribe(runtime!.runtimeId, {
              kind: "fn.watch",
              functionName: resolved.name,
              functionType: "query",
              args
            }, {
              onData(payload) {
                if (payload.kind !== "fn.watch.result") {
                  return;
                }
                if (payload.error) {
                  ctx.handleError(new Error(payload.error));
                  return;
                }
                renderOutput(ctx, payload.result, options.format);
              },
              onError(error) {
                ctx.handleError(new Error(error));
              }
            });
            ctx.info(`Watching query on ${target.id}. Press Ctrl+C to stop.`);
            await waitForSignal();
            unsubscribe();
            return;
          }

          const result = await hub.sendCommand(runtime!.runtimeId, {
            kind: "fn.run",
            functionName: resolved.name,
            functionType: resolved.definition.kind,
            args
          });
          if (result.kind === "fn.run.result") {
            if (result.error) {
              ctx.fail(result.error);
            }
            renderOutput(ctx, result.result, options.format);
            return;
          }
          if (result.kind === "error") {
            ctx.fail(result.message, 1, result);
          }
          ctx.fail(`Unexpected response from ${target.id}.`, 1, result);
        } finally {
          await hub.dispose();
        }
      });
      }
    );
}

function addDataCommand(program: Command): void {
  program
    .command("data")
    .summary("Inspect local Syncore data")
    .description("List tables or print local rows from a specific table.")
    .argument("[table]", "Optional table to inspect")
    .option("--target <target>", "Target id: project or a 5-digit client target id")
    .option("--runtime <runtime>", "Runtime id inside the selected client target")
    .option("--limit <n>", "Maximum rows to print", "100")
    .option("--order <choice>", "Order by _creationTime", "desc")
    .option("--watch", "Watch a table for changes on the selected target")
    .option(
      "--format <format>",
      "Output format: pretty, json, or jsonl",
      "pretty"
    )
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  npx syncorejs data",
        "  npx syncorejs data tasks --target project --limit 10",
        "  npx syncorejs data tasks --target 10427 --runtime 20318 --watch --format jsonl"
      ].join("\n")
    )
    .action(
      async (
        table: string | undefined,
        options: DataCommandOptions,
        command: Command
      ) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        if (options.runtime && !options.target) {
          ctx.fail("`syncorejs data --runtime` requires --target.");
        }
        const target = await resolveOperationalTarget(ctx, options.target, {
          command: "data",
          capability: "readData"
        });
        const runtime = resolveClientRuntime(target, options.runtime, {
          command: "data"
        });
        if (!table) {
          const tables =
            target.kind === "project"
              ? await listProjectTables(ctx.cwd)
              : await listRemoteTables(runtime!.runtimeId, ctx);
          ctx.printResult({
            summary: `Found ${tables.length} table(s) on ${target.id}.`,
            command: "data",
            data: tables,
            target: target.id
          });
          if (!ctx.json) {
            for (const entry of tables) {
              process.stdout.write(
                `  ${entry.name} (${entry.documentCount} document(s))\n`
              );
            }
          }
          return;
        }

        if (target.kind === "project") {
          const payload = await readProjectTable(ctx.cwd, table, {
            limit: Number.parseInt(options.limit, 10),
            order: options.order === "asc" ? "asc" : "desc"
          });
          renderOutput(ctx, payload.rows, options.format);
          return;
        }

        const hub = await requireHubConnection(ctx);
        try {
          const payload = await readRemoteTable(hub, runtime!.runtimeId, table, {
            limit: Number.parseInt(options.limit, 10)
          });
          renderOutput(ctx, payload.rows, options.format);

          if (!options.watch) {
            return;
          }

          const unsubscribe = hub.subscribe(runtime!.runtimeId, {
            kind: "data.table",
            table,
            limit: Number.parseInt(options.limit, 10)
          }, {
            onData(result) {
              if (result.kind !== "data.table.result") {
                return;
              }
              renderOutput(ctx, result.rows, options.format);
            },
            onError(error) {
              ctx.handleError(new Error(error));
            }
          });
          ctx.info(
            `Watching table ${table} on ${target.id} (${runtime!.id} ${runtime!.label}). Press Ctrl+C to stop.`
          );
          await waitForSignal();
          unsubscribe();
        } finally {
          await hub.dispose();
        }
      });
      }
    );
}

function addImportCommand(program: Command): void {
  program
    .command("import")
    .summary("Import local data into Syncore")
    .description("Import JSON, JSONL, directory, or ZIP data into the local Syncore database.")
    .argument("<path>", "Path to a .json, .jsonl, directory, or .zip input")
    .option("--table <table>", "Destination table for single-file imports")
    .option("--target <target>", "Target id: project or a 5-digit client target id")
    .option("--runtime <runtime>", "Runtime id inside the selected client target")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  npx syncorejs import --table tasks sample.jsonl --target project",
        "  npx syncorejs import --table tasks sample.json --target 10427 --runtime 20318",
        "  npx syncorejs import backups/export.zip"
      ].join("\n")
    )
    .action(
      async (
        sourcePath: string,
        options: ImportCommandOptions,
        command: Command
      ) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        if (options.runtime && !options.target) {
          ctx.fail("`syncorejs import --runtime` requires --target.");
        }
        const target = await resolveOperationalTarget(ctx, options.target, {
          command: "import",
          capability: "writeData"
        });
        const runtime = resolveClientRuntime(target, options.runtime, {
          command: "import"
        });
        const preview = await previewImportPlan(ctx, sourcePath, options, target.id);
        if (
          ctx.interactive &&
          !(await ctx.confirm(
            `Import ${preview.totalRows} row(s) into ${target.id}?`,
            true
          ))
        ) {
          ctx.fail("Import cancelled by user.");
        }
        const imported =
          target.kind === "project"
            ? await ctx.withSpinner("Importing local data", async () =>
                importProjectData(ctx.cwd, sourcePath, {
                  ...(options.table ? { table: options.table } : {})
                })
              )
            : await ctx.withSpinner(`Importing data into ${target.id}`, async () =>
                importIntoClientTarget(ctx, target, runtime!, sourcePath, options)
              );
        ctx.printResult({
          summary: `Imported ${imported.reduce((sum, entry) => sum + entry.importedCount, 0)} row(s).`,
          command: "import",
          data: imported,
          target: target.id
        });
        if (!ctx.json) {
          for (const entry of imported) {
            process.stdout.write(
              `  ${entry.table}: ${entry.importedCount} row(s)\n`
            );
          }
        }
      });
      }
    );
}

function addExportCommand(program: Command): void {
  program
    .command("export")
    .summary("Export local Syncore data")
    .description("Export one or more local tables to JSON, JSONL, a directory, or a ZIP file.")
    .requiredOption("--path <path>", "Output path (.json, .jsonl, directory, or .zip)")
    .option("--table <table>", "Export a single table")
    .option("--target <target>", "Target id: project or a 5-digit client target id")
    .option("--runtime <runtime>", "Runtime id inside the selected client target")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  npx syncorejs export --table tasks --path tasks.jsonl --target project",
        "  npx syncorejs export --path ./exports --target 10427 --runtime 20318",
        "  npx syncorejs export --path ./exports.zip"
      ].join("\n")
    )
    .action(async (options: ExportCommandOptions, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        if (options.runtime && !options.target) {
          ctx.fail("`syncorejs export --runtime` requires --target.");
        }
        const target = await resolveOperationalTarget(ctx, options.target, {
          command: "export",
          capability: "exportData"
        });
        const runtime = resolveClientRuntime(target, options.runtime, {
          command: "export"
        });
        const result =
          target.kind === "project"
            ? await ctx.withSpinner("Exporting local data", async () =>
                exportProjectData(ctx.cwd, options.path, {
                  ...(options.table ? { table: options.table } : {})
                })
              )
            : await ctx.withSpinner(`Exporting data from ${target.id}`, async () =>
                exportClientTargetData(ctx, target, runtime!, options)
              );
        ctx.printResult({
          summary: `Exported ${result.tables.length} table(s) to ${result.path}.`,
          command: "export",
          data: result,
          target: target.id
        });
      });
    });
}

function addLogsCommand(program: Command): void {
  program
    .command("logs")
    .summary("Inspect Syncore runtime logs")
    .description("Read persisted hub logs and optionally watch live runtime events.")
    .option("--target <target>", "Target id, or all", "all")
    .option("--runtime <runtime>", "Runtime id inside the selected client target")
    .option("--limit <n>", "Maximum log lines to print", "100")
    .option("--watch", "Stream new logs from the local devtools hub")
    .option("--kind <kind>", "Filter by event kind: query, mutation, action, system")
    .option("--format <format>", "Output format: pretty, json, or jsonl", "pretty")
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  npx syncorejs logs",
        "  npx syncorejs logs --target 10427 --runtime 20318 --watch",
        "  npx syncorejs logs --kind mutation --format jsonl"
      ].join("\n")
    )
    .action(async (options: LogsCommandOptions, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        if (options.runtime && (!options.target || options.target === "all")) {
          ctx.fail("`syncorejs logs --runtime` requires a specific --target.");
        }
        await runLogsCommand(ctx, options);
      });
    });
}

function addDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .summary("Print or open the local dashboard URL")
    .description("Show the local Syncore dashboard URL, optionally opening it in the browser.")
    .option("--open", "Open the dashboard URL")
    .action(async (options: OpenCommandOptions, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        const url = resolveDashboardUrl();
        if (options.open) {
          const opened = await openTarget(url);
          if (!opened) {
            ctx.warn("Unable to open the dashboard automatically.");
          }
        }
        ctx.printResult({
          summary: "Dashboard URL resolved.",
          command: "dashboard",
          data: { url },
          nextSteps: [`Open ${url}`]
        });
      });
    });
}

function addDocsCommand(program: Command): void {
  program
    .command("docs")
    .summary("Print or open the most relevant Syncore docs")
    .description("Resolve the best local docs target for the detected template and optionally open it.")
    .option("--open", "Open the docs target")
    .action(async (options: OpenCommandOptions, command: Command) => {
      const ctx = createContext(command);
      await executeCommand(ctx, async () => {
        const url = await resolveDocsTarget(ctx.cwd);
        if (options.open) {
          const opened = await openTarget(url);
          if (!opened) {
            ctx.warn("Unable to open the docs target automatically.");
          }
        }
        ctx.printResult({
          summary: "Docs target resolved.",
          command: "docs",
          data: { url }
        });
      });
    });
}

function createContext(command: Command): CliContext {
  const options = command.optsWithGlobals<GlobalCliOptions>();
  return new CliContext(options);
}

async function executeCommand(
  context: CliContext,
  action: () => Promise<void>
): Promise<void> {
  try {
    await action();
  } catch (error) {
    context.handleError(error);
  }
}

async function ensureDevProjectExists(
  context: CliContext,
  template: SyncoreTemplateName
): Promise<void> {
  if (await hasSyncoreProject(context.cwd)) {
    return;
  }

  if (!context.interactive) {
    context.fail(
      "No Syncore project was found in this directory. Run `npx syncorejs init` first or rerun in an interactive terminal."
    );
  }

  const shouldScaffold = await context.confirm(
    "No Syncore project was found. Scaffold one now?",
    true
  );
  if (!shouldScaffold) {
    context.fail("Syncore dev cancelled because no project exists.");
  }

  const result = await context.withSpinner("Scaffolding Syncore", async () =>
    scaffoldProject(context.cwd, {
      template
    })
  );
  if (!context.json) {
    printScaffoldChanges(context, result);
  }
}

type ConnectedHub = NonNullable<Awaited<ReturnType<typeof connectToProjectHub>>>;

async function ensureLocalPortConfiguration(context: CliContext): Promise<void> {
  const dashboardUrl = resolveDashboardUrl();
  const devtoolsUrl = resolveDevtoolsUrl();
  const dashboardPort = Number.parseInt(new URL(dashboardUrl).port, 10);
  const devtoolsPort = Number.parseInt(new URL(devtoolsUrl).port, 10);

  if (
    Number.isFinite(dashboardPort) &&
    Number.isFinite(devtoolsPort) &&
    dashboardPort === devtoolsPort
  ) {
    context.fail(
      [
        `Dashboard and devtools cannot share the same port (${dashboardPort}).`,
        "Set different values for SYNCORE_DASHBOARD_PORT and SYNCORE_DEVTOOLS_PORT, then rerun `npx syncorejs dev`."
      ].join(" ")
    );
  }

  if (
    Number.isFinite(dashboardPort) &&
    dashboardPort > 0 &&
    Number.isFinite(devtoolsPort) &&
    devtoolsPort > 0 &&
    (await isLocalPortInUse(dashboardPort)) &&
    !(await isLocalPortInUse(devtoolsPort))
  ) {
    context.warn(
      `Dashboard port ${dashboardPort} is already in use. If Syncore does not start cleanly, set SYNCORE_DASHBOARD_PORT to a different value.`
    );
  }
}

async function runDevBootstrapLoop(
  context: CliContext,
  template: SyncoreTemplateName,
  untilSuccess: boolean
): Promise<void> {
  while (true) {
    try {
      printCompactDevPhase(context, "Project");
      printCompactDevPhase(context, "Codegen");
      printCompactDevPhase(context, "Schema");
      await withConsoleCapture(
        (method, message) => {
          if (/destructive schema changes/i.test(message)) {
            context.error("Syncore dev blocked by destructive schema changes.");
            return;
          }
          if (/Syncore dev warning:/i.test(message) || method === "warn") {
            context.warn(message.replace(/^Syncore dev warning:\s*/i, ""));
            return;
          }
          if (/bootstrap failed/i.test(message) || method === "error") {
            context.error(message);
          }
        },
        async () => runDevProjectBootstrap(context.cwd, template)
      );
      return;
    } catch (error) {
      if (!untilSuccess) {
        throw error;
      }
      context.warn(`Syncore dev bootstrap failed, retrying: ${formatError(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
}

async function startManagedDevHub(
  context: CliContext,
  template: SyncoreTemplateName
): Promise<void> {
  printCompactDevPhase(context, "Hub");
  printCompactDevPhase(context, "Targets");
  await withConsoleCapture(
    (method, message) => {
      if (/already running/i.test(message)) {
        context.info(message.replaceAll("127.0.0.1", "localhost"));
        return;
      }
      if (/Dashboard shell:/i.test(message) || /devtools hub:/i.test(message)) {
        return;
      }
      if (/Watching syncore\//i.test(message)) {
        context.info("Watching syncore/ for changes.");
        return;
      }
      if (/runtime\.disconnected/i.test(message)) {
        context.warn(message);
        return;
      }
      if (method === "warn") {
        context.warn(message);
        return;
      }
      if (method === "error") {
        context.error(message);
      }
    },
    async () =>
      startDevHub({
        cwd: context.cwd,
        template
      })
  );
}

async function runDevFollowup(
  context: CliContext,
  options: DevCommandOptions
): Promise<void> {
  if (options.run) {
    const target = await resolveOperationalTarget(context, undefined, {
      command: "run",
      capability: "run"
    });
    const resolved = await resolveProjectFunction(context.cwd, options.run);
    if (target.kind === "project") {
      const managed = await createManagedProjectClient(context.cwd);
      try {
        const result =
          resolved.definition.kind === "query"
            ? await managed.client.query(resolved.reference as never, {})
            : resolved.definition.kind === "mutation"
              ? await managed.client.mutation(resolved.reference as never, {})
              : await managed.client.action(resolved.reference as never, {});
        renderOutput(context, result, "pretty");
      } finally {
        await managed.dispose();
      }
    } else {
      const hub = await requireHubConnection(context);
      try {
        const result =
          await hub.sendCommand(target.runtimeId, {
            kind: "fn.run",
            functionName: resolved.name,
            functionType: resolved.definition.kind,
            args: {}
          });
        if (result.kind !== "fn.run.result") {
          context.fail(`Unexpected response from ${target.id}.`, 1, result);
        }
        if (result.error) {
          context.fail(result.error, 1, result);
        }
        renderOutput(context, result.result, "pretty");
      } finally {
        await hub.dispose();
      }
    }
  }

  if (options.runSh) {
    await runShellCommand(context, options.runSh);
  }
}

async function monitorLiveDevSession(
  context: CliContext,
  template: SyncoreTemplateName
): Promise<void> {
  if (!templateUsesConnectedClients(template)) {
    await waitForSignal();
    return;
  }

  let knownTargets = new Set<string>();
  let waitingNoticeVisible = false;
  const refreshTargets = async () => {
    const nextTargets = await listConnectedClientTargets();
    const nextIds = new Set(nextTargets.map((target) => target.id));

    for (const target of nextTargets) {
      if (!knownTargets.has(target.id)) {
        context.info(`Client target connected: ${target.id}`);
      }
    }
    for (const targetId of knownTargets) {
      if (!nextIds.has(targetId)) {
        context.warn(`Client target disconnected: ${targetId}`);
      }
    }

    if (nextTargets.length === 0 && !waitingNoticeVisible) {
      context.info("Hub ready. Start your app to connect a client target.");
      waitingNoticeVisible = true;
    } else if (nextTargets.length > 0) {
      waitingNoticeVisible = false;
    }

    knownTargets = nextIds;
  };

  await refreshTargets();
  const interval = setInterval(() => {
    void refreshTargets();
  }, 1500);

  try {
    await waitForSignal();
  } finally {
    clearInterval(interval);
  }
}

async function requireHubConnection(context: CliContext): Promise<ConnectedHub> {
  const hub = await connectToProjectHub();
  if (!hub) {
    context.fail(
      "The local devtools hub is not running.",
      1,
      undefined,
      {
        category: "hub",
        nextSteps: buildHubUnavailableNextSteps()
      }
    );
  }
  return hub;
}

async function listRemoteTables(
  runtimeId: string,
  context: CliContext
): Promise<Array<{ name: string; documentCount: number }>> {
  const hub = await requireHubConnection(context);
  try {
    const result = await subscribeOnce(hub, runtimeId, {
      kind: "schema.tables"
    });
    if (result.kind !== "schema.tables.result") {
      context.fail("Unexpected response while listing remote tables.", 1, result);
    }
    return result.tables.map((table) => ({
      name: table.name,
      documentCount: table.documentCount
    }));
  } finally {
    await hub.dispose();
  }
}

async function readRemoteTable(
  hub: ConnectedHub,
  runtimeId: string,
  table: string,
  options: {
    limit: number;
  }
): Promise<Extract<
  Awaited<ReturnType<typeof subscribeOnce>>,
  { kind: "data.table.result" }
>> {
  const result = await subscribeOnce(hub, runtimeId, {
    kind: "data.table",
    table,
    limit: options.limit
  });
  if (result.kind !== "data.table.result") {
    throw new Error(`Unexpected response while reading table ${table}.`);
  }
  return result;
}

async function importIntoClientTarget(
  context: CliContext,
  target: ClientTargetDescriptor,
  runtime: ClientTargetDescriptor["runtimes"][number],
  sourcePath: string,
  options: ImportCommandOptions
): Promise<Array<{ table: string; importedCount: number }>> {
  const batches = await loadImportDocumentBatches(context.cwd, sourcePath, {
    ...(options.table ? { table: options.table } : {})
  });
  const hub = await requireHubConnection(context);
  try {
    const results: Array<{ table: string; importedCount: number }> = [];
    for (const batch of batches) {
      let importedCount = 0;
      for (const row of batch.rows) {
        const payload = { ...row };
        delete payload._id;
        delete payload._creationTime;
        const result = await hub.sendCommand(runtime.runtimeId, {
          kind: "data.insert",
          table: batch.table,
          document: payload
        });
        if (result.kind !== "data.mutate.result" || !result.success) {
          const message =
            result.kind === "data.mutate.result"
              ? result.error ?? `Failed to import into ${batch.table}.`
              : `Unexpected response while importing into ${batch.table}.`;
          context.fail(message, 1, result);
        }
        importedCount += 1;
      }
      results.push({
        table: batch.table,
        importedCount
      });
    }
    return results;
  } finally {
    await hub.dispose();
  }
}

async function exportClientTargetData(
  context: CliContext,
  target: ClientTargetDescriptor,
  runtime: ClientTargetDescriptor["runtimes"][number],
  options: ExportCommandOptions
): Promise<{
  path: string;
  tables: string[];
  format: "json" | "jsonl" | "directory" | "zip";
}> {
  const hub = await requireHubConnection(context);
  try {
    const tables = options.table
      ? [options.table]
      : (await listRemoteTables(runtime.runtimeId, context)).map(
          (entry: { name: string }) => entry.name
        );
    const payloads = await Promise.all(
      tables.map(async (table) => ({
        table,
        rows: (await readRemoteTable(hub, runtime.runtimeId, table, {
          limit: Number.MAX_SAFE_INTEGER
        })).rows
      }))
    );
    return await writeExportData(path.resolve(context.cwd, options.path), payloads);
  } finally {
    await hub.dispose();
  }
}

async function runLogsCommand(
  context: CliContext,
  options: LogsCommandOptions
): Promise<void> {
  const availableTargets = await listAvailableTargets(context.cwd);
  const runtimeLookup = buildRuntimeLookup(availableTargets);
  const selectedTarget =
    options.target && options.target !== "all"
      ? availableTargets.find((target) => target.id === options.target)
      : undefined;
  if (options.target && options.target !== "all" && !selectedTarget) {
    context.fail(
      `Unknown target ${JSON.stringify(options.target)}. Available targets: ${availableTargets.map((target) => target.id).join(", ")}`
    );
  }
  const selectedRuntime = selectedTarget
    ? resolveClientRuntime(selectedTarget, options.runtime, {
        command: "logs"
      })
    : null;
  const allowedRuntimeIds =
    selectedTarget?.kind === "client" ? new Set(selectedTarget.runtimeIds) : undefined;
  const entries = await readPersistedLogs(context.cwd);
  const filtered = entries
    .map((entry) => decoratePersistedLogEntry(entry, runtimeLookup))
    .filter((entry) =>
      options.target && options.target !== "all"
        ? entry.targetId === options.target ||
          (allowedRuntimeIds ? allowedRuntimeIds.has(entry.runtimeId) : false)
        : true
    )
    .filter((entry) =>
      selectedRuntime ? entry.runtimeId === selectedRuntime.runtimeId : true
    )
    .filter((entry) => (options.kind ? entry.category === options.kind : true))
    .slice(-Number.parseInt(options.limit, 10));

  renderOutput(context, filtered, options.format);

  if (!options.watch) {
    return;
  }

  const hub = await requireHubConnection(context);
  const unsubscribe = hub.onEvent((event) => {
    const entry = normalizeRuntimeEvent(
      event,
      runtimeLookup.get(event.runtimeId)
    );
    if (!entry) {
      return;
    }
    if (
      options.target &&
      options.target !== "all" &&
      entry.targetId !== options.target &&
      !(allowedRuntimeIds ? allowedRuntimeIds.has(entry.runtimeId) : false)
    ) {
      return;
    }
    if (options.kind && entry.category !== options.kind) {
      return;
    }
    if (selectedRuntime && entry.runtimeId !== selectedRuntime.runtimeId) {
      return;
    }
    renderOutput(context, entry, options.format);
  });
  context.info("Streaming logs. Press Ctrl+C to stop.");
  await waitForSignal();
  unsubscribe();
  await hub.dispose();
}

async function readPersistedLogs(cwd: string): Promise<PersistedLogEntry[]> {
  const logPath = path.join(cwd, ".syncore", "logs", "runtime.jsonl");
  try {
    await stat(logPath);
  } catch {
    return [];
  }

  const source = await readFile(logPath, "utf8");
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PersistedLogEntry)
    .filter((entry) => entry.version === 2)
    .filter((entry) => !shouldSuppressLogEntry(entry));
}

function normalizeRuntimeEvent(
  event: Record<string, unknown> & { type: string; runtimeId: string; timestamp: number },
  runtimeEntry?: ClientRuntimeLookupEntry
): PersistedLogEntry | null {
  const functionName =
    typeof event.functionName === "string" ? event.functionName : "unknown";
  const logMessage =
    typeof event.message === "string" ? event.message : "Syncore log";
  const resolvedTargetId =
    event.runtimeId === "syncore-dev-hub"
      ? "all"
      : (runtimeEntry?.targetId ?? event.runtimeId);
  const runtimeLabel =
    event.runtimeId === "syncore-dev-hub"
      ? "dashboard"
      : (runtimeEntry?.label ?? "runtime");
  const publicRuntimeId =
    event.runtimeId === "syncore-dev-hub"
      ? undefined
      : (runtimeEntry?.id ?? createPublicRuntimeId(event.runtimeId));
  const targetLabel = runtimeEntry?.targetLabel;
  const origin =
    event.origin === "dashboard" || event.runtimeId === "syncore-dev-hub"
      ? "dashboard"
      : "runtime";
  const entryBase = {
    timestamp: event.timestamp,
    runtimeId: event.runtimeId,
    targetId: resolvedTargetId,
    ...(targetLabel ? { targetLabel } : {}),
    ...(publicRuntimeId ? { publicRuntimeId } : {}),
    ...(runtimeLabel ? { runtimeLabel } : {}),
    origin
  } satisfies Pick<
    PersistedLogEntry,
    | "timestamp"
    | "runtimeId"
    | "targetId"
    | "targetLabel"
    | "publicRuntimeId"
    | "runtimeLabel"
    | "origin"
  >;

  if (
    event.type === "log" &&
    shouldSuppressLogEntry({
      ...entryBase,
      eventType: event.type,
      category: "system",
      message: logMessage,
      event
    })
  ) {
    return null;
  }

  switch (event.type) {
    case "query.executed":
      return {
        ...entryBase,
        eventType: event.type,
        category: "query",
        message: `${functionName} executed`,
        event
      };
    case "query.invalidated":
      return {
        ...entryBase,
        eventType: event.type,
        category: "system",
        message: `${formatInvalidatedQueryId(event.queryId)} invalidated${typeof event.reason === "string" ? ` (${event.reason})` : ""}`,
        event
      };
    case "mutation.committed":
      return {
        ...entryBase,
        eventType: event.type,
        category: "mutation",
        message:
          Array.isArray(event.changedTables) && event.changedTables.length > 0
            ? `${functionName} committed (${event.changedTables.join(", ")})`
            : `${functionName} committed`,
        event
      };
    case "action.completed":
      return {
        ...entryBase,
        eventType: event.type,
        category: "action",
        message:
          typeof event.error === "string" && event.error.length > 0
            ? `${functionName} failed: ${event.error}`
            : `${functionName} completed`,
        event
      };
    case "runtime.connected":
      return {
        ...entryBase,
        eventType: event.type,
        category: "system",
        message: `${publicRuntimeId ?? "runtime"} ${runtimeLabel} connected`,
        event
      };
    case "runtime.disconnected":
      return {
        ...entryBase,
        eventType: event.type,
        category: "system",
        message: `${publicRuntimeId ?? "runtime"} ${runtimeLabel} disconnected`,
        event
      };
    case "storage.updated":
      return {
        ...entryBase,
        eventType: event.type,
        category: "system",
        message: `${typeof event.operation === "string" ? event.operation : "update"} ${typeof event.storageId === "string" ? event.storageId : "storage"}`,
        event
      };
    default:
      return {
        ...entryBase,
        eventType: event.type,
        category: "system",
        message: event.type === "log" ? logMessage : humanizeRuntimeEvent(event),
        event
      };
  }
}

function decoratePersistedLogEntry(
  entry: PersistedLogEntry,
  runtimeLookup: ReturnType<typeof buildRuntimeLookup>
): PersistedLogEntry {
  const runtime = runtimeLookup.get(entry.runtimeId);
  return {
    ...entry,
    targetId:
      entry.targetId === "all"
        ? "all"
        : runtime?.targetId ?? entry.targetId ?? entry.runtimeId,
    ...(runtime?.targetLabel ? { targetLabel: runtime.targetLabel } : {}),
    ...(runtime?.id ? { publicRuntimeId: runtime.id } : {}),
    ...(runtime?.label ? { runtimeLabel: runtime.label } : {}),
    ...(entry.origin ? {} : { origin: entry.runtimeId === "syncore-dev-hub" ? "dashboard" : "runtime" })
  };
}

function shouldSuppressLogEntry(entry: PersistedLogEntry): boolean {
  return (
    entry.eventType === "log" &&
    /syncore devtools hub is alive/i.test(entry.message)
  );
}

function formatInvalidatedQueryId(queryId: unknown): string {
  if (typeof queryId !== "string" || queryId.length === 0) {
    return "query";
  }
  const separatorIndex = queryId.indexOf(":");
  if (separatorIndex === -1) {
    return queryId;
  }
  return queryId.slice(0, separatorIndex);
}

function humanizeRuntimeEvent(
  event: Record<string, unknown> & { type: string }
): string {
  if (event.type === "scheduler.tick" && Array.isArray(event.executedJobIds)) {
    return `scheduler tick (${event.executedJobIds.length} job(s))`;
  }
  return event.type.replaceAll(".", " ");
}

async function subscribeOnce(
  hub: ConnectedHub,
  runtimeId: string,
  payload: Parameters<ConnectedHub["subscribe"]>[1]
): Promise<SyncoreDevtoolsSubscriptionResultPayload> {
  return await new Promise((resolve, reject) => {
    const unsubscribe = hub.subscribe(runtimeId, payload, {
      onData(result) {
        unsubscribe();
        resolve(result);
      },
      onError(error) {
        unsubscribe();
        reject(new Error(error));
      }
    });
  });
}

async function promptForTemplate(
  context: CliContext,
  detectedTemplate: string
): Promise<SyncoreTemplateName> {
  const choices: CliChoice<SyncoreTemplateName>[] = VALID_SYNCORE_TEMPLATES.map(
    (template) =>
    template === detectedTemplate
      ? {
          label: template,
          value: template,
          description: "Detected from the current project"
        }
      : {
          label: template,
          value: template
        }
  );
  return await context.select(
    "Choose a Syncore template for this directory.",
    choices,
    isKnownTemplate(detectedTemplate) ? detectedTemplate : VALID_SYNCORE_TEMPLATES[0]
  );
}

async function isDirectoryEmpty(directory: string): Promise<boolean> {
  try {
    const entries = await readdir(directory);
    return entries.length === 0;
  } catch {
    return true;
  }
}

function printScaffoldChanges(
  context: CliContext,
  result: Awaited<ReturnType<typeof scaffoldProject>>
): void {
  if (result.created.length > 0) {
    context.info(`Created: ${result.created.join(", ")}`);
  }
  if (result.updated.length > 0) {
    context.info(`Updated: ${result.updated.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    context.warn(`Kept existing: ${result.skipped.join(", ")}`);
  }
}

function isTargetCapability(value: string): value is TargetCapability {
  return (
    value === "run" ||
    value === "readData" ||
    value === "writeData" ||
    value === "exportData" ||
    value === "streamLogs"
  );
}

async function previewImportPlan(
  context: CliContext,
  sourcePath: string,
  options: ImportCommandOptions,
  targetId: string
): Promise<{
  target: string;
  format: string;
  totalRows: number;
  batches: Array<{ table: string; rowCount: number }>;
}> {
  const batches = await loadImportDocumentBatches(context.cwd, sourcePath, {
    ...(options.table ? { table: options.table } : {})
  });
  const preview = {
    target: targetId,
    format: path.extname(sourcePath).toLowerCase() || "directory",
    totalRows: batches.reduce((sum, batch) => sum + batch.rows.length, 0),
    batches: batches.map((batch) => ({
      table: batch.table,
      rowCount: batch.rows.length
    }))
  };

  if (!context.json && context.interactive) {
    process.stdout.write("Import preview:\n");
    process.stdout.write(`  target: ${preview.target}\n`);
    process.stdout.write(`  source: ${sourcePath}\n`);
    process.stdout.write(`  format: ${preview.format}\n`);
    for (const batch of preview.batches) {
      process.stdout.write(`  - ${batch.table}: ${batch.rowCount} row(s)\n`);
    }
  }

  return preview;
}

function parseJsonObject(input: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${formatError(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

async function waitForSignal(): Promise<void> {
  await new Promise<void>((resolve) => {
    const onSignal = () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      resolve();
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
}

function parseGlobalOptionsFromArgv(argv: string[]): GlobalCliOptions {
  const parsed: GlobalCliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--cwd") {
      const nextValue = argv[index + 1];
      if (nextValue) {
        parsed.cwd = nextValue;
      }
      index += 1;
      continue;
    }
    if (value === "--json") {
      parsed.json = true;
      continue;
    }
    if (value === "--verbose") {
      parsed.verbose = true;
      continue;
    }
    if (value === "--no-interactive") {
      parsed.interactive = false;
      continue;
    }
    if (value === "--yes" || value === "-y") {
      parsed.yes = true;
    }
  }
  return parsed;
}
