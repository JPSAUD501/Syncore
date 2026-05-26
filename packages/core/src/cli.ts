#!/usr/bin/env node

import {
  appendFile,
  readdir,
  mkdir,
  open,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import { connect as connectToNet } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { Command } from "commander";
import { tsImport } from "tsx/esm/api";
import WebSocket, { WebSocketServer } from "ws";
import type {
  SyncoreDevtoolsClientMessage,
  SyncoreDevtoolsCommandPayload,
  SyncoreDevtoolsCommandResultPayload,
  SyncoreDevtoolsCapabilities,
  SyncoreDevtoolsMessage,
  SyncoreDevtoolsSubscriptionPayload,
  SyncoreDevtoolsSubscriptionResultPayload,
  SyncoreDevtoolsSubscribe,
  SyncoreDevtoolsUnsubscribe,
  StorageEntry
} from "@syncore/devtools-protocol";
import {
  SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
  SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
  SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
  createPublicRuntimeId,
  createPublicTargetId
} from "@syncore/devtools-protocol";
import {
  generateDevtoolsToken,
  isAllowedDashboardOrigin,
  isAuthorizedDashboardRequest,
  sanitizeDevtoolsToken
} from "./devtools-auth.js";
import {
  createDevtoolsCommandHandler,
  createDevtoolsSubscriptionHost,
  generateId,
  SyncoreRuntime,
  type AnyTableDefinition,
  type DevtoolsSqlAnalysis,
  type DevtoolsSqlReadResult,
  type DevtoolsSqlSupport,
  createSchemaSnapshot,
  diffSchemaSnapshots,
  parseSchemaSnapshot,
  renderCreateIndexStatement,
  renderCreateSearchIndexStatement,
  renderCreateTableStatement,
  renderMigrationSql,
  searchIndexTableName,
  type SchemaSnapshot,
  type StorageObject,
  type StorageWriteInput,
  type SyncoreExternalChangeEvent,
  type SyncoreExternalChangeSignal,
  type SyncoreSchema,
  type SyncoreFunctionRegistry,
  type SyncoreResolvedComponents,
  type SyncoreSqlDriver,
  type SyncoreStorageAdapter,
  type TableDefinition,
  type Validator
} from "./index.js";

export interface SyncoreProjectTargetConfig {
  databasePath: string;
  storageDirectory: string;
}

export interface SyncoreConfig {
  projectTarget?: SyncoreProjectTargetConfig;
  databasePath?: string;
  storageDirectory?: string;
}

export interface DevHubSessionState {
  dashboardUrl: string;
  authenticatedDashboardUrl: string;
  devtoolsUrl: string;
  token: string;
}

export type SyncoreTemplateName =
  | "minimal"
  | "node"
  | "react-web"
  | "svelte"
  | "expo"
  | "electron"
  | "next";

export function templateUsesConnectedClients(
  template: SyncoreTemplateName
): boolean {
  return (
    template === "react-web" ||
    template === "svelte" ||
    template === "expo" ||
    template === "next"
  );
}

interface SyncoreTemplateFile {
  path: string;
  content: string;
}

interface ScannedFunctionEntry {
  pathParts: string[];
  exportName: string;
  kind: "query" | "mutation" | "action";
}

const loadedTypeScriptModules = new Map<
  string,
  { mtimeMs: number; loaded: Promise<Record<string, unknown>> }
>();

export interface ScaffoldProjectOptions {
  template: SyncoreTemplateName;
  force?: boolean;
}

export interface ScaffoldProjectResult {
  template: SyncoreTemplateName;
  created: string[];
  updated: string[];
  skipped: string[];
}

interface PackageJsonShape {
  name?: string;
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const COMBINED_DEV_COMMAND =
  'concurrently --kill-others-on-fail --names syncore,app --prefix-colors yellow,cyan "npm run syncorejs:dev" "npm run dev:app"';

const program = new Command();
const CORE_PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const DEVTOOLS_SESSION_FILE = path.join(".syncore", "devtools-session.json");
export const SYNCORE_MIGRATION_SNAPSHOT_FILE_NAME = "_schema_snapshot.json";
export const VALID_SYNCORE_TEMPLATES: SyncoreTemplateName[] = [
  "minimal",
  "node",
  "react-web",
  "svelte",
  "expo",
  "electron",
  "next"
];
let pendingDevBootstrap: ReturnType<typeof setTimeout> | undefined;
let devBootstrapInFlight = false;
const PROJECT_TARGET_RUNTIME_ID = "syncore-project-target";
const STORAGE_ACCESS_TICKET_TTL_MS = 5 * 60 * 1000;
const STORAGE_ACCESS_CHUNK_BYTES = 1024 * 1024;
const STORAGE_ACCESS_MAX_PREVIEW_BYTES = 80_000;

program
  .name("syncorejs")
  .description("Syncore local-first toolkit CLI")
  .version("0.1.0");

program
  .command("init")
  .description("Scaffold Syncore in the current directory")
  .option(
    "--template <template>",
    `Template to scaffold (${VALID_SYNCORE_TEMPLATES.join(", ")}, or auto)`,
    "auto"
  )
  .option("--force", "Overwrite Syncore-managed files when they already exist")
  .action(async (options: { template: string; force?: boolean }) => {
    const cwd = process.cwd();
    const template = await resolveRequestedTemplate(cwd, options.template);
    const result = await scaffoldProject(cwd, {
      template,
      ...(options.force ? { force: true } : {})
    });
    await runCodegen(cwd);
    logScaffoldResult(result, "Syncore project scaffolded.");
    console.log(
      "Next: run `npx syncorejs dev` to keep codegen and local migrations in sync."
    );
  });

program
  .command("codegen")
  .description("Generate typed Syncore references from syncore/functions")
  .action(async () => {
    await runCodegen(process.cwd());
    console.log("Generated syncore/_generated files.");
  });

program
  .command("doctor")
  .description("Check Syncore project structure and inferred template")
  .action(async () => {
    const cwd = process.cwd();
    const checks = [
      "syncore.config.ts",
      path.join("syncore", "schema.ts"),
      path.join("syncore", "functions"),
      path.join("syncore", "migrations")
    ];
    console.log(`Detected template: ${await detectProjectTemplate(cwd)}`);
    for (const check of checks) {
      const exists = await fileExists(path.join(cwd, check));
      console.log(`${exists ? "OK" : "MISSING"} ${check}`);
    }
  });

program
  .command("import")
  .description("Import JSONL sample data into a local Syncore table")
  .requiredOption("--table <table>", "Table name to import into")
  .argument("<file>", "Path to a JSONL file")
  .action(async (filePath: string, options: { table: string }) => {
    const importedCount = await importJsonlIntoProject(
      process.cwd(),
      options.table,
      filePath
    );
    console.log(
      `Imported ${importedCount} row(s) into ${JSON.stringify(options.table)}.`
    );
  });

program
  .command("seed")
  .description(
    "Import seed data from syncore/seed.jsonl or syncore/seed/<table>.jsonl"
  )
  .requiredOption("--table <table>", "Table name to seed")
  .option("--file <file>", "Explicit JSONL file path")
  .action(async (options: { table: string; file?: string }) => {
    const cwd = process.cwd();
    const seedFile =
      options.file ??
      (await resolveDefaultSeedFile(cwd, options.table)) ??
      path.join("syncore", "seed", `${options.table}.jsonl`);
    const importedCount = await importJsonlIntoProject(
      cwd,
      options.table,
      seedFile
    );
    console.log(
      `Seeded ${importedCount} row(s) into ${JSON.stringify(options.table)} from ${seedFile}.`
    );
  });

program
  .command("migrate:status")
  .description(
    "Compare the current schema against the last saved migration snapshot"
  )
  .action(async () => {
    const cwd = process.cwd();
    const schema = await loadProjectSchema(cwd);
    const currentSnapshot = createSchemaSnapshot(schema);
    const storedSnapshot = await readStoredSnapshot(cwd);
    const plan = diffSchemaSnapshots(storedSnapshot, currentSnapshot);

    console.log(`Current schema hash: ${currentSnapshot.hash}`);
    console.log(`Stored snapshot: ${storedSnapshot?.hash ?? "none"}`);
    console.log(`Statements to generate: ${plan.statements.length}`);
    console.log(`Warnings: ${plan.warnings.length}`);
    console.log(`Destructive changes: ${plan.destructiveChanges.length}`);

    for (const warning of plan.warnings) {
      console.log(`WARN ${warning}`);
    }
    for (const destructiveChange of plan.destructiveChanges) {
      console.log(`BLOCK ${destructiveChange}`);
    }
  });

program
  .command("migrate:generate")
  .argument("[name]", "Optional migration name", "auto")
  .description("Generate a SQL migration file from the current schema diff")
  .action(async (name: string) => {
    const cwd = process.cwd();
    const schema = await loadProjectSchema(cwd);
    const currentSnapshot = createSchemaSnapshot(schema);
    const storedSnapshot = await readStoredSnapshot(cwd);
    const plan = diffSchemaSnapshots(storedSnapshot, currentSnapshot);

    if (plan.destructiveChanges.length > 0) {
      console.error("Destructive schema changes require a manual migration:");
      for (const destructiveChange of plan.destructiveChanges) {
        console.error(`- ${destructiveChange}`);
      }
      process.exitCode = 1;
      return;
    }

    if (plan.statements.length === 0 && plan.warnings.length === 0) {
      console.log("No schema changes detected.");
      return;
    }

    const migrationsDirectory = path.join(cwd, "syncore", "migrations");
    await mkdir(migrationsDirectory, { recursive: true });
    const migrationNumber = await getNextMigrationNumber(migrationsDirectory);
    const slug = slugify(name);
    const migrationFileName = `${String(migrationNumber).padStart(4, "0")}_${slug}.sql`;
    const migrationSql = renderMigrationSql(plan, {
      title: `Syncore migration ${migrationFileName}`
    });
    await writeFile(
      path.join(migrationsDirectory, migrationFileName),
      migrationSql
    );
    await writeStoredSnapshot(cwd, currentSnapshot);
    console.log(
      `Generated ${path.join("syncore", "migrations", migrationFileName)}`
    );
  });

program
  .command("migrate:apply")
  .description(
    "Apply SQL migrations from syncore/migrations to the configured database"
  )
  .action(async () => {
    const appliedCount = await applyProjectMigrations(process.cwd());
    console.log(`Applied ${appliedCount} migration(s).`);
  });

program
  .command("dev")
  .description("Start the Syncore dev loop and devtools hub")
  .option(
    "--template <template>",
    `Template to scaffold when Syncore is missing (${VALID_SYNCORE_TEMPLATES.join(", ")}, or auto)`,
    "auto"
  )
  .action(async (options: { template: string }) => {
    const cwd = process.cwd();
    const template = await resolveRequestedTemplate(cwd, options.template);
    await startDevHub({ cwd, template });
  });

export async function runSyncoreCli(argv = process.argv): Promise<void> {
  await program.parseAsync(argv);
}

if (isCliEntryPoint()) {
  await runSyncoreCli();
}

export async function runCodegen(cwd: string): Promise<void> {
  const functionsDir = path.join(cwd, "syncore", "functions");
  const generatedDir = path.join(cwd, "syncore", "_generated");
  const componentsManifestPath = path.join(cwd, "syncore", "components.ts");
  await mkdir(generatedDir, { recursive: true });
  const functionImportExtension = await resolveFunctionImportExtension(cwd);
  const hasComponentsManifest = await hasNonEmptyComponentsManifest(
    componentsManifestPath
  );

  const files = await listTypeScriptFiles(functionsDir);
  const functionEntries: ScannedFunctionEntry[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const relative = path
      .relative(functionsDir, file)
      .replaceAll("\\", "/")
      .replace(/\.tsx?$/, "");
    const pathParts = relative.split("/");
    const regex = /export const (\w+)\s*=\s*(query|mutation|action)\(/g;
    for (const match of content.matchAll(regex)) {
      functionEntries.push({
        pathParts,
        exportName: match[1]!,
        kind: match[2] as "query" | "mutation" | "action"
      });
    }
  }

  const apiSource = [
    `/**`,
    ` * Generated \`api\` utility for referencing Syncore functions.`,
    ` *`,
    ` * THIS CODE IS AUTOMATICALLY GENERATED.`,
    ` *`,
    ` * To regenerate, run \`npx syncorejs dev\` or \`npx syncorejs codegen\`.`,
    ` * @module`,
    ` */`,
    ``,
    `import { createFunctionReferenceFor } from "syncorejs";`,
    `import type { FunctionReferenceFor } from "syncorejs";`,
    `export { components } from "./components${functionImportExtension}";`,
    ``,
    ...renderFunctionTypeImports(functionEntries, functionImportExtension),
    ``,
    ...renderGeneratedApiInterfaces(functionEntries),
    ``,
    `/**`,
    ` * A utility for referencing Syncore functions in your app's public API.`,
    ` *`,
    ` * Usage:`,
    ` * \`\`\`ts`,
    ` * const listTasks = api.tasks.list;`,
    ` * \`\`\``,
    ` */`,
    `export const api: SyncoreApi = ${renderApiObject(functionEntries)} as const;`,
    ``
  ].join("\n");

  const functionsSource = [
    `/**`,
    ` * Generated Syncore function registry.`,
    ` *`,
    ` * THIS CODE IS AUTOMATICALLY GENERATED.`,
    ` *`,
    ` * To regenerate, run \`npx syncorejs dev\` or \`npx syncorejs codegen\`.`,
    ` * @module`,
    ` */`,
    ``,
    `import type { SyncoreFunctionRegistry } from "syncorejs";`,
    `import { composeProjectFunctionRegistry } from "syncorejs";`,
    ...renderGeneratedManifestImportLines(
      hasComponentsManifest,
      functionImportExtension
    ),
    ...renderFunctionImports(functionEntries, functionImportExtension),
    ``,
    ...renderGeneratedManifestDeclarationLines(hasComponentsManifest),
    ``,
    ...renderGeneratedFunctionsInterface(functionEntries),
    ``,
    `/**`,
    ` * The runtime registry for every function exported from \`syncore/functions\`.`,
    ` *`,
    ` * Most application code should import from \`./api\` instead of using this map directly.`,
    ` */`,
    `const rootFunctions: SyncoreRootFunctionsRegistry = {`,
    ...functionEntries.map(
      (entry) =>
        `  ${JSON.stringify(`${entry.pathParts.join("/")}/${entry.exportName}`)}: ${renderFunctionImportName(entry)},`
    ),
    `} as const;`,
    ``,
    `export const functions: SyncoreFunctionRegistry = composeProjectFunctionRegistry(rootFunctions, componentsManifest);`,
    ``
  ].join("\n");

  const schemaSource = [
    `/**`,
    ` * Generated composed Syncore schema including installed components.`,
    ` *`,
    ` * THIS CODE IS AUTOMATICALLY GENERATED.`,
    ` *`,
    ` * To regenerate, run \`npx syncorejs dev\` or \`npx syncorejs codegen\`.`,
    ` * @module`,
    ` */`,
    ``,
    `import { composeProjectSchema } from "syncorejs";`,
    `import rootSchema from "../schema${functionImportExtension}";`,
    ...renderGeneratedManifestImportLines(
      hasComponentsManifest,
      functionImportExtension
    ),
    ``,
    ...renderGeneratedManifestDeclarationLines(hasComponentsManifest),
    ``,
    `const schema = composeProjectSchema(rootSchema, componentsManifest);`,
    ``,
    `export default schema;`,
    ``
  ].join("\n");

  const componentsSource = [
    `/**`,
    ` * Generated installed-component helpers for this Syncore app.`,
    ` *`,
    ` * THIS CODE IS AUTOMATICALLY GENERATED.`,
    ` *`,
    ` * To regenerate, run \`npx syncorejs dev\` or \`npx syncorejs codegen\`.`,
    ` * @module`,
    ` */`,
    ``,
    `import { createInstalledComponentsApi, resolveComponentsManifest } from "syncorejs";`,
    ...renderGeneratedManifestImportLines(
      hasComponentsManifest,
      functionImportExtension
    ),
    ``,
    ...renderGeneratedManifestDeclarationLines(hasComponentsManifest),
    ``,
    `export const components = createInstalledComponentsApi(componentsManifest);`,
    ``,
    `export const resolvedComponents = resolveComponentsManifest(componentsManifest);`,
    ``,
    `export default resolvedComponents;`,
    ``
  ].join("\n");

  const runtimeSource = [
    `/**`,
    ` * Generated local runtime bundle for Syncore CLI and Node adapters.`,
    ` *`,
    ` * THIS CODE IS AUTOMATICALLY GENERATED.`,
    ` *`,
    ` * To regenerate, run \`npx syncorejs dev\` or \`npx syncorejs codegen\`.`,
    ` * @module`,
    ` */`,
    ``,
    `import schema from "./schema${functionImportExtension}";`,
    `import { functions } from "./functions${functionImportExtension}";`,
    ...(hasComponentsManifest
      ? [
          `import { resolvedComponents } from "./components${functionImportExtension}";`
        ]
      : [`const resolvedComponents = [] as const;`]),
    ``,
    `export { functions, schema };`,
    `export const components = resolvedComponents;`,
    ``
  ].join("\n");

  const serverSource = [
    `/**`,
    ` * Generated utilities for implementing Syncore query, mutation, and action functions.`,
    ` *`,
    ` * THIS CODE IS AUTOMATICALLY GENERATED.`,
    ` *`,
    ` * To regenerate, run \`npx syncorejs dev\` or \`npx syncorejs codegen\`.`,
    ` * @module`,
    ` */`,
    ``,
    `import type schema from "../schema${functionImportExtension}";`,
    `import { action as baseAction, mutation as baseMutation, query as baseQuery } from "syncorejs";`,
    `import type {`,
    `  ActionCtx as BaseActionCtx,`,
    `  FunctionConfig,`,
    `  Infer,`,
    `  InferArgs,`,
    `  MutationCtx as BaseMutationCtx,`,
    `  QueryCtx as BaseQueryCtx,`,
    `  SyncoreFunctionDefinition,`,
    `  Validator,`,
    `  ValidatorMap`,
    `} from "syncorejs";`,
    ``,
    `export { createFunctionReference, createFunctionReferenceFor, s } from "syncorejs";`,
    ``,
    `/**`,
    ` * The context object available inside Syncore query handlers in this app.`,
    ` */`,
    `export type QueryCtx = BaseQueryCtx<typeof schema>;`,
    ``,
    `/**`,
    ` * The context object available inside Syncore mutation handlers in this app.`,
    ` */`,
    `export type MutationCtx = BaseMutationCtx<typeof schema>;`,
    ``,
    `/**`,
    ` * The context object available inside Syncore action handlers in this app.`,
    ` */`,
    `export type ActionCtx = BaseActionCtx<typeof schema>;`,
    ``,
    `export type { FunctionReference } from "syncorejs";`,
    ``,
    `/**`,
    ` * Define a query in this Syncore app's public API.`,
    ` *`,
    ` * Queries can read from your local Syncore database and can be called from clients.`,
    ` *`,
    ` * @param config - The query definition, including args and a handler.`,
    ` * @returns The wrapped query. Export it from \`syncore/functions\` to add it to the generated API.`,
    ` */`,
    `export const query = baseQuery as {`,
    `  <TValidator extends Validator<unknown, unknown, string>, TResult>(`,
    `    config: FunctionConfig<QueryCtx, Infer<TValidator>, TResult> & { args: TValidator }`,
    `  ): SyncoreFunctionDefinition<"query", QueryCtx, Infer<TValidator>, TResult>;`,
    `  <TArgsShape extends ValidatorMap, TResult>(`,
    `    config: FunctionConfig<QueryCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }`,
    `  ): SyncoreFunctionDefinition<"query", QueryCtx, InferArgs<TArgsShape>, TResult>;`,
    `};`,
    ``,
    `/**`,
    ` * Define a mutation in this Syncore app's public API.`,
    ` *`,
    ` * Mutations can write to your local Syncore database and can be called from clients.`,
    ` *`,
    ` * @param config - The mutation definition, including args and a handler.`,
    ` * @returns The wrapped mutation. Export it from \`syncore/functions\` to add it to the generated API.`,
    ` */`,
    `export const mutation = baseMutation as {`,
    `  <TValidator extends Validator<unknown, unknown, string>, TResult>(`,
    `    config: FunctionConfig<MutationCtx, Infer<TValidator>, TResult> & { args: TValidator }`,
    `  ): SyncoreFunctionDefinition<"mutation", MutationCtx, Infer<TValidator>, TResult>;`,
    `  <TArgsShape extends ValidatorMap, TResult>(`,
    `    config: FunctionConfig<MutationCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }`,
    `  ): SyncoreFunctionDefinition<"mutation", MutationCtx, InferArgs<TArgsShape>, TResult>;`,
    `};`,
    ``,
    `/**`,
    ` * Define an action in this Syncore app's public API.`,
    ` *`,
    ` * Actions can run arbitrary JavaScript and may call queries or mutations.`,
    ` *`,
    ` * @param config - The action definition, including args and a handler.`,
    ` * @returns The wrapped action. Export it from \`syncore/functions\` to add it to the generated API.`,
    ` */`,
    `export const action = baseAction as {`,
    `  <TValidator extends Validator<unknown, unknown, string>, TResult>(`,
    `    config: FunctionConfig<ActionCtx, Infer<TValidator>, TResult> & { args: TValidator }`,
    `  ): SyncoreFunctionDefinition<"action", ActionCtx, Infer<TValidator>, TResult>;`,
    `  <TArgsShape extends ValidatorMap, TResult>(`,
    `    config: FunctionConfig<ActionCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }`,
    `  ): SyncoreFunctionDefinition<"action", ActionCtx, InferArgs<TArgsShape>, TResult>;`,
    `};`,
    ``
  ].join("\n");

  await writeGeneratedFile(path.join(generatedDir, "api.ts"), apiSource);
  await writeGeneratedFile(
    path.join(generatedDir, "components.ts"),
    componentsSource
  );
  await writeGeneratedFile(
    path.join(generatedDir, "functions.ts"),
    functionsSource
  );
  await writeGeneratedFile(
    path.join(generatedDir, "runtime.ts"),
    runtimeSource
  );
  await writeGeneratedFile(path.join(generatedDir, "schema.ts"), schemaSource);
  await writeGeneratedFile(path.join(generatedDir, "server.ts"), serverSource);
}

async function writeGeneratedFile(
  filePath: string,
  source: string
): Promise<void> {
  try {
    if ((await readFile(filePath, "utf8")) === source) {
      return;
    }
  } catch {
    // Missing or unreadable generated files are replaced below.
  }
  await writeFile(filePath, source);
}

export async function scaffoldProject(
  cwd: string,
  options: ScaffoldProjectOptions
): Promise<ScaffoldProjectResult> {
  const files = buildTemplateFiles(options.template);
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  await mkdir(path.join(cwd, "syncore", "functions"), { recursive: true });
  await mkdir(path.join(cwd, "syncore", "_generated"), { recursive: true });
  await mkdir(path.join(cwd, "syncore", "migrations"), { recursive: true });

  for (const file of files) {
    const targetPath = path.join(cwd, file.path);
    const result = await writeManagedFile(
      targetPath,
      file.content,
      options.force
    );
    const relative = path.relative(cwd, targetPath).replaceAll("\\", "/");
    if (result === "created") {
      created.push(relative);
    } else if (result === "updated") {
      updated.push(relative);
    } else {
      skipped.push(relative);
    }
  }

  await ensurePackageScripts(cwd, options.template);
  await ensureGitignoreEntries(cwd, [".syncore/"]);

  return {
    template: options.template,
    created,
    updated,
    skipped
  };
}

function buildTemplateFiles(
  template: SyncoreTemplateName
): SyncoreTemplateFile[] {
  const files: SyncoreTemplateFile[] = [
    {
      path: "syncore.config.ts",
      content: renderSyncoreConfigTemplate(template)
    },
    {
      path: path.join("syncore", "schema.ts"),
      content: `import { defineSchema, defineTable, s } from "syncorejs";

export default defineSchema({
  tasks: defineTable({
    text: s.string(),
    done: s.boolean()
  }).index("by_done", ["done"])
});
`
    },
    {
      path: path.join("syncore", "components.ts"),
      content: `import { defineComponents } from "syncorejs";

export default defineComponents({});
`
    },
    {
      path: path.join("syncore", "functions", "tasks.ts"),
      content: `import { mutation, query, s } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("tasks").withIndex("by_done").order("asc").collect()
});

export const create = mutation({
  args: { text: s.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("tasks", { text: args.text, done: false })
});
`
    }
  ];

  switch (template) {
    case "react-web":
      files.push(
        {
          path: path.join("src", "syncore.worker.ts"),
          content: `/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/_generated/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions
});
`
        },
        {
          path: path.join("src", "syncore-provider.tsx"),
          content: `import type { ReactNode } from "react";
import { SyncoreBrowserProvider } from "syncorejs/browser/react";

export function AppSyncoreProvider({ children }: { children: ReactNode }) {
  return (
    <SyncoreBrowserProvider workerUrl={new URL("./syncore.worker.ts", import.meta.url)}>
      {children}
    </SyncoreBrowserProvider>
  );
}
`
        }
      );
      break;
    case "expo":
      files.push({
        path: path.join("lib", "syncore.ts"),
        content: `import { createExpoSyncoreBootstrap } from "syncorejs/expo";
import schema from "../syncore/_generated/schema";
import { functions } from "../syncore/_generated/functions";

export const syncore = createExpoSyncoreBootstrap({
  schema,
  functions
});
`
      });
      break;
    case "next":
      files.push(
        {
          path: path.join("app", "syncore.worker.js"),
          content: `/* eslint-disable */

import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/_generated/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions
});
`
        },
        {
          path: path.join("app", "syncore-provider.tsx"),
          content: `"use client";

import type { ReactNode } from "react";
import { SyncoreNextProvider } from "syncorejs/next";

const createWorker = () =>
  new Worker(new URL("./syncore.worker.js", import.meta.url), {
    type: "module"
  });

export function AppSyncoreProvider({ children }: { children: ReactNode }) {
  return (
    <SyncoreNextProvider createWorker={createWorker}>
      {children}
    </SyncoreNextProvider>
  );
}
`
        }
      );
      break;
    case "node":
      files.push({
        path: "script.mjs",
        content: `import path from "node:path";
import { withNodeSyncoreClient } from "syncorejs/node";
import { api } from "./syncore/_generated/api.ts";
import schema from "./syncore/_generated/schema.ts";
import { functions } from "./syncore/_generated/functions.ts";

await withNodeSyncoreClient(
  {
    databasePath: path.join(process.cwd(), ".syncore", "syncore.db"),
    storageDirectory: path.join(process.cwd(), ".syncore", "storage"),
    schema,
    functions
  },
  async (client) => {
    await client.mutation(api.tasks.create, { text: "Run locally" });
    console.log(await client.query(api.tasks.list));
  }
);
`
      });
      break;
    case "electron":
      files.push({
        path: path.join("src", "syncore-runtime.ts"),
        content: `import path from "node:path";
import { app } from "electron";
import { createNodeSyncoreRuntime } from "syncorejs/node";
import schema from "../syncore/_generated/schema.js";
import { functions } from "../syncore/_generated/functions.js";

export function createAppSyncoreRuntime() {
  const userDataDirectory = app.getPath("userData");
  return createNodeSyncoreRuntime({
    databasePath: path.join(userDataDirectory, "syncore.db"),
    storageDirectory: path.join(userDataDirectory, "storage"),
    schema,
    functions,
    platform: "electron-main"
  });
}
`
      });
      break;
    case "svelte":
      files.push(
        {
          path: path.join("src", "syncore.worker.ts"),
          content: `/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/_generated/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions
});
`
        },
        {
          path: path.join("src", "SyncoreProvider.svelte"),
          content: `<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Snippet } from "svelte";
  import { createBrowserWorkerClient } from "syncorejs/browser";
  import { setSyncoreClient } from "syncorejs/svelte";

  interface Props {
    children?: Snippet;
  }

  const { children }: Props = $props();

  const managed = createBrowserWorkerClient({
    workerUrl: new URL("./syncore.worker.ts", import.meta.url)
  });

  setSyncoreClient(managed.client);

  onDestroy(() => {
    void managed.dispose();
  });
</script>

{@render children?.()}
`
        }
      );
      break;
    case "minimal":
      break;
  }

  return files;
}

function renderSyncoreConfigTemplate(template: SyncoreTemplateName): string {
  if (template === "node" || template === "electron") {
    return `export default {
  projectTarget: {
    databasePath: ".syncore/syncore.db",
    storageDirectory: ".syncore/storage"
  }
};
`;
  }

  return `export default {};
`;
}

export function logScaffoldResult(
  result: ScaffoldProjectResult,
  heading: string
): void {
  console.log(heading);
  console.log(`Using template: ${result.template}`);
  if (result.created.length > 0) {
    console.log(`Created: ${result.created.join(", ")}`);
  }
  if (result.updated.length > 0) {
    console.log(`Updated: ${result.updated.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    console.log(`Kept existing: ${result.skipped.join(", ")}`);
  }
}

async function ensureProjectScaffolded(
  cwd: string,
  template: SyncoreTemplateName
): Promise<void> {
  if (await hasSyncoreProject(cwd)) {
    return;
  }
  const result = await scaffoldProject(cwd, { template });
  logScaffoldResult(
    result,
    "Syncore dev did not find a Syncore project, so it scaffolded one for you."
  );
}

export async function hasSyncoreProject(cwd: string): Promise<boolean> {
  return (
    (await fileExists(path.join(cwd, "syncore.config.ts"))) &&
    (await fileExists(path.join(cwd, "syncore", "schema.ts"))) &&
    (await fileExists(path.join(cwd, "syncore", "functions")))
  );
}

export async function resolveRequestedTemplate(
  cwd: string,
  requestedTemplate: string
): Promise<SyncoreTemplateName> {
  if (requestedTemplate !== "auto") {
    if (
      !VALID_SYNCORE_TEMPLATES.includes(
        requestedTemplate as SyncoreTemplateName
      )
    ) {
      throw new Error(
        `Unknown template ${JSON.stringify(requestedTemplate)}. Expected one of ${VALID_SYNCORE_TEMPLATES.join(", ")} or auto.`
      );
    }
    return requestedTemplate as SyncoreTemplateName;
  }
  return detectProjectTemplate(cwd);
}

export async function detectProjectTemplate(
  cwd: string
): Promise<SyncoreTemplateName> {
  const packageJson = await readPackageJson(cwd);
  const dependencies = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {})
  };

  if ("expo" in dependencies || "react-native" in dependencies) {
    return "expo";
  }
  if ("electron" in dependencies) {
    return "electron";
  }
  if ("next" in dependencies) {
    return "next";
  }
  if (
    "svelte" in dependencies ||
    "@sveltejs/vite-plugin-svelte" in dependencies ||
    "@sveltejs/kit" in dependencies ||
    (await fileExists(path.join(cwd, "src", "SyncoreProvider.svelte")))
  ) {
    return "svelte";
  }
  if (
    "vite" in dependencies ||
    "@vitejs/plugin-react" in dependencies ||
    (await fileExists(path.join(cwd, "src", "syncore.worker.ts"))) ||
    (await fileExists(path.join(cwd, "src", "syncore-provider.tsx"))) ||
    ((await fileExists(path.join(cwd, "src", "main.tsx"))) &&
      "react" in dependencies)
  ) {
    return "react-web";
  }
  if (packageJson) {
    return "node";
  }
  return "minimal";
}

export async function readPackageJson(
  cwd: string
): Promise<PackageJsonShape | null> {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!(await fileExists(packageJsonPath))) {
    return null;
  }
  try {
    return JSON.parse(
      await readFile(packageJsonPath, "utf8")
    ) as PackageJsonShape;
  } catch {
    return null;
  }
}

async function ensurePackageScripts(
  cwd: string,
  template: SyncoreTemplateName
): Promise<void> {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!(await fileExists(packageJsonPath))) {
    const packageJson: PackageJsonShape = {
      type: "module",
      scripts: {
        "syncorejs:dev": "syncorejs dev",
        "syncorejs:codegen": "syncorejs codegen"
      }
    };
    await writeFile(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`
    );
    return;
  }

  const packageJson = await readPackageJson(cwd);
  if (!packageJson) {
    return;
  }

  const nextPackageJson: PackageJsonShape = {
    ...packageJson,
    scripts: {
      ...(packageJson.scripts ?? {})
    }
  };

  nextPackageJson.scripts ??= {};
  nextPackageJson.scripts["syncorejs:dev"] ??= "syncorejs dev";
  nextPackageJson.scripts["syncorejs:codegen"] ??= "syncorejs codegen";

  maybeAddManagedDevScripts(nextPackageJson, template);

  if (stableStringify(nextPackageJson) === stableStringify(packageJson)) {
    return;
  }

  await writeFile(
    packageJsonPath,
    `${JSON.stringify(nextPackageJson, null, 2)}\n`
  );
}

function maybeAddManagedDevScripts(
  packageJson: PackageJsonShape,
  template: SyncoreTemplateName
): void {
  if (!supportsManagedCombinedDev(template)) {
    return;
  }

  packageJson.scripts ??= {};
  const scripts = packageJson.scripts;
  const currentDev = scripts.dev;
  if (!currentDev) {
    return;
  }

  if (
    scripts["dev:app"] === currentDev &&
    scripts.dev === combinedDevCommand()
  ) {
    packageJson.devDependencies ??= {};
    packageJson.devDependencies.concurrently ??= "^9.1.2";
    return;
  }

  if (scripts["dev:app"] && scripts["dev:app"] !== currentDev) {
    return;
  }

  if (currentDev.includes("syncorejs:dev") || currentDev.includes("dev:app")) {
    return;
  }

  packageJson.devDependencies ??= {};
  packageJson.devDependencies.concurrently ??= "^9.1.2";
  scripts["dev:app"] ??= currentDev;
  scripts.dev = combinedDevCommand();
}

function supportsManagedCombinedDev(template: SyncoreTemplateName): boolean {
  return (
    template === "next" ||
    template === "react-web" ||
    template === "svelte" ||
    template === "electron"
  );
}

function combinedDevCommand(): string {
  return COMBINED_DEV_COMMAND;
}

async function ensureGitignoreEntries(
  cwd: string,
  entries: string[]
): Promise<void> {
  const gitignorePath = path.join(cwd, ".gitignore");
  const existing = (await fileExists(gitignorePath))
    ? await readFile(gitignorePath, "utf8")
    : "";
  const lines = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  let changed = false;
  for (const entry of entries) {
    if (!lines.has(entry)) {
      lines.add(entry);
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  const nextContent = `${[...lines].sort((left, right) => left.localeCompare(right)).join("\n")}\n`;
  await writeFile(gitignorePath, nextContent);
}

async function writeManagedFile(
  filePath: string,
  content: string,
  force = false
): Promise<"created" | "updated" | "skipped"> {
  await mkdir(path.dirname(filePath), { recursive: true });
  if (!(await fileExists(filePath))) {
    await writeFile(filePath, content);
    return "created";
  }
  if (!force) {
    return "skipped";
  }
  const current = await readFile(filePath, "utf8");
  if (current === content) {
    return "skipped";
  }
  await writeFile(filePath, content);
  return "updated";
}

export async function importJsonlIntoProject(
  cwd: string,
  tableName: string,
  sourcePath: string
): Promise<number> {
  const schema = await loadProjectSchema(cwd);
  const table = schema.getTable(tableName) as TableDefinition<
    Validator<Record<string, unknown>, Record<string, unknown>, string>
  >;
  const config = await loadProjectConfig(cwd);
  const projectTarget = requireProjectTargetConfig(config);
  const databasePath = path.resolve(cwd, projectTarget.databasePath);
  const storageDirectory = path.resolve(cwd, projectTarget.storageDirectory);
  const sourceFilePath = path.resolve(cwd, sourcePath);
  await mkdir(path.dirname(databasePath), { recursive: true });
  await mkdir(storageDirectory, { recursive: true });
  const source = await readFile(sourceFilePath, "utf8");
  const rows = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const database = new DatabaseSync(databasePath);
  try {
    ensureDatabaseReadyForImport(database, schema);
    let importedCount = 0;
    let lineNumber = 0;
    for (const line of rows) {
      lineNumber += 1;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        throw new Error(
          `Invalid JSON on line ${lineNumber} of ${sourcePath}: ${formatError(error)}`,
          { cause: error }
        );
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(
          `Line ${lineNumber} of ${sourcePath} must contain a JSON object.`
        );
      }
      const payload = { ...(parsed as Record<string, unknown>) };
      delete payload._id;
      delete payload._creationTime;
      const validated = table.validator.parse(payload) as Record<
        string,
        unknown
      >;
      const id = generateId();
      const creationTime = Date.now() + importedCount;
      const json = stableStringify(validated);
      database
        .prepare(
          `INSERT INTO ${quoteIdentifier(tableName)} (_id, _creationTime, _json) VALUES (?, ?, ?)`
        )
        .run(id, creationTime, json);
      syncSearchIndexesForImport(database, tableName, table, {
        _id: id,
        _creationTime: creationTime,
        _json: json
      });
      importedCount += 1;
    }
    return importedCount;
  } finally {
    database.close();
  }
}

export async function resolveDefaultSeedFile(
  cwd: string,
  tableName: string
): Promise<string | null> {
  const candidates = [
    path.join(cwd, "syncore", "seed", `${tableName}.jsonl`),
    path.join(cwd, "syncore", "seed.jsonl")
  ];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return path.relative(cwd, candidate).replaceAll("\\", "/");
    }
  }
  return null;
}

function ensureDatabaseReadyForImport(
  database: DatabaseSync,
  schema: SyncoreSchema<Record<string, AnyTableDefinition>>
): void {
  for (const tableName of schema.tableNames()) {
    const table = schema.getTable(tableName) as TableDefinition<
      Validator<Record<string, unknown>, Record<string, unknown>, string>
    >;
    database.exec(renderCreateTableStatement(tableName));
    for (const index of table.indexes) {
      database.exec(
        renderCreateIndexStatement(tableName, index.name, index.fields)
      );
    }
    for (const searchIndex of table.searchIndexes) {
      try {
        database.exec(renderCreateSearchIndexStatement(tableName, searchIndex));
      } catch (error) {
        if (
          !isUnsupportedFts5Statement(
            renderCreateSearchIndexStatement(tableName, searchIndex),
            error
          )
        ) {
          throw error;
        }
      }
    }
  }
}

function syncSearchIndexesForImport(
  database: DatabaseSync,
  tableName: string,
  table: TableDefinition<
    Validator<Record<string, unknown>, Record<string, unknown>, string>
  >,
  row: { _id: string; _creationTime: number; _json: string }
): void {
  if (table.searchIndexes.length === 0) {
    return;
  }
  const payload = JSON.parse(row._json) as Record<string, unknown>;
  for (const searchIndex of table.searchIndexes) {
    const searchTable = searchIndexTableName(tableName, searchIndex.name);
    try {
      database
        .prepare(`DELETE FROM ${quoteIdentifier(searchTable)} WHERE _id = ?`)
        .run(row._id);
      database
        .prepare(
          `INSERT INTO ${quoteIdentifier(searchTable)} (_id, search_value) VALUES (?, ?)`
        )
        .run(row._id, toSearchValue(payload[searchIndex.searchField]));
    } catch (error) {
      if (
        !isUnsupportedFts5Statement(
          renderCreateSearchIndexStatement(tableName, searchIndex),
          error
        )
      ) {
        throw error;
      }
    }
  }
}

async function listTypeScriptFiles(directory: string): Promise<string[]> {
  if (!(await fileExists(directory))) {
    return [];
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listTypeScriptFiles(fullPath);
      }
      if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        return [fullPath];
      }
      return [];
    })
  );
  return files.flat().sort((left, right) => left.localeCompare(right));
}

type ApiModuleNode = {
  pathParts: string[];
  children: Map<string, ApiModuleNode>;
  functions: Array<{
    pathParts: string[];
    exportName: string;
    kind: "query" | "mutation" | "action";
  }>;
};

function renderGeneratedApiInterfaces(
  functionEntries: Array<{
    pathParts: string[];
    exportName: string;
    kind: "query" | "mutation" | "action";
  }>
): string[] {
  const root = buildApiModuleTree(functionEntries);
  return renderGeneratedApiInterfaceNode(root);
}

function renderGeneratedApiInterfaceNode(node: ApiModuleNode): string[] {
  const childInterfaces = [...node.children.values()]
    .sort((left, right) =>
      left.pathParts.join("/").localeCompare(right.pathParts.join("/"))
    )
    .flatMap((child) => renderGeneratedApiInterfaceNode(child));

  const lines = [
    `/**`,
    ` * ${renderApiInterfaceDescription(node)}`,
    ` */`,
    `export interface ${renderApiInterfaceName(node)} {`
  ];

  for (const child of [...node.children.values()].sort((left, right) =>
    left.pathParts.join("/").localeCompare(right.pathParts.join("/"))
  )) {
    lines.push(
      `  /**`,
      `   * ${renderApiModulePropertyDescription(child)}`,
      `   */`,
      `  readonly ${renderPropertyKey(child.pathParts.at(-1) ?? "")}: ${renderApiInterfaceName(child)};`
    );
  }

  for (const entry of [...node.functions].sort((left, right) =>
    left.exportName.localeCompare(right.exportName)
  )) {
    lines.push(
      `  /**`,
      `   * ${renderApiFunctionPropertyDescription(entry)}`,
      `   */`,
      `  readonly ${renderPropertyKey(entry.exportName)}: FunctionReferenceFor<typeof ${renderFunctionImportName(entry)}>;`
    );
  }

  lines.push(`}`);
  return [...childInterfaces, lines.join("\n")];
}

function renderApiObject(
  functionEntries: Array<{
    pathParts: string[];
    exportName: string;
    kind: "query" | "mutation" | "action";
  }>
): string {
  const root = buildApiModuleTree(functionEntries);
  return renderApiObjectNode(root);
}

function renderApiObjectNode(node: ApiModuleNode): string {
  const properties: string[] = [];

  for (const child of [...node.children.values()].sort((left, right) =>
    left.pathParts.join("/").localeCompare(right.pathParts.join("/"))
  )) {
    properties.push(
      `${renderPropertyKey(child.pathParts.at(-1) ?? "")}: ${renderApiObjectNode(child)}`
    );
  }

  for (const entry of [...node.functions].sort((left, right) =>
    left.exportName.localeCompare(right.exportName)
  )) {
    properties.push(
      `${renderPropertyKey(entry.exportName)}: createFunctionReferenceFor<typeof ${renderFunctionImportName(entry)}>("${entry.kind}", "${entry.pathParts.join("/")}/${entry.exportName}")`
    );
  }

  return `{ ${properties.join(", ")} }`;
}

function buildApiModuleTree(
  functionEntries: Array<{
    pathParts: string[];
    exportName: string;
    kind: "query" | "mutation" | "action";
  }>
): ApiModuleNode {
  const root: ApiModuleNode = {
    pathParts: [],
    children: new Map(),
    functions: []
  };

  for (const entry of functionEntries) {
    let cursor = root;
    for (const segment of entry.pathParts) {
      let child = cursor.children.get(segment);
      if (!child) {
        child = {
          pathParts: [...cursor.pathParts, segment],
          children: new Map(),
          functions: []
        };
        cursor.children.set(segment, child);
      }
      cursor = child;
    }
    cursor.functions.push(entry);
  }

  return root;
}

function renderGeneratedFunctionsInterface(
  functionEntries: ScannedFunctionEntry[]
): string[] {
  const lines = [
    `/**`,
    ` * Type-safe runtime definitions for every function exported from \`syncore/functions\`.`,
    ` */`,
    `export interface SyncoreRootFunctionsRegistry extends SyncoreFunctionRegistry {`
  ];

  for (const entry of functionEntries
    .slice()
    .sort((left, right) =>
      `${left.pathParts.join("/")}/${left.exportName}`.localeCompare(
        `${right.pathParts.join("/")}/${right.exportName}`
      )
    )) {
    lines.push(
      `  /**`,
      `   * Runtime definition for the public Syncore ${entry.kind} \`${entry.pathParts.join("/")}/${entry.exportName}\`.`,
      `   */`,
      `  readonly ${JSON.stringify(`${entry.pathParts.join("/")}/${entry.exportName}`)}: typeof ${renderFunctionImportName(entry)};`
    );
  }

  lines.push(`}`);
  return [lines.join("\n")];
}

function renderGeneratedManifestImportLines(
  hasComponentsManifest: boolean,
  extension: "" | ".js"
): string[] {
  if (!hasComponentsManifest) {
    return [];
  }
  return [`import componentsManifest from "../components${extension}";`];
}

function renderGeneratedManifestDeclarationLines(
  hasComponentsManifest: boolean
): string[] {
  return hasComponentsManifest
    ? []
    : [`const componentsManifest = {} as const;`];
}

function renderApiInterfaceName(node: ApiModuleNode): string {
  if (node.pathParts.length === 0) {
    return "SyncoreApi";
  }
  return `SyncoreApi__${node.pathParts.map(toTypeNamePart).join("__")}`;
}

function renderApiInterfaceDescription(node: ApiModuleNode): string {
  if (node.pathParts.length === 0) {
    return "Type-safe references to every public Syncore function in this app.";
  }

  if (node.children.size === 0) {
    return `Type-safe references to functions exported from \`syncore/functions/${node.pathParts.join("/")}.ts\`.`;
  }

  return `Type-safe references to functions grouped under \`syncore/functions/${node.pathParts.join("/")}/*\`.`;
}

function renderApiModulePropertyDescription(node: ApiModuleNode): string {
  if (node.children.size === 0) {
    return `Functions exported from \`syncore/functions/${node.pathParts.join("/")}.ts\`.`;
  }
  return `Functions grouped under \`syncore/functions/${node.pathParts.join("/")}/*\`.`;
}

function renderApiFunctionPropertyDescription(entry: {
  pathParts: string[];
  exportName: string;
  kind: "query" | "mutation" | "action";
}): string {
  return `Reference to the public Syncore ${entry.kind} \`${entry.pathParts.join("/")}/${entry.exportName}\`.`;
}

function renderPropertyKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key) ? key : JSON.stringify(key);
}

function toTypeNamePart(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[0-9]/u.test(sanitized) ? `_${sanitized}` : sanitized;
}

function renderFunctionImports(
  functionEntries: Array<{
    pathParts: string[];
    exportName: string;
    kind: "query" | "mutation" | "action";
  }>,
  extension: "" | ".js"
): string[] {
  return functionEntries
    .slice()
    .sort((left, right) =>
      `${left.pathParts.join("/")}/${left.exportName}`.localeCompare(
        `${right.pathParts.join("/")}/${right.exportName}`
      )
    )
    .map((entry) => {
      const relativePath = `../functions/${entry.pathParts.join("/")}${extension}`;
      return `import { ${entry.exportName} as ${renderFunctionImportName(entry)} } from ${JSON.stringify(relativePath)};`;
    });
}

function renderFunctionTypeImports(
  functionEntries: Array<{
    pathParts: string[];
    exportName: string;
    kind: "query" | "mutation" | "action";
  }>,
  extension: "" | ".js"
): string[] {
  return renderFunctionImports(functionEntries, extension).map((line) =>
    line.replace(/^import \{/, "import type {")
  );
}

function renderFunctionImportName(entry: {
  pathParts: string[];
  exportName: string;
}): string {
  return [
    ...entry.pathParts.map((segment) =>
      segment.replace(/[^a-zA-Z0-9_$]/g, "_")
    ),
    entry.exportName
  ].join("__");
}

export function resolveProjectTargetConfig(
  config: SyncoreConfig
): SyncoreProjectTargetConfig | null {
  if (
    config.projectTarget &&
    typeof config.projectTarget === "object" &&
    typeof config.projectTarget.databasePath === "string" &&
    typeof config.projectTarget.storageDirectory === "string"
  ) {
    return config.projectTarget;
  }

  if (
    typeof config.databasePath === "string" &&
    typeof config.storageDirectory === "string"
  ) {
    return {
      databasePath: config.databasePath,
      storageDirectory: config.storageDirectory
    };
  }

  return null;
}

export async function loadProjectConfig(cwd: string): Promise<SyncoreConfig> {
  const filePath = path.join(cwd, "syncore.config.ts");
  const config = await loadDefaultExport<SyncoreConfig>(filePath);
  if (!config || typeof config !== "object") {
    throw new Error(
      "syncore.config.ts must default export a Syncore config object."
    );
  }
  const projectTarget = resolveProjectTargetConfig(config);
  return projectTarget ? { ...config, projectTarget } : config;
}

function requireProjectTargetConfig(
  config: SyncoreConfig
): SyncoreProjectTargetConfig {
  const projectTarget = resolveProjectTargetConfig(config);
  if (!projectTarget) {
    throw new Error(
      "This Syncore project does not define a projectTarget. Use a connected client target instead."
    );
  }
  return projectTarget;
}

export async function loadProjectRootSchema(
  cwd: string
): Promise<SyncoreSchema<Record<string, AnyTableDefinition>>> {
  const filePath = path.join(cwd, "syncore", "schema.ts");
  const schema =
    await loadDefaultExport<SyncoreSchema<Record<string, AnyTableDefinition>>>(
      filePath
    );
  if (
    !schema ||
    typeof schema !== "object" ||
    typeof schema.tableNames !== "function"
  ) {
    throw new Error("syncore/schema.ts must default export defineSchema(...).");
  }
  return schema;
}

export async function loadProjectComponentsManifest(
  cwd: string
): Promise<Record<string, unknown>> {
  const filePath = path.join(cwd, "syncore", "components.ts");
  if (!(await fileExists(filePath))) {
    return {};
  }

  const manifest = await loadDefaultExport<Record<string, unknown>>(filePath);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(
      "syncore/components.ts must default export defineComponents({...})."
    );
  }
  return manifest;
}

export async function loadProjectSchema(
  cwd: string
): Promise<SyncoreSchema<Record<string, AnyTableDefinition>>> {
  const filePath = path.join(cwd, "syncore", "_generated", "schema.ts");
  if (!(await fileExists(filePath))) {
    await runCodegen(cwd);
  }
  const schema =
    await loadDefaultExport<SyncoreSchema<Record<string, AnyTableDefinition>>>(
      filePath
    );
  if (
    !schema ||
    typeof schema !== "object" ||
    typeof schema.tableNames !== "function"
  ) {
    throw new Error(
      "syncore/_generated/schema.ts must default export a composed Syncore schema."
    );
  }
  return schema;
}

async function loadDefaultExport<TValue>(filePath: string): Promise<TValue> {
  if (!(await fileExists(filePath))) {
    throw new Error(`Missing file: ${path.relative(process.cwd(), filePath)}`);
  }
  const loaded = (await loadTypeScriptModule(filePath)) as { default?: TValue };
  if (!("default" in loaded)) {
    throw new Error(
      `File ${path.relative(process.cwd(), filePath)} must have a default export.`
    );
  }
  const resolvedDefault = unwrapDefaultExport(loaded.default);
  if (resolvedDefault === undefined) {
    throw new Error(
      `File ${path.relative(process.cwd(), filePath)} exported undefined.`
    );
  }
  return resolvedDefault;
}

async function loadNamedExport<TValue>(
  filePath: string,
  exportName: string
): Promise<TValue> {
  if (!(await fileExists(filePath))) {
    throw new Error(`Missing file: ${path.relative(process.cwd(), filePath)}`);
  }
  const loaded = (await loadTypeScriptModule(filePath)) as Record<
    string,
    TValue | undefined
  >;
  const defaultExport =
    loaded.default &&
    typeof loaded.default === "object" &&
    exportName in (loaded.default as Record<string, unknown>)
      ? (loaded.default as Record<string, TValue | undefined>)[exportName]
      : undefined;
  if (!(exportName in loaded) && defaultExport === undefined) {
    throw new Error(
      `File ${path.relative(process.cwd(), filePath)} must export ${exportName}.`
    );
  }
  const resolvedValue = unwrapDefaultExport(
    loaded[exportName] ?? defaultExport
  );
  if (resolvedValue === undefined) {
    throw new Error(
      `File ${path.relative(process.cwd(), filePath)} exported undefined for ${exportName}.`
    );
  }
  return resolvedValue;
}

async function hasNonEmptyComponentsManifest(
  filePath: string
): Promise<boolean> {
  if (!(await fileExists(filePath))) {
    return false;
  }
  const source = await readFile(filePath, "utf8");
  return !/defineComponents\s*\(\s*\{\s*\}\s*\)/.test(source);
}

async function loadTypeScriptModule(
  filePath: string
): Promise<Record<string, unknown>> {
  const fileStat = await stat(filePath);
  const cached = loadedTypeScriptModules.get(filePath);
  if (cached && cached.mtimeMs === fileStat.mtimeMs) {
    return await cached.loaded;
  }

  const moduleUrl = pathToFileURL(filePath).href;
  const loaded = tsImport(moduleUrl, {
    parentURL: import.meta.url
  }) as Promise<Record<string, unknown>>;
  loadedTypeScriptModules.set(filePath, {
    mtimeMs: fileStat.mtimeMs,
    loaded
  });
  return await loaded;
}

export async function loadProjectFunctions(
  cwd: string
): Promise<SyncoreFunctionRegistry> {
  const filePath = path.join(cwd, "syncore", "_generated", "functions.ts");
  if (!(await fileExists(filePath))) {
    await runCodegen(cwd);
  }
  const functions = await loadNamedExport<SyncoreFunctionRegistry>(
    filePath,
    "functions"
  );
  if (!functions || typeof functions !== "object") {
    throw new Error(
      "syncore/_generated/functions.ts must export a functions registry."
    );
  }
  return functions;
}

export async function loadProjectResolvedComponents(
  cwd: string
): Promise<SyncoreResolvedComponents> {
  const componentsManifestPath = path.join(cwd, "syncore", "components.ts");
  if (await fileExists(componentsManifestPath)) {
    const source = await readFile(componentsManifestPath, "utf8");
    if (/defineComponents\s*\(\s*\{\s*\}\s*\)/.test(source)) {
      return [];
    }
  }

  const filePath = path.join(cwd, "syncore", "_generated", "components.ts");
  if (!(await fileExists(filePath))) {
    await runCodegen(cwd);
  }
  const components = await loadNamedExport<SyncoreResolvedComponents>(
    filePath,
    "resolvedComponents"
  );
  if (!Array.isArray(components)) {
    throw new Error(
      "syncore/_generated/components.ts must export resolvedComponents."
    );
  }
  return components;
}

export async function loadProjectRuntime(cwd: string): Promise<{
  schema: SyncoreSchema<Record<string, AnyTableDefinition>>;
  functions: SyncoreFunctionRegistry;
  components: SyncoreResolvedComponents;
}> {
  const filePath = path.join(cwd, "syncore", "_generated", "runtime.ts");
  if (!(await fileExists(filePath))) {
    await runCodegen(cwd);
  }
  const loaded = await loadTypeScriptModule(filePath);
  const schema = unwrapDefaultExport(loaded.schema) as
    | SyncoreSchema<Record<string, AnyTableDefinition>>
    | undefined;
  const functions = unwrapDefaultExport(loaded.functions) as
    | SyncoreFunctionRegistry
    | undefined;
  const components = unwrapDefaultExport(loaded.components) as
    | SyncoreResolvedComponents
    | undefined;

  if (
    !schema ||
    typeof schema !== "object" ||
    typeof schema.tableNames !== "function"
  ) {
    throw new Error(
      "syncore/_generated/runtime.ts must export a composed Syncore schema."
    );
  }
  if (!functions || typeof functions !== "object") {
    throw new Error(
      "syncore/_generated/runtime.ts must export a functions registry."
    );
  }
  if (!Array.isArray(components)) {
    throw new Error(
      "syncore/_generated/runtime.ts must export resolved components."
    );
  }
  return { schema, functions, components };
}

interface ProjectTargetBackend {
  hello: Extract<SyncoreDevtoolsMessage, { type: "hello" }>;
  handleCommand(
    payload: SyncoreDevtoolsCommandPayload
  ): Promise<SyncoreDevtoolsCommandResultPayload>;
  subscribe(
    subscriptionId: string,
    payload: SyncoreDevtoolsSubscriptionPayload,
    listener: (payload: SyncoreDevtoolsSubscriptionResultPayload) => void
  ): Promise<void>;
  unsubscribe(subscriptionId: string): void;
  dispose(): Promise<void>;
}

interface StorageAccessTicket {
  id: string;
  runtimeId: string;
  storageId: string;
  purpose: "preview" | "download";
  entry: StorageEntry;
  supportsRange: boolean;
  expiresAt: number;
}

interface PendingHubCommand {
  resolve(payload: SyncoreDevtoolsCommandResultPayload): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

class HubExternalChangeSignal implements SyncoreExternalChangeSignal {
  private readonly listeners = new Set<
    (event: SyncoreExternalChangeEvent) => void
  >();

  constructor(
    private readonly publishToHub: (
      event: SyncoreExternalChangeEvent
    ) => void | Promise<void>
  ) {}

  subscribe(listener: (event: SyncoreExternalChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: SyncoreExternalChangeEvent): void | Promise<void> {
    return this.publishToHub(event);
  }

  receive(event: SyncoreExternalChangeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  close(): void {
    this.listeners.clear();
  }
}

class HubSqliteDriver implements SyncoreSqlDriver {
  private readonly database: DatabaseSync;
  private transactionDepth = 0;

  constructor(readonly databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA journal_mode = WAL;");
  }

  async exec(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async run(
    sql: string,
    params: unknown[] = []
  ): Promise<{ changes: number; lastInsertRowid?: number | string }> {
    const result = this.database.prepare(sql).run(...toSqlParameters(params));
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowid:
        typeof result.lastInsertRowid === "bigint"
          ? Number(result.lastInsertRowid)
          : result.lastInsertRowid
    };
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.database.prepare(sql).get(...toSqlParameters(params)) as
      | T
      | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.database.prepare(sql).all(...toSqlParameters(params)) as T[];
  }

  async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0) {
      return this.withSavepoint(`nested_${this.transactionDepth}`, callback);
    }
    this.transactionDepth += 1;
    this.database.exec("BEGIN");
    try {
      const result = await callback();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  async withSavepoint<T>(name: string, callback: () => Promise<T>): Promise<T> {
    const safeName = name.replaceAll(/[^a-zA-Z0-9_]/g, "_");
    this.database.exec(`SAVEPOINT ${safeName}`);
    try {
      const result = await callback();
      this.database.exec(`RELEASE SAVEPOINT ${safeName}`);
      return result;
    } catch (error) {
      this.database.exec(`ROLLBACK TO SAVEPOINT ${safeName}`);
      this.database.exec(`RELEASE SAVEPOINT ${safeName}`);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.database.close();
  }
}

class HubFileStorageAdapter implements SyncoreStorageAdapter {
  constructor(private readonly directory: string) {}

  private filePath(id: string): string {
    return path.join(this.directory, id);
  }

  async put(id: string, input: StorageWriteInput): Promise<StorageObject> {
    await mkdir(this.directory, { recursive: true });
    const filePath = this.filePath(id);
    const bytes = normalizeStorageInput(input.data);
    await writeFile(filePath, bytes);
    return {
      id,
      path: filePath,
      size: bytes.byteLength,
      contentType: input.contentType ?? null
    };
  }

  async get(id: string): Promise<StorageObject | null> {
    const filePath = this.filePath(id);
    try {
      const info = await stat(filePath);
      return {
        id,
        path: filePath,
        size: info.size,
        contentType: null
      };
    } catch {
      return null;
    }
  }

  async read(id: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.filePath(id));
    } catch {
      return null;
    }
  }

  async readRange(
    id: string,
    offset: number,
    length: number
  ): Promise<Uint8Array | null> {
    let handle;
    try {
      handle = await open(this.filePath(id), "r");
      const buffer = Buffer.alloc(Math.max(length, 0));
      const result = await handle.read(
        buffer,
        0,
        buffer.byteLength,
        Math.max(offset, 0)
      );
      return buffer.subarray(0, result.bytesRead);
    } catch {
      return null;
    } finally {
      await handle?.close();
    }
  }

  async delete(id: string): Promise<void> {
    await rm(this.filePath(id), { force: true });
  }

  async list(): Promise<StorageObject[]> {
    try {
      const entries = await readdir(this.directory, { withFileTypes: true });
      return Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const filePath = this.filePath(entry.name);
            const info = await stat(filePath);
            return {
              id: entry.name,
              path: filePath,
              size: info.size,
              contentType: null
            } satisfies StorageObject;
          })
      );
    } catch {
      return [];
    }
  }
}

const hubDevtoolsSqlSupport: DevtoolsSqlSupport = {
  analyzeSqlStatement(query: string): DevtoolsSqlAnalysis {
    const normalized = query.trim().replace(/^\(+/, "").toUpperCase();
    const firstKeyword = normalized.split(/\s+/, 1)[0] ?? "";
    if (
      firstKeyword === "SELECT" ||
      firstKeyword === "WITH" ||
      firstKeyword === "PRAGMA" ||
      firstKeyword === "EXPLAIN"
    ) {
      return {
        mode: "read",
        readTables: [],
        writeTables: [],
        schemaChanged: false,
        observedScopes: ["all"]
      };
    }
    if (
      firstKeyword === "INSERT" ||
      firstKeyword === "UPDATE" ||
      firstKeyword === "DELETE" ||
      firstKeyword === "REPLACE"
    ) {
      return {
        mode: "write",
        readTables: [],
        writeTables: [],
        schemaChanged: false,
        observedScopes: ["all"]
      };
    }
    if (
      firstKeyword === "CREATE" ||
      firstKeyword === "DROP" ||
      firstKeyword === "ALTER"
    ) {
      return {
        mode: "ddl",
        readTables: [],
        writeTables: [],
        schemaChanged: true,
        observedScopes: ["all", "schema.tables"]
      };
    }
    throw new Error(
      `Unsupported SQL statement type: ${firstKeyword || "unknown"}`
    );
  },
  ensureSqlMode(analysis, expected): void {
    if (expected === "watch") {
      if (analysis.mode !== "read") {
        throw new Error("Live mode supports read-only SQL only.");
      }
      return;
    }
    if (analysis.mode !== expected) {
      if (expected === "read") {
        throw new Error("Use SQL Write for mutating statements.");
      }
      throw new Error("Use SQL Read or SQL Live for read-only statements.");
    }
  },
  runReadonlyQuery(databasePath: string, query: string): DevtoolsSqlReadResult {
    const analysis = this.analyzeSqlStatement(query);
    this.ensureSqlMode(analysis, "read");
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const statement = database.prepare(query);
      const rows = statement.all() as Array<Record<string, unknown>>;
      const columns = statement.columns().map((column) => column.name);
      return {
        columns,
        rows: rows.map((row) => columns.map((column) => row[column])),
        observedTables: []
      };
    } finally {
      database.close();
    }
  }
};

async function createProjectTargetBackend(
  cwd: string,
  externalChangeSignal?: SyncoreExternalChangeSignal
): Promise<ProjectTargetBackend | null> {
  const config = await loadProjectConfig(cwd);
  const projectTarget = resolveProjectTargetConfig(config);
  if (!projectTarget) {
    return null;
  }

  const { schema, functions, components } = await loadProjectRuntime(cwd);
  const databasePath = path.resolve(cwd, projectTarget.databasePath);
  const storageDirectory = path.resolve(cwd, projectTarget.storageDirectory);
  await mkdir(path.dirname(databasePath), { recursive: true });
  await mkdir(storageDirectory, { recursive: true });

  const driver = new HubSqliteDriver(databasePath);
  const runtime = new SyncoreRuntime({
    schema,
    functions,
    components,
    driver,
    storage: new HubFileStorageAdapter(storageDirectory),
    platform: "project",
    runtimeCapabilities: {
      storage: {
        available: true,
        protocol: "file",
        supportsRange: true
      }
    },
    ...(externalChangeSignal ? { externalChangeSignal } : {})
  });
  await runtime.start();

  const commandHandler = createDevtoolsCommandHandler({
    driver,
    schema,
    functions,
    admin: runtime.getAdmin(),
    sql: hubDevtoolsSqlSupport
  });
  const subscriptionHost = createDevtoolsSubscriptionHost({
    driver,
    schema,
    functions,
    admin: runtime.getAdmin(),
    sql: hubDevtoolsSqlSupport
  });

  return {
    hello: {
      type: "hello",
      protocolVersion: SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
      minSupportedProtocolVersion:
        SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
      maxSupportedProtocolVersion:
        SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
      runtimeId: PROJECT_TARGET_RUNTIME_ID,
      platform: "project",
      sessionLabel: "Project Target",
      targetKind: "project",
      runtimeRole: "project-target",
      storageProtocol: "file",
      databaseLabel: path.basename(databasePath),
      storageIdentity: `file::${databasePath}`,
      capabilities: createProjectDevtoolsCapabilities()
    },
    handleCommand: commandHandler,
    subscribe(subscriptionId, payload, listener) {
      return subscriptionHost.subscribe(subscriptionId, payload, listener);
    },
    unsubscribe(subscriptionId) {
      subscriptionHost.unsubscribe(subscriptionId);
    },
    async dispose() {
      subscriptionHost.dispose();
      await runtime.stop();
    }
  };
}

function createProjectDevtoolsCapabilities(): SyncoreDevtoolsCapabilities {
  return {
    sql: {
      read: true,
      write: true,
      live: true
    },
    data: {
      browse: true,
      mutate: true,
      importExport: true
    },
    storage: {
      browse: true,
      download: true,
      readRange: true,
      delete: true,
      maxPreviewBytes: 80_000
    },
    scheduler: {
      read: true,
      edit: true
    }
  };
}

function normalizeStorageInput(input: StorageWriteInput["data"]): Uint8Array {
  if (typeof input === "string") {
    return Buffer.from(input);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
}

function toSqlParameters(params: unknown[]): SQLInputValue[] {
  return params.map((value) => {
    if (value instanceof Uint8Array) {
      return Buffer.from(value);
    }
    return value as SQLInputValue;
  });
}

export async function readStoredSnapshot(
  cwd: string
): Promise<SchemaSnapshot | null> {
  const snapshotPath = path.join(
    cwd,
    "syncore",
    "migrations",
    SYNCORE_MIGRATION_SNAPSHOT_FILE_NAME
  );
  if (!(await fileExists(snapshotPath))) {
    return null;
  }
  return parseSchemaSnapshot(await readFile(snapshotPath, "utf8"));
}

export async function writeStoredSnapshot(
  cwd: string,
  snapshot: SchemaSnapshot
): Promise<void> {
  const migrationsDirectory = path.join(cwd, "syncore", "migrations");
  await mkdir(migrationsDirectory, { recursive: true });
  await writeFile(
    path.join(migrationsDirectory, SYNCORE_MIGRATION_SNAPSHOT_FILE_NAME),
    `${JSON.stringify(snapshot, null, 2)}\n`
  );
}

export async function getNextMigrationNumber(
  directory: string
): Promise<number> {
  if (!(await fileExists(directory))) {
    return 1;
  }
  const migrationNumbers = (await readdir(directory))
    .map((name) => name.match(/^(\d+)_.*\.sql$/)?.[1])
    .filter((value): value is string => value !== undefined)
    .map((value) => Number.parseInt(value, 10));

  if (migrationNumbers.length === 0) {
    return 1;
  }
  return Math.max(...migrationNumbers) + 1;
}

export async function applyProjectMigrations(cwd: string): Promise<number> {
  const config = await loadProjectConfig(cwd);
  const projectTarget = requireProjectTargetConfig(config);
  const databasePath = path.resolve(cwd, projectTarget.databasePath);
  const storageDirectory = path.resolve(cwd, projectTarget.storageDirectory);
  await mkdir(path.dirname(databasePath), { recursive: true });
  await mkdir(storageDirectory, { recursive: true });

  const database = new DatabaseSync(databasePath);
  ensureCliMigrationTrackingTable(database);

  const migrationsDirectory = path.join(cwd, "syncore", "migrations");
  if (!(await fileExists(migrationsDirectory))) {
    database.close();
    return 0;
  }

  const appliedRows = database
    .prepare(`SELECT id FROM "_syncore_migrations" ORDER BY id ASC`)
    .all() as Array<{ id: string }>;
  const appliedNames = new Set(appliedRows.map((row) => row.id));
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => /\.sql$/i.test(name))
    .sort((left, right) => left.localeCompare(right));

  let appliedCount = 0;

  for (const fileName of migrationFiles) {
    if (appliedNames.has(fileName)) {
      continue;
    }

    const sql = await readFile(
      path.join(migrationsDirectory, fileName),
      "utf8"
    );
    database.exec("BEGIN");
    try {
      applyMigrationSql(database, sql, fileName);
      database
        .prepare(
          `INSERT OR REPLACE INTO "_syncore_migrations" (id, applied_at, sql) VALUES (?, ?, ?)`
        )
        .run(fileName, Date.now(), sql);
      database.exec("COMMIT");
      appliedCount += 1;
    } catch (error) {
      database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }

  database.close();
  return appliedCount;
}

function ensureCliMigrationTrackingTable(database: DatabaseSync): void {
  const tableExists =
    (
      database
        .prepare(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_syncore_migrations'`
        )
        .get() as { name?: string } | undefined
    )?.name === "_syncore_migrations";

  if (!tableExists) {
    database.exec(`
      CREATE TABLE "_syncore_migrations" (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        sql TEXT NOT NULL
      );
    `);
    return;
  }

  const columns = database
    .prepare(`PRAGMA table_info("_syncore_migrations")`)
    .all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (
    columnNames.has("id") &&
    columnNames.has("applied_at") &&
    columnNames.has("sql")
  ) {
    return;
  }

  database.exec(`
    ALTER TABLE "_syncore_migrations" RENAME TO "_syncore_migrations_legacy";
    CREATE TABLE "_syncore_migrations" (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL,
      sql TEXT NOT NULL
    );
  `);

  if (columnNames.has("name")) {
    database.exec(`
      INSERT INTO "_syncore_migrations" (id, applied_at, sql)
      SELECT
        name,
        CASE
          WHEN typeof(applied_at) = 'integer' THEN applied_at
          ELSE CAST(strftime('%s', applied_at) AS INTEGER) * 1000
        END,
        ''
      FROM "_syncore_migrations_legacy";
    `);
  }

  database.exec(`DROP TABLE "_syncore_migrations_legacy";`);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveFunctionImportExtension(
  cwd: string
): Promise<"" | ".js"> {
  const tsconfigFiles = (await readdir(cwd, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && /^tsconfig(\..+)?\.json$/u.test(entry.name)
    )
    .map((entry) => path.join(cwd, entry.name))
    .sort();

  for (const configPath of tsconfigFiles) {
    try {
      const source = await readFile(configPath, "utf8");
      const parsed = JSON.parse(source) as {
        compilerOptions?: {
          module?: string;
          moduleResolution?: string;
        };
      };
      const moduleResolution =
        parsed.compilerOptions?.moduleResolution?.toLowerCase();
      const moduleKind = parsed.compilerOptions?.module?.toLowerCase();
      if (
        moduleResolution === "nodenext" ||
        moduleResolution === "node16" ||
        moduleKind === "nodenext" ||
        moduleKind === "node16"
      ) {
        return ".js";
      }
    } catch {
      // Ignore unreadable tsconfig variants and fall back to extensionless imports.
    }
  }

  // Bundler-based app toolchains such as Next and Vite resolve extensionless
  // TypeScript source imports reliably, while NodeNext projects need explicit
  // JavaScript specifiers for emitted ESM.
  return "";
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function isLocalPortInUse(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    let settled = false;
    const socket = connectToNet({ host: "127.0.0.1", port });
    const finish = (inUse: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(inUse);
    };
    const timeout = setTimeout(() => finish(false), 100);
    socket.once("connect", () => {
      finish(true);
    });
    socket.once("error", () => {
      finish(false);
    });
  });
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "auto";
}

function applyMigrationSql(
  database: DatabaseSync,
  sql: string,
  fileName: string
): void {
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    try {
      database.exec(statement);
    } catch (error) {
      if (isUnsupportedFts5Statement(statement, error)) {
        console.warn(
          `Skipping FTS5 statement in ${fileName} because this SQLite build does not include FTS5 support.`
        );
        continue;
      }
      throw error;
    }
  }
}

export async function startDevHub(options: {
  cwd: string;
  template: SyncoreTemplateName;
}): Promise<DevHubSessionState> {
  const dashboardPort = resolvePortFromEnv("SYNCORE_DASHBOARD_PORT", 4310);
  const devtoolsPort = resolvePortFromEnv("SYNCORE_DEVTOOLS_PORT", 4311);
  const dashboardUrl = `http://localhost:${dashboardPort}`;
  const devtoolsUrl = `ws://127.0.0.1:${devtoolsPort}`;
  const logsDirectory = path.join(options.cwd, ".syncore", "logs");
  const logFilePath = path.join(logsDirectory, "runtime.jsonl");
  const hubAccessToken =
    sanitizeDevtoolsToken(process.env.SYNCORE_DEVTOOLS_TOKEN) ??
    generateDevtoolsToken();
  const sessionState: DevHubSessionState = {
    dashboardUrl,
    authenticatedDashboardUrl: `${dashboardUrl}/?token=${hubAccessToken}`,
    devtoolsUrl,
    token: hubAccessToken
  };
  await mkdir(logsDirectory, { recursive: true });
  await writeFile(logFilePath, "");
  await runDevProjectBootstrap(options.cwd, options.template);
  await setupDevProjectWatch(options.cwd, options.template);

  if (await isLocalPortInUse(devtoolsPort)) {
    const activeSessionState =
      (await readDevtoolsSessionState(options.cwd)) ?? sessionState;
    console.log(
      `Syncore devtools hub already running at ws://localhost:${devtoolsPort}. Reusing existing hub/dashboard.`
    );
    console.log(`Devtools dashboard token: ${activeSessionState.token}`);
    console.log(`Dashboard shell: ${activeSessionState.authenticatedDashboardUrl}`);
    return activeSessionState;
  }
  await writeDevtoolsSessionState(options.cwd, sessionState);

  const httpServer = createServer((request, response) => {
    void handleStorageAccessHttpRequest(request, response).catch((error) => {
      if (!response.headersSent) {
        writeJsonResponse(response, 500, { error: formatError(error) });
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    });
  });
  const websocketServer = new WebSocketServer({ server: httpServer });
  const storageAccessTickets = new Map<string, StorageAccessTicket>();
  const pendingHubCommands = new Map<string, PendingHubCommand>();
  const runtimeSockets = new Map<string, WebSocket>();
  const runtimeHellos = new Map<
    string,
    Extract<SyncoreDevtoolsMessage, { type: "hello" }>
  >();
  const runtimeEvents = new Map<
    string,
    Array<Extract<SyncoreDevtoolsMessage, { type: "event" }>["event"]>
  >();
  const socketRuntimeIds = new Map<WebSocket, Set<string>>();
  const dashboardSockets = new Set<WebSocket>();
  const dashboardSubscriptions = new Map<
    WebSocket,
    Map<string, { runtimeId: string; payload: SyncoreDevtoolsSubscribe }>
  >();
  let relayExternalChange: (
    sourceRuntimeId: string,
    storageIdentity: string,
    event: SyncoreExternalChangeEvent
  ) => void = () => {};
  const projectTargetExternalChangeSignal = new HubExternalChangeSignal(
    (event) =>
      relayExternalChange(
        PROJECT_TARGET_RUNTIME_ID,
        runtimeHellos.get(PROJECT_TARGET_RUNTIME_ID)?.storageIdentity ?? "",
        event
      )
  );
  let projectTargetBackend: ProjectTargetBackend | null = null;
  try {
    projectTargetBackend = await createProjectTargetBackend(
      options.cwd,
      projectTargetExternalChangeSignal
    );
  } catch (error) {
    console.warn(`Project target fallback unavailable: ${formatError(error)}`);
  }
  const hello: SyncoreDevtoolsMessage = {
    type: "hello",
    protocolVersion: SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
    minSupportedProtocolVersion:
      SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
    maxSupportedProtocolVersion:
      SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
    runtimeId: "syncore-dev-hub",
    platform: "dev"
  };
  if (projectTargetBackend) {
    runtimeHellos.set(PROJECT_TARGET_RUNTIME_ID, projectTargetBackend.hello);
    runtimeEvents.set(PROJECT_TARGET_RUNTIME_ID, []);
  }
  relayExternalChange = (sourceRuntimeId, storageIdentity, event) => {
    if (!storageIdentity) {
      return;
    }
    const message = {
      type: "external.change",
      runtimeId: sourceRuntimeId,
      storageIdentity,
      event
    } satisfies SyncoreDevtoolsMessage;

    for (const [runtimeId, runtimeHello] of runtimeHellos) {
      if (
        runtimeId === sourceRuntimeId ||
        runtimeHello.storageIdentity !== storageIdentity
      ) {
        continue;
      }
      if (runtimeId === PROJECT_TARGET_RUNTIME_ID) {
        projectTargetExternalChangeSignal.receive(event);
        continue;
      }
      const targetSocket = runtimeSockets.get(runtimeId);
      if (targetSocket?.readyState === WebSocket.OPEN) {
        targetSocket.send(JSON.stringify(message));
      }
    }
  };
  const appendHubLog = async (
    event: Extract<SyncoreDevtoolsMessage, { type: "event" }>["event"]
  ) => {
    const runtimeHello = runtimeHellos.get(event.runtimeId);
    const clientRuntimeIds = [...runtimeHellos.values()]
      .filter((hello) => hello.runtimeId !== "syncore-dev-hub")
      .map((hello) => hello.runtimeId)
      .sort();
    const clientTargetKeys = [...runtimeHellos.values()]
      .filter((hello) => hello.runtimeId !== "syncore-dev-hub")
      .map((hello) => hello.storageIdentity ?? `runtime::${hello.runtimeId}`)
      .sort();
    const targetIdentity =
      runtimeHello?.storageIdentity ?? `runtime::${event.runtimeId}`;
    const targetId =
      event.runtimeId === "syncore-dev-hub"
        ? "all"
        : createPublicTargetId(targetIdentity, clientTargetKeys);
    const publicRuntimeId =
      event.runtimeId === "syncore-dev-hub"
        ? undefined
        : createPublicRuntimeId(event.runtimeId, clientRuntimeIds);
    const category =
      event.type === "query.executed"
        ? "query"
        : event.type === "mutation.committed"
          ? "mutation"
          : event.type === "action.completed"
            ? "action"
            : "system";
    const message =
      event.type === "log"
        ? event.message
        : event.type === "query.executed" ||
            event.type === "mutation.committed" ||
            event.type === "action.completed"
          ? event.functionName
          : event.type;
    await appendFile(
      logFilePath,
      `${JSON.stringify({
        version: 2,
        timestamp: event.timestamp,
        runtimeId: event.runtimeId,
        targetId,
        ...(publicRuntimeId ? { publicRuntimeId } : {}),
        ...(runtimeHello?.platform ? { platform: runtimeHello.platform } : {}),
        eventType: event.type,
        category,
        message,
        event
      })}\n`
    );
  };

  const requestRuntimeCommand = async (
    targetRuntimeId: string,
    payload: SyncoreDevtoolsCommandPayload,
    timeoutMs = 30_000
  ): Promise<SyncoreDevtoolsCommandResultPayload> => {
    if (targetRuntimeId === PROJECT_TARGET_RUNTIME_ID && projectTargetBackend) {
      return projectTargetBackend.handleCommand(payload);
    }
    const target = runtimeSockets.get(targetRuntimeId);
    if (!target || target.readyState !== WebSocket.OPEN) {
      throw new Error(`Runtime ${targetRuntimeId} is not connected.`);
    }
    const commandId = `hub:${randomUUID()}`;
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingHubCommands.delete(commandId);
        reject(new Error(`Runtime command ${payload.kind} timed out.`));
      }, timeoutMs);
      pendingHubCommands.set(commandId, {
        resolve,
        reject,
        timeout
      });
      target.send(
        JSON.stringify({
          type: "command",
          commandId,
          targetRuntimeId,
          payload
        } satisfies SyncoreDevtoolsClientMessage)
      );
    });
  };

  const createStorageAccessTicket = async (
    targetRuntimeId: string,
    id: string,
    purpose: "preview" | "download"
  ): Promise<
    Extract<
      SyncoreDevtoolsCommandResultPayload,
      { kind: "storage.access.create.result" }
    >
  > => {
    const metadata = await requestRuntimeCommand(targetRuntimeId, {
      kind: "storage.readRange",
      id,
      offset: 0,
      length: 0
    });
    if (metadata.kind !== "storage.readRange.result") {
      return {
        kind: "storage.access.create.result",
        error: "Runtime returned an unexpected storage access response."
      };
    }
    if (metadata.error || !metadata.entry) {
      return {
        kind: "storage.access.create.result",
        error: metadata.error ?? "Storage object could not be accessed."
      };
    }
    const ticket = randomUUID();
    const expiresAt = Date.now() + STORAGE_ACCESS_TICKET_TTL_MS;
    storageAccessTickets.set(ticket, {
      id: ticket,
      runtimeId: targetRuntimeId,
      storageId: id,
      purpose,
      entry: metadata.entry,
      supportsRange: metadata.supportsRange,
      expiresAt
    });
    cleanupExpiredStorageTickets();
    return {
      kind: "storage.access.create.result",
      entry: metadata.entry,
      url: `http://127.0.0.1:${devtoolsPort}/storage/access/${ticket}`,
      expiresAt,
      supportsRange: metadata.supportsRange,
      maxPreviewBytes: STORAGE_ACCESS_MAX_PREVIEW_BYTES
    };
  };

  const cleanupExpiredStorageTickets = () => {
    const now = Date.now();
    for (const [ticket, access] of storageAccessTickets) {
      if (access.expiresAt <= now) {
        storageAccessTickets.delete(ticket);
      }
    }
  };

  const handleStorageAccessHttpRequest = async (
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> => {
    setStorageCorsHeaders(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    const requestUrl = new URL(
      request.url ?? "/",
      `http://127.0.0.1:${devtoolsPort}`
    );
    const match = /^\/storage\/access\/([^/]+)$/.exec(requestUrl.pathname);
    if (!match) {
      writeJsonResponse(response, 200, { ok: true, wsPort: devtoolsPort });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      writeTextResponse(response, 405, "Method not allowed.");
      return;
    }
    cleanupExpiredStorageTickets();
    const ticket = storageAccessTickets.get(match[1]!);
    if (!ticket || ticket.expiresAt <= Date.now()) {
      writeTextResponse(
        response,
        401,
        "Storage access ticket is invalid or expired."
      );
      return;
    }

    const range = parseStorageRangeHeader(
      request.headers.range,
      ticket.entry.size
    );
    if ("error" in range) {
      writeTextResponse(response, range.status, range.error);
      return;
    }
    const start = range.start;
    const end = range.end;
    const byteLength = end >= start ? end - start + 1 : 0;
    if (
      !ticket.supportsRange &&
      ticket.entry.size > STORAGE_ACCESS_CHUNK_BYTES
    ) {
      writeTextResponse(
        response,
        409,
        "This storage backend does not support streaming large files."
      );
      return;
    }

    writeStorageAccessHeaders(response, ticket, {
      status: range.partial ? 206 : 200,
      start,
      end,
      byteLength
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    let offset = start;
    while (offset <= end) {
      const chunkLength = Math.min(
        STORAGE_ACCESS_CHUNK_BYTES,
        end - offset + 1
      );
      const chunk = await requestRuntimeCommand(
        ticket.runtimeId,
        {
          kind: "storage.readRange",
          id: ticket.storageId,
          offset,
          length: chunkLength
        },
        60_000
      );
      if (chunk.kind !== "storage.readRange.result") {
        throw new Error(
          "Runtime returned an unexpected storage chunk response."
        );
      }
      if (chunk.error || !chunk.base64) {
        throw new Error(chunk.error ?? "Storage chunk could not be read.");
      }
      const bytes = Buffer.from(chunk.base64, "base64");
      if (bytes.byteLength === 0) {
        break;
      }
      await writeResponseChunk(response, bytes);
      offset += bytes.byteLength;
    }
    response.end();
  };

  websocketServer.on("connection", (socket: WebSocket, request) => {
    const isBrowserDashboardClient = isAllowedDashboardOrigin(
      request.headers.origin,
      dashboardPort
    );
    const isAuthorizedDashboardClient =
      !isBrowserDashboardClient ||
      isAuthorizedDashboardRequest({
        requestUrl: request.url,
        originHeader: request.headers.origin,
        dashboardPort,
        expectedToken: hubAccessToken
      });
    if (isBrowserDashboardClient && !isAuthorizedDashboardClient) {
      socket.close(1008, "Unauthorized devtools client");
      return;
    }
    dashboardSockets.add(socket);
    socket.send(JSON.stringify(hello));
    for (const runtimeHello of runtimeHellos.values()) {
      socket.send(JSON.stringify(runtimeHello));
    }
    for (const [runtimeId, history] of runtimeEvents) {
      if (!runtimeHellos.has(runtimeId)) {
        continue;
      }
      if (history.length === 0) {
        continue;
      }
      socket.send(
        JSON.stringify({
          type: "event.batch",
          runtimeId,
          events: [...history]
        })
      );
    }

    socket.on("message", (payload) => {
      const rawPayload = decodeWebSocketPayload(payload);
      if (rawPayload.length === 0) {
        return;
      }
      const message = JSON.parse(rawPayload) as
        | SyncoreDevtoolsMessage
        | (SyncoreDevtoolsClientMessage & { targetRuntimeId?: string });
      if (message.type === "ping") {
        if (!isAuthorizedDashboardClient) {
          socket.close(1008, "Unauthorized devtools client");
          return;
        }
        socket.send(
          JSON.stringify({ type: "pong" } satisfies SyncoreDevtoolsMessage)
        );
        return;
      }
      if (message.type === "external.change") {
        const runtimeHello = runtimeHellos.get(message.runtimeId);
        const storageIdentity =
          runtimeHello?.storageIdentity ?? message.storageIdentity;
        if (storageIdentity && storageIdentity === message.storageIdentity) {
          relayExternalChange(
            message.runtimeId,
            storageIdentity,
            message.event as SyncoreExternalChangeEvent
          );
        }
        return;
      }
      if (message.type === "command") {
        if (!isAuthorizedDashboardClient) {
          return;
        }
        const targetRuntimeId = message.targetRuntimeId;
        if (!targetRuntimeId) {
          return;
        }
        if (message.payload.kind === "storage.access.create") {
          void createStorageAccessTicket(
            targetRuntimeId,
            message.payload.id,
            message.payload.purpose
          )
            .then((payload) => {
              if (socket.readyState !== WebSocket.OPEN) {
                return;
              }
              socket.send(
                JSON.stringify({
                  type: "command.result",
                  commandId: message.commandId,
                  runtimeId: targetRuntimeId,
                  payload
                } satisfies SyncoreDevtoolsMessage)
              );
            })
            .catch((error) => {
              if (socket.readyState !== WebSocket.OPEN) {
                return;
              }
              socket.send(
                JSON.stringify({
                  type: "command.result",
                  commandId: message.commandId,
                  runtimeId: targetRuntimeId,
                  payload: {
                    kind: "storage.access.create.result",
                    error: formatError(error)
                  }
                } satisfies SyncoreDevtoolsMessage)
              );
            });
          return;
        }
        if (
          targetRuntimeId === PROJECT_TARGET_RUNTIME_ID &&
          projectTargetBackend
        ) {
          void (async () => {
            const payload = await projectTargetBackend.handleCommand(
              message.payload
            );
            if (socket.readyState !== WebSocket.OPEN) {
              return;
            }
            socket.send(
              JSON.stringify({
                type: "command.result",
                commandId: message.commandId,
                runtimeId: PROJECT_TARGET_RUNTIME_ID,
                payload
              } satisfies SyncoreDevtoolsMessage)
            );
          })();
          return;
        }
        const target = runtimeSockets.get(targetRuntimeId);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(message));
        }
        return;
      }
      if (message.type === "subscribe") {
        if (!isAuthorizedDashboardClient) {
          return;
        }
        const targetRuntimeId = message.targetRuntimeId;
        if (!targetRuntimeId) {
          return;
        }
        const subscriptions =
          dashboardSubscriptions.get(socket) ??
          new Map<
            string,
            { runtimeId: string; payload: SyncoreDevtoolsSubscribe }
          >();
        subscriptions.set(message.subscriptionId, {
          runtimeId: targetRuntimeId,
          payload: message
        });
        dashboardSubscriptions.set(socket, subscriptions);
        if (
          targetRuntimeId === PROJECT_TARGET_RUNTIME_ID &&
          projectTargetBackend
        ) {
          void projectTargetBackend
            .subscribe(message.subscriptionId, message.payload, (payload) => {
              if (socket.readyState !== WebSocket.OPEN) {
                return;
              }
              socket.send(
                JSON.stringify({
                  type: "subscription.data",
                  subscriptionId: message.subscriptionId,
                  runtimeId: PROJECT_TARGET_RUNTIME_ID,
                  payload
                } satisfies SyncoreDevtoolsMessage)
              );
            })
            .catch((error) => {
              if (socket.readyState !== WebSocket.OPEN) {
                return;
              }
              socket.send(
                JSON.stringify({
                  type: "subscription.error",
                  subscriptionId: message.subscriptionId,
                  runtimeId: PROJECT_TARGET_RUNTIME_ID,
                  error: formatError(error)
                } satisfies SyncoreDevtoolsMessage)
              );
            });
          return;
        }
        const target = runtimeSockets.get(targetRuntimeId);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(message));
        }
        return;
      }
      if (message.type === "unsubscribe") {
        if (!isAuthorizedDashboardClient) {
          return;
        }
        const subscriptions = dashboardSubscriptions.get(socket);
        const subscription = subscriptions?.get(message.subscriptionId);
        if (!subscription) {
          return;
        }
        if (
          subscription.runtimeId === PROJECT_TARGET_RUNTIME_ID &&
          projectTargetBackend
        ) {
          projectTargetBackend.unsubscribe(message.subscriptionId);
          subscriptions?.delete(message.subscriptionId);
          if (subscriptions && subscriptions.size === 0) {
            dashboardSubscriptions.delete(socket);
          }
          return;
        }
        const target = runtimeSockets.get(subscription.runtimeId);
        if (target && target.readyState === WebSocket.OPEN) {
          const runtimeMessage: SyncoreDevtoolsUnsubscribe = {
            type: "unsubscribe",
            subscriptionId: message.subscriptionId,
            targetRuntimeId: subscription.runtimeId
          };
          target.send(JSON.stringify(runtimeMessage));
        }
        subscriptions?.delete(message.subscriptionId);
        if (subscriptions && subscriptions.size === 0) {
          dashboardSubscriptions.delete(socket);
        }
        return;
      }
      if (message.type === "hello") {
        dashboardSockets.delete(socket);
        runtimeSockets.set(message.runtimeId, socket);
        runtimeHellos.set(message.runtimeId, message);
        runtimeEvents.set(message.runtimeId, []);
        const runtimeIds = socketRuntimeIds.get(socket) ?? new Set<string>();
        runtimeIds.add(message.runtimeId);
        socketRuntimeIds.set(socket, runtimeIds);
        for (const [dashboardSocket, subscriptions] of dashboardSubscriptions) {
          if (dashboardSocket.readyState !== WebSocket.OPEN) {
            continue;
          }
          for (const subscription of subscriptions.values()) {
            if (subscription.runtimeId !== message.runtimeId) {
              continue;
            }
            socket.send(JSON.stringify(subscription.payload));
          }
        }
        for (const client of dashboardSockets) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        }
        return;
      }
      const encoded = JSON.stringify(message);
      if (
        message.type === "event" &&
        message.event.type === "runtime.disconnected"
      ) {
        runtimeHellos.delete(message.event.runtimeId);
      }
      if (
        message.type === "event" &&
        message.event.runtimeId !== "syncore-dev-hub"
      ) {
        const history = runtimeEvents.get(message.event.runtimeId) ?? [];
        history.push(message.event);
        runtimeEvents.set(message.event.runtimeId, history.slice(-200));
        if (message.event.type === "runtime.disconnected") {
          runtimeEvents.delete(message.event.runtimeId);
        }
        void appendHubLog(message.event);
      } else if (message.type === "event") {
        void appendHubLog(message.event);
      }
      if (
        message.type === "command.result" ||
        message.type === "subscription.data" ||
        message.type === "subscription.error"
      ) {
        if (message.type === "command.result") {
          const pending = pendingHubCommands.get(message.commandId);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingHubCommands.delete(message.commandId);
            pending.resolve(message.payload);
            return;
          }
        }
        for (const client of dashboardSockets) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(encoded);
          }
        }
        return;
      }
      for (const client of dashboardSockets) {
        if (client === socket || client.readyState !== WebSocket.OPEN) {
          continue;
        }
        client.send(encoded);
      }
    });

    socket.on("close", () => {
      dashboardSockets.delete(socket);
      const subscriptions = dashboardSubscriptions.get(socket);
      if (subscriptions) {
        for (const [subscriptionId, subscription] of subscriptions) {
          if (
            subscription.runtimeId === PROJECT_TARGET_RUNTIME_ID &&
            projectTargetBackend
          ) {
            projectTargetBackend.unsubscribe(subscriptionId);
            continue;
          }
          const target = runtimeSockets.get(subscription.runtimeId);
          if (target && target.readyState === WebSocket.OPEN) {
            const message: SyncoreDevtoolsUnsubscribe = {
              type: "unsubscribe",
              subscriptionId,
              targetRuntimeId: subscription.runtimeId
            };
            target.send(JSON.stringify(message));
          }
        }
        dashboardSubscriptions.delete(socket);
      }
      const runtimeIds = socketRuntimeIds.get(socket);
      if (!runtimeIds) {
        return;
      }
      for (const runtimeId of runtimeIds) {
        if (runtimeSockets.get(runtimeId) === socket) {
          if (runtimeHellos.has(runtimeId)) {
            const disconnectedEvent: SyncoreDevtoolsMessage = {
              type: "event",
              event: {
                type: "runtime.disconnected",
                runtimeId,
                timestamp: Date.now()
              }
            };
            const payload = JSON.stringify(disconnectedEvent);
            void appendHubLog(disconnectedEvent.event);
            for (const client of dashboardSockets) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
              }
            }
          }
          runtimeSockets.delete(runtimeId);
          runtimeHellos.delete(runtimeId);
          runtimeEvents.delete(runtimeId);
        }
      }
      socketRuntimeIds.delete(socket);
    });
  });

  httpServer.on("error", (error) => {
    console.error(`Syncore devtools hub failed: ${formatError(error)}`);
    process.exit(1);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(devtoolsPort, "127.0.0.1", () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
  console.log(`Syncore devtools hub: ws://localhost:${devtoolsPort}`);
  console.log(`Devtools dashboard token: ${hubAccessToken}`);
  console.log(
    `Electron/Node runtimes: set devtoolsUrl to ws://localhost:${devtoolsPort}.`
  );
  console.log(
    `Web/Next apps: connect the dashboard or worker bridge to ws://localhost:${devtoolsPort}.`
  );
  console.log(
    "Expo apps: use the same hub URL through LAN or adb reverse while developing."
  );
  let dashboardStaticServer: ReturnType<typeof createServer> | undefined;
  const dashboardStaticRoot = await resolvePackagedDashboardRoot();
  if (!dashboardStaticRoot) {
    throw new Error(
      "Syncore Dashboard build is missing. Expected the packaged dashboard at syncorejs/dist/_dashboard/index.html. Rebuild syncorejs before running `syncorejs dev`."
    );
  }
  try {
    dashboardStaticServer = await startPackagedDashboardServer(
      dashboardStaticRoot,
      dashboardPort
    );
    console.log(`Dashboard shell: ${sessionState.authenticatedDashboardUrl}`);
  } catch (error) {
    throw new Error(
      `Syncore Dashboard shell could not start: ${formatError(error)}`, { cause: error }
    );
  }

  const close = () => {
    void projectTargetBackend?.dispose();
    dashboardStaticServer?.close();
    websocketServer.close();
    httpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  return sessionState;
}

async function resolvePackagedDashboardRoot(): Promise<string | null> {
  const candidates = [
    path.resolve(CORE_PACKAGE_ROOT, "..", "_dashboard"),
    path.resolve(CORE_PACKAGE_ROOT, "_dashboard"),
    path.resolve(CORE_PACKAGE_ROOT, "..", "syncore", "dist", "_dashboard")
  ];
  for (const candidate of candidates) {
    if (await fileExists(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return null;
}

async function startPackagedDashboardServer(
  root: string,
  port: number
): Promise<ReturnType<typeof createServer>> {
  const server = createServer((request, response) => {
    void serveDashboardAsset(root, request, response).catch((error) => {
      if (!response.headersSent) {
        writeTextResponse(response, 500, formatError(error));
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

async function serveDashboardAsset(
  root: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    writeTextResponse(response, 405, "Method not allowed.");
    return;
  }
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const requestedPath = decodeURIComponent(requestUrl.pathname);
  const relativePath =
    requestedPath === "/" ? "index.html" : requestedPath.slice(1);
  let assetPath = path.resolve(root, relativePath);
  if (!isPathInside(root, assetPath)) {
    writeTextResponse(response, 403, "Forbidden.");
    return;
  }
  try {
    const info = await stat(assetPath);
    if (info.isDirectory()) {
      assetPath = path.join(assetPath, "index.html");
    }
  } catch {
    assetPath = path.join(root, "index.html");
  }
  if (!isPathInside(root, assetPath)) {
    writeTextResponse(response, 403, "Forbidden.");
    return;
  }
  const body = await readFile(assetPath);
  response.writeHead(200, {
    "Content-Type": getDashboardAssetContentType(assetPath),
    "Content-Length": body.byteLength
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  response.end(body);
}

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function getDashboardAssetContentType(filePath: string): string {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".ico":
      return "image/x-icon";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function setStorageCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Range");
  response.setHeader(
    "Access-Control-Expose-Headers",
    "Accept-Ranges, Content-Disposition, Content-Length, Content-Range, Content-Type"
  );
}

function writeJsonResponse(
  response: ServerResponse,
  status: number,
  payload: unknown
): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function writeTextResponse(
  response: ServerResponse,
  status: number,
  message: string
): void {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(message);
}

function parseStorageRangeHeader(
  header: string | undefined,
  size: number
):
  | { start: number; end: number; partial: boolean }
  | {
      error: string;
      status: number;
    } {
  if (size === 0) {
    if (!header) {
      return { start: 0, end: -1, partial: false };
    }
    return { error: "Requested range is not satisfiable.", status: 416 };
  }
  if (!header) {
    return { start: 0, end: size - 1, partial: false };
  }
  if (header.includes(",")) {
    return { error: "Multi-range requests are not supported.", status: 416 };
  }
  const match = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (!match) {
    return { error: "Only simple byte ranges are supported.", status: 416 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return { error: "Requested range is not satisfiable.", status: 416 };
  }
  return { start, end: Math.min(end, size - 1), partial: true };
}

function writeStorageAccessHeaders(
  response: ServerResponse,
  ticket: StorageAccessTicket,
  range: { status: number; start: number; end: number; byteLength: number }
): void {
  const headers: Record<string, string | number> = {
    "content-type": ticket.entry.contentType ?? "application/octet-stream",
    "content-length": range.byteLength,
    "accept-ranges": ticket.supportsRange ? "bytes" : "none",
    "content-disposition": renderStorageContentDisposition(ticket)
  };
  if (range.status === 206) {
    headers["content-range"] =
      `bytes ${range.start}-${range.end}/${ticket.entry.size}`;
  }
  response.writeHead(range.status, headers);
}

function renderStorageContentDisposition(ticket: StorageAccessTicket): string {
  const mode = ticket.purpose === "download" ? "attachment" : "inline";
  const fallback = sanitizeHeaderFilename(
    ticket.entry.fileName ?? ticket.entry.id
  );
  const encoded = encodeURIComponent(
    ticket.entry.fileName ?? `${ticket.entry.id}.bin`
  );
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function sanitizeHeaderFilename(value: string): string {
  return value.replaceAll(/["\\\r\n]/g, "_");
}

async function writeResponseChunk(
  response: ServerResponse,
  chunk: Buffer
): Promise<void> {
  if (response.write(chunk)) {
    return;
  }
  await new Promise<void>((resolve) => {
    response.once("drain", resolve);
  });
}

async function writeDevtoolsSessionState(
  cwd: string,
  state: DevHubSessionState
): Promise<void> {
  const sessionPath = path.join(cwd, DEVTOOLS_SESSION_FILE);
  await mkdir(path.dirname(sessionPath), { recursive: true });
  await writeFile(sessionPath, `${JSON.stringify(state, null, 2)}\n`);
}

async function readDevtoolsSessionState(
  cwd: string
): Promise<DevHubSessionState | null> {
  const sessionPath = path.join(cwd, DEVTOOLS_SESSION_FILE);
  if (!(await fileExists(sessionPath))) {
    return null;
  }

  try {
    const source = await readFile(sessionPath, "utf8");
    const parsed = JSON.parse(source) as Partial<DevHubSessionState>;
    if (
      typeof parsed.dashboardUrl !== "string" ||
      typeof parsed.authenticatedDashboardUrl !== "string" ||
      typeof parsed.devtoolsUrl !== "string" ||
      typeof parsed.token !== "string"
    ) {
      return null;
    }
    return {
      dashboardUrl: parsed.dashboardUrl,
      authenticatedDashboardUrl: parsed.authenticatedDashboardUrl,
      devtoolsUrl: parsed.devtoolsUrl,
      token: parsed.token
    };
  } catch {
    return null;
  }
}

async function setupDevProjectWatch(
  cwd: string,
  template: SyncoreTemplateName
): Promise<void> {
  const snapshot = await createDevWatchSnapshot(cwd);
  if (snapshot.size === 0) {
    return;
  }

  console.log("Watching syncore/ for changes.");
  let lastSnapshot = snapshot;
  const interval = setInterval(() => {
    void (async () => {
      const nextSnapshot = await createDevWatchSnapshot(cwd);
      if (!areDevWatchSnapshotsEqual(lastSnapshot, nextSnapshot)) {
        lastSnapshot = nextSnapshot;
        scheduleDevProjectBootstrap(cwd, template);
      }
    })();
  }, 500);

  const dispose = () => {
    clearInterval(interval);
  };

  process.once("SIGINT", dispose);
  process.once("SIGTERM", dispose);
}

function scheduleDevProjectBootstrap(
  cwd: string,
  template: SyncoreTemplateName
): void {
  if (pendingDevBootstrap) {
    clearTimeout(pendingDevBootstrap);
  }
  pendingDevBootstrap = setTimeout(() => {
    void runDevProjectBootstrap(cwd, template);
  }, 150);
}

export async function runDevProjectBootstrap(
  cwd: string,
  template: SyncoreTemplateName
): Promise<void> {
  if (devBootstrapInFlight) {
    scheduleDevProjectBootstrap(cwd, template);
    return;
  }

  devBootstrapInFlight = true;
  try {
    await ensureProjectScaffolded(cwd, template);
    await runCodegen(cwd);
    const schema = await loadProjectSchema(cwd);
    const currentSnapshot = createSchemaSnapshot(schema);
    const storedSnapshot = await readStoredSnapshot(cwd);
    const plan = diffSchemaSnapshots(storedSnapshot, currentSnapshot);

    if (plan.destructiveChanges.length > 0) {
      console.error("Syncore dev blocked by destructive schema changes:");
      for (const destructiveChange of plan.destructiveChanges) {
        console.error(`- ${destructiveChange}`);
      }
      return;
    }

    if (storedSnapshot?.hash !== currentSnapshot.hash) {
      await writeStoredSnapshot(cwd, currentSnapshot);
      if (plan.statements.length > 0 || plan.warnings.length > 0) {
        console.log(
          `Schema snapshot updated (${plan.statements.length} statement(s), ${plan.warnings.length} warning(s)).`
        );
      } else {
        console.log("Schema snapshot updated.");
      }
    }

    for (const warning of plan.warnings) {
      console.warn(`Syncore dev warning: ${warning}`);
    }

    if (templateUsesConnectedClients(template)) {
      console.log(
        "Syncore dev is ready. Codegen refreshed; waiting for a connected client runtime to apply schema locally."
      );
      return;
    }

    const appliedCount = await applyProjectMigrations(cwd);
    console.log(
      `Syncore dev is ready. Codegen refreshed; ${appliedCount} migration(s) applied.`
    );
  } catch (error) {
    console.error(`Syncore dev bootstrap failed: ${formatError(error)}`);
  } finally {
    devBootstrapInFlight = false;
  }
}

async function createDevWatchSnapshot(
  cwd: string
): Promise<Map<string, number>> {
  const snapshot = new Map<string, number>();
  const filesToCheck = [
    path.join(cwd, "syncore.config.ts"),
    path.join(cwd, "syncore", "schema.ts"),
    path.join(cwd, ".gitignore"),
    path.join(cwd, "package.json")
  ];
  for (const file of filesToCheck) {
    if (await fileExists(file)) {
      const info = await stat(file);
      snapshot.set(file, info.mtimeMs);
    }
  }

  for (const directory of [
    path.join(cwd, "syncore", "functions"),
    path.join(cwd, "syncore", "migrations")
  ]) {
    for (const file of await listFilesRecursively(directory)) {
      const info = await stat(file);
      snapshot.set(file, info.mtimeMs);
    }
  }

  return snapshot;
}

async function listFilesRecursively(directory: string): Promise<string[]> {
  if (!(await fileExists(directory))) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursively(fullPath);
      }
      if (entry.isFile()) {
        return [fullPath];
      }
      return [];
    })
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
}

function areDevWatchSnapshotsEqual(
  left: Map<string, number>,
  right: Map<string, number>
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [filePath, leftTimestamp] of left) {
    if (right.get(filePath) !== leftTimestamp) {
      return false;
    }
  }
  return true;
}

function decodeWebSocketPayload(
  payload: string | Buffer | ArrayBuffer | Buffer[]
): string {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload instanceof Buffer) {
    return payload.toString("utf8");
  }
  if (Array.isArray(payload)) {
    return Buffer.concat(payload).toString("utf8");
  }
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload).toString("utf8");
  }
  return Buffer.from(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength
  ).toString("utf8");
}

function isUnsupportedFts5Statement(
  statement: string,
  error: unknown
): boolean {
  if (!/using\s+fts5/i.test(statement)) {
    return false;
  }
  return error instanceof Error && /fts5/i.test(error.message);
}

function unwrapDefaultExport<TValue>(value: TValue): TValue {
  if (
    value &&
    typeof value === "object" &&
    "default" in (value as Record<string, unknown>) &&
    (value as Record<string, unknown>).default !== undefined
  ) {
    return unwrapDefaultExport(
      (value as Record<string, unknown>).default as TValue
    );
  }
  return value;
}

export function resolvePortFromEnv(
  environmentVariable: string,
  fallback: number
): number {
  const rawValue = process.env[environmentVariable];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(
      `${environmentVariable} must be a positive integer when provided.`
    );
  }

  return parsed;
}

function isCliEntryPoint(): boolean {
  const entryPath = process.argv[1];
  if (!entryPath) {
    return false;
  }
  return (
    path.resolve(entryPath) === path.resolve(fileURLToPath(import.meta.url))
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)])
    );
  }
  return value;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function toSearchValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return stableStringify(value);
}
