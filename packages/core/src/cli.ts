#!/usr/bin/env node

import { readdir, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { Command } from "commander";
import { tsImport } from "tsx/esm/api";
import WebSocket, { WebSocketServer } from "ws";
import type { SyncoreDevtoolsMessage } from "@syncore/devtools-protocol";
import {
  type AnyTableDefinition,
  createSchemaSnapshot,
  diffSchemaSnapshots,
  parseSchemaSnapshot,
  renderCreateIndexStatement,
  renderCreateSearchIndexStatement,
  renderCreateTableStatement,
  renderMigrationSql,
  searchIndexTableName,
  type SchemaSnapshot,
  type SyncoreSchema,
  type TableDefinition,
  type Validator
} from "./index.js";

interface SyncoreConfig {
  databasePath: string;
  storageDirectory: string;
}

type SyncoreTemplateName =
  | "minimal"
  | "node"
  | "react-web"
  | "expo"
  | "electron"
  | "next";

interface SyncoreTemplateFile {
  path: string;
  content: string;
}

interface ScaffoldProjectOptions {
  template: SyncoreTemplateName;
  force?: boolean;
}

interface ScaffoldProjectResult {
  template: SyncoreTemplateName;
  created: string[];
  updated: string[];
  skipped: string[];
}

interface PackageJsonShape {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const program = new Command();
const migrationSnapshotFileName = "_schema_snapshot.json";
const validTemplates: SyncoreTemplateName[] = [
  "minimal",
  "node",
  "react-web",
  "expo",
  "electron",
  "next"
];
let pendingDevBootstrap: NodeJS.Timeout | undefined;
let devBootstrapInFlight = false;

program
  .name("syncore")
  .description("Syncore local-first toolkit CLI")
  .version("0.1.0");

program
  .command("init")
  .description("Scaffold Syncore in the current directory")
  .option(
    "--template <template>",
    `Template to scaffold (${validTemplates.join(", ")}, or auto)`,
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
      "Next: run `npx syncore dev` to keep codegen and local migrations in sync."
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
    `Template to scaffold when Syncore is missing (${validTemplates.join(", ")}, or auto)`,
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

async function runCodegen(cwd: string): Promise<void> {
  const functionsDir = path.join(cwd, "syncore", "functions");
  const generatedDir = path.join(cwd, "syncore", "_generated");
  await mkdir(generatedDir, { recursive: true });
  const functionImportExtension = await resolveFunctionImportExtension(cwd);

  const files = await listTypeScriptFiles(functionsDir);
  const functionEntries: Array<{
    pathParts: string[];
    exportName: string;
    kind: "query" | "mutation" | "action";
  }> = [];

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
    `/* eslint-disable */`,
    `/**`,
    ` * Generated \`api\` utility for referencing Syncore functions.`,
    ` *`,
    ` * THIS CODE IS AUTOMATICALLY GENERATED.`,
    ` *`,
    ` * To regenerate, run \`npx syncore dev\` or \`npx syncore codegen\`.`,
    ` * @module`,
    ` */`,
    ``,
    `import { createFunctionReferenceFor } from "syncore";`,
    `import type { FunctionReferenceFor } from "syncore";`,
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
    `/* eslint-disable */`,
    `/**`,
    ` * Generated Syncore function registry.`,
    ` *`,
    ` * THIS CODE IS AUTOMATICALLY GENERATED.`,
    ` *`,
    ` * To regenerate, run \`npx syncore dev\` or \`npx syncore codegen\`.`,
    ` * @module`,
    ` */`,
    ``,
    ...renderFunctionImports(functionEntries, functionImportExtension),
    ``,
    ...renderGeneratedFunctionsInterface(functionEntries),
    ``,
    `/**`,
    ` * The runtime registry for every function exported from \`syncore/functions\`.`,
    ` *`,
    ` * Most application code should import from \`./api\` instead of using this map directly.`,
    ` */`,
    `export const functions: SyncoreFunctionsRegistry = {`,
    ...functionEntries.map(
      (entry) =>
        `  ${JSON.stringify(`${entry.pathParts.join("/")}/${entry.exportName}`)}: ${renderFunctionImportName(entry)},`
    ),
    `} as const;`,
    ``
  ].join("\n");

  const serverSource = [
    `/* eslint-disable */`,
    `/**`,
    ` * Generated utilities for implementing Syncore query, mutation, and action functions.`,
    ` *`,
    ` * THIS CODE IS AUTOMATICALLY GENERATED.`,
    ` *`,
    ` * To regenerate, run \`npx syncore dev\` or \`npx syncore codegen\`.`,
    ` * @module`,
    ` */`,
    ``,
    `import type schema from "../schema${functionImportExtension}";`,
    `import { action as baseAction, mutation as baseMutation, query as baseQuery } from "syncore";`,
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
    `} from "syncore";`,
    ``,
    `export { createFunctionReference, createFunctionReferenceFor, v } from "syncore";`,
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
    `export type { FunctionReference } from "syncore";`,
    ``,
    `/**`,
    ` * Define a query in this Syncore app's public API.`,
    ` *`,
    ` * Queries can read from your local Syncore database and can be called from clients.`,
    ` *`,
    ` * @param config - The query definition, including args and a handler.`,
    ` * @returns The wrapped query. Export it from \`syncore/functions\` to add it to the generated API.`,
    ` */`,
    `export function query<TValidator extends Validator<unknown>, TResult>(`,
    `  config: FunctionConfig<QueryCtx, Infer<TValidator>, TResult> & { args: TValidator }`,
    `): SyncoreFunctionDefinition<"query", QueryCtx, Infer<TValidator>, TResult>;`,
    `export function query<TArgsShape extends ValidatorMap, TResult>(`,
    `  config: FunctionConfig<QueryCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }`,
    `): SyncoreFunctionDefinition<"query", QueryCtx, InferArgs<TArgsShape>, TResult>;`,
    `export function query<TArgsShape extends Validator<unknown> | ValidatorMap, TResult>(`,
    `  config: FunctionConfig<QueryCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }`,
    `) {`,
    `  return baseQuery(config as never) as SyncoreFunctionDefinition<`,
    `    "query",`,
    `    QueryCtx,`,
    `    InferArgs<TArgsShape>,`,
    `    TResult`,
    `  >;`,
    `}`,
    ``,
    `/**`,
    ` * Define a mutation in this Syncore app's public API.`,
    ` *`,
    ` * Mutations can write to your local Syncore database and can be called from clients.`,
    ` *`,
    ` * @param config - The mutation definition, including args and a handler.`,
    ` * @returns The wrapped mutation. Export it from \`syncore/functions\` to add it to the generated API.`,
    ` */`,
    `export function mutation<TValidator extends Validator<unknown>, TResult>(`,
    `  config: FunctionConfig<MutationCtx, Infer<TValidator>, TResult> & { args: TValidator }`,
    `): SyncoreFunctionDefinition<"mutation", MutationCtx, Infer<TValidator>, TResult>;`,
    `export function mutation<TArgsShape extends ValidatorMap, TResult>(`,
    `  config: FunctionConfig<MutationCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }`,
    `): SyncoreFunctionDefinition<"mutation", MutationCtx, InferArgs<TArgsShape>, TResult>;`,
    `export function mutation<TArgsShape extends Validator<unknown> | ValidatorMap, TResult>(`,
    `  config: FunctionConfig<MutationCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }`,
    `) {`,
    `  return baseMutation(config as never) as SyncoreFunctionDefinition<`,
    `    "mutation",`,
    `    MutationCtx,`,
    `    InferArgs<TArgsShape>,`,
    `    TResult`,
    `  >;`,
    `}`,
    ``,
    `/**`,
    ` * Define an action in this Syncore app's public API.`,
    ` *`,
    ` * Actions can run arbitrary JavaScript and may call queries or mutations.`,
    ` *`,
    ` * @param config - The action definition, including args and a handler.`,
    ` * @returns The wrapped action. Export it from \`syncore/functions\` to add it to the generated API.`,
    ` */`,
    `export function action<TValidator extends Validator<unknown>, TResult>(`,
    `  config: FunctionConfig<ActionCtx, Infer<TValidator>, TResult> & { args: TValidator }`,
    `): SyncoreFunctionDefinition<"action", ActionCtx, Infer<TValidator>, TResult>;`,
    `export function action<TArgsShape extends ValidatorMap, TResult>(`,
    `  config: FunctionConfig<ActionCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }`,
    `): SyncoreFunctionDefinition<"action", ActionCtx, InferArgs<TArgsShape>, TResult>;`,
    `export function action<TArgsShape extends Validator<unknown> | ValidatorMap, TResult>(`,
    `  config: FunctionConfig<ActionCtx, InferArgs<TArgsShape>, TResult> & { args: TArgsShape }`,
    `) {`,
    `  return baseAction(config as never) as SyncoreFunctionDefinition<`,
    `    "action",`,
    `    ActionCtx,`,
    `    InferArgs<TArgsShape>,`,
    `    TResult`,
    `  >;`,
    `}`,
    ``
  ].join("\n");

  await writeFile(path.join(generatedDir, "api.ts"), apiSource);
  await writeFile(path.join(generatedDir, "functions.ts"), functionsSource);
  await writeFile(path.join(generatedDir, "server.ts"), serverSource);
}

async function scaffoldProject(
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

  await ensurePackageScripts(cwd);
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
      content: `export default {
  databasePath: ".syncore/syncore.db",
  storageDirectory: ".syncore/storage"
};
`
    },
    {
      path: path.join("syncore", "schema.ts"),
      content: `import { defineSchema, defineTable, v } from "syncore";

export default defineSchema({
  tasks: defineTable({
    text: v.string(),
    done: v.boolean()
  }).index("by_done", ["done"])
});
`
    },
    {
      path: path.join("syncore", "functions", "tasks.ts"),
      content: `import { mutation, query, v } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("tasks").withIndex("by_done").order("asc").collect()
});

export const create = mutation({
  args: { text: v.string() },
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

import { createWebWorkerRuntime } from "@syncore/platform-web";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createWebWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  databaseName: "syncore-app",
  persistenceMode: "opfs"
});
`
        },
        {
          path: path.join("src", "syncore-provider.tsx"),
          content: `import type { ReactNode } from "react";
import { SyncoreWebProvider } from "@syncore/platform-web";

export function AppSyncoreProvider({ children }: { children: ReactNode }) {
  return (
    <SyncoreWebProvider workerUrl={new URL("./syncore.worker.ts", import.meta.url)}>
      {children}
    </SyncoreWebProvider>
  );
}
`
        }
      );
      break;
    case "expo":
      files.push({
        path: path.join("lib", "syncore.ts"),
        content: `import { createExpoSyncoreBootstrap } from "@syncore/platform-expo";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

export const syncore = createExpoSyncoreBootstrap({
  schema,
  functions,
  databaseName: "syncore-app.db",
  storageDirectoryName: "syncore-app-storage"
});
`
      });
      break;
    case "next":
      files.push(
        {
          path: path.join("app", "syncore.worker.ts"),
          content: `/// <reference lib="webworker" />

import { createWebWorkerRuntime } from "@syncore/platform-web";
import { resolveSqlJsWasmUrl } from "@syncore/next";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createWebWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  databaseName: "syncore-app",
  persistenceDatabaseName: "syncore-app",
  persistenceMode: "opfs",
  locateFile: () => resolveSqlJsWasmUrl()
});
`
        },
        {
          path: path.join("app", "syncore-provider.tsx"),
          content: `"use client";

import type { ReactNode } from "react";
import { SyncoreNextProvider } from "@syncore/next";

export function AppSyncoreProvider({ children }: { children: ReactNode }) {
  return (
    <SyncoreNextProvider workerUrl={new URL("./syncore.worker.ts", import.meta.url)}>
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
import { withNodeSyncoreClient } from "@syncore/platform-node";
import { api } from "./syncore/_generated/api.ts";
import schema from "./syncore/schema.ts";
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
import { createNodeSyncoreRuntime } from "@syncore/platform-node";
import schema from "../syncore/schema.js";
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
    case "minimal":
      break;
  }

  return files;
}

function logScaffoldResult(
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

async function hasSyncoreProject(cwd: string): Promise<boolean> {
  return (
    (await fileExists(path.join(cwd, "syncore.config.ts"))) &&
    (await fileExists(path.join(cwd, "syncore", "schema.ts"))) &&
    (await fileExists(path.join(cwd, "syncore", "functions")))
  );
}

async function resolveRequestedTemplate(
  cwd: string,
  requestedTemplate: string
): Promise<SyncoreTemplateName> {
  if (requestedTemplate !== "auto") {
    if (!validTemplates.includes(requestedTemplate as SyncoreTemplateName)) {
      throw new Error(
        `Unknown template ${JSON.stringify(requestedTemplate)}. Expected one of ${validTemplates.join(", ")} or auto.`
      );
    }
    return requestedTemplate as SyncoreTemplateName;
  }
  return detectProjectTemplate(cwd);
}

async function detectProjectTemplate(
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
    "vite" in dependencies ||
    "@vitejs/plugin-react" in dependencies ||
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

async function readPackageJson(cwd: string): Promise<PackageJsonShape | null> {
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

async function ensurePackageScripts(cwd: string): Promise<void> {
  const packageJsonPath = path.join(cwd, "package.json");
  if (!(await fileExists(packageJsonPath))) {
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
  nextPackageJson.scripts["syncore:dev"] ??= "syncore dev";
  nextPackageJson.scripts["syncore:codegen"] ??= "syncore codegen";

  if (stableStringify(nextPackageJson) === stableStringify(packageJson)) {
    return;
  }

  await writeFile(
    packageJsonPath,
    `${JSON.stringify(nextPackageJson, null, 2)}\n`
  );
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

async function importJsonlIntoProject(
  cwd: string,
  tableName: string,
  sourcePath: string
): Promise<number> {
  const schema = await loadProjectSchema(cwd);
  const table = schema.getTable(
    tableName as Extract<keyof typeof schema.tables, string>
  ) as TableDefinition<Validator<unknown>>;
  const config = await loadProjectConfig(cwd);
  const databasePath = path.resolve(cwd, config.databasePath);
  const storageDirectory = path.resolve(cwd, config.storageDirectory);
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
          `Invalid JSON on line ${lineNumber} of ${sourcePath}: ${formatError(error)}`
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
      const id = crypto.randomUUID();
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

async function resolveDefaultSeedFile(
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
      Validator<unknown>
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
  table: TableDefinition<Validator<unknown>>,
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
  functionEntries: Array<{
    pathParts: string[];
    exportName: string;
    kind: "query" | "mutation" | "action";
  }>
): string[] {
  const lines = [
    `/**`,
    ` * Type-safe runtime definitions for every function exported from \`syncore/functions\`.`,
    ` */`,
    `export interface SyncoreFunctionsRegistry {`
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

async function loadProjectConfig(cwd: string): Promise<SyncoreConfig> {
  const filePath = path.join(cwd, "syncore.config.ts");
  const config = await loadDefaultExport<SyncoreConfig>(filePath);
  if (
    !config ||
    typeof config !== "object" ||
    typeof config.databasePath !== "string" ||
    typeof config.storageDirectory !== "string"
  ) {
    throw new Error(
      "syncore.config.ts must export { databasePath, storageDirectory }."
    );
  }
  return config;
}

async function loadProjectSchema(
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

async function loadDefaultExport<TValue>(filePath: string): Promise<TValue> {
  if (!(await fileExists(filePath))) {
    throw new Error(`Missing file: ${path.relative(process.cwd(), filePath)}`);
  }
  const moduleUrl = pathToFileURL(filePath).href;
  const loaded = (await tsImport(moduleUrl, {
    parentURL: import.meta.url
  })) as { default?: TValue };
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

async function readStoredSnapshot(cwd: string): Promise<SchemaSnapshot | null> {
  const snapshotPath = path.join(
    cwd,
    "syncore",
    "migrations",
    migrationSnapshotFileName
  );
  if (!(await fileExists(snapshotPath))) {
    return null;
  }
  return parseSchemaSnapshot(await readFile(snapshotPath, "utf8"));
}

async function writeStoredSnapshot(
  cwd: string,
  snapshot: SchemaSnapshot
): Promise<void> {
  const migrationsDirectory = path.join(cwd, "syncore", "migrations");
  await mkdir(migrationsDirectory, { recursive: true });
  await writeFile(
    path.join(migrationsDirectory, migrationSnapshotFileName),
    `${JSON.stringify(snapshot, null, 2)}\n`
  );
}

async function getNextMigrationNumber(directory: string): Promise<number> {
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

async function applyProjectMigrations(cwd: string): Promise<number> {
  const config = await loadProjectConfig(cwd);
  const databasePath = path.resolve(cwd, config.databasePath);
  const storageDirectory = path.resolve(cwd, config.storageDirectory);
  await mkdir(path.dirname(databasePath), { recursive: true });
  await mkdir(storageDirectory, { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS "_syncore_migrations" (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDirectory = path.join(cwd, "syncore", "migrations");
  if (!(await fileExists(migrationsDirectory))) {
    database.close();
    return 0;
  }

  const appliedRows = database
    .prepare(`SELECT name FROM "_syncore_migrations" ORDER BY name ASC`)
    .all() as Array<{ name: string }>;
  const appliedNames = new Set(appliedRows.map((row) => row.name));
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
          `INSERT INTO "_syncore_migrations" (name, applied_at) VALUES (?, ?)`
        )
        .run(fileName, new Date().toISOString());
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

async function fileExists(filePath: string): Promise<boolean> {
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
  const candidateConfigFiles = (await readdir(cwd, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^tsconfig.*\.json$/i.test(entry.name))
    .map((entry) => path.join(cwd, entry.name))
    .sort((left, right) => left.localeCompare(right));

  for (const filePath of candidateConfigFiles) {
    try {
      const rawConfig = JSON.parse(await readFile(filePath, "utf8")) as {
        compilerOptions?: {
          module?: string;
          moduleResolution?: string;
        };
      };
      const moduleResolution =
        rawConfig.compilerOptions?.moduleResolution?.toLowerCase();
      const moduleTarget = rawConfig.compilerOptions?.module?.toLowerCase();
      if (moduleResolution === "nodenext" || moduleTarget === "nodenext") {
        return ".js";
      }
    } catch {
      continue;
    }
  }

  return "";
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function slugify(value: string): string {
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

async function startDevHub(options: {
  cwd: string;
  template: SyncoreTemplateName;
}): Promise<void> {
  const dashboardPort = resolvePortFromEnv("SYNCORE_DASHBOARD_PORT", 4310);
  const devtoolsPort = resolvePortFromEnv("SYNCORE_DEVTOOLS_PORT", 4311);
  await runDevProjectBootstrap(options.cwd, options.template);
  const httpServer = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, wsPort: devtoolsPort }));
  });
  const websocketServer = new WebSocketServer({ server: httpServer });
  const latestSnapshots = new Map<string, SyncoreDevtoolsMessage>();
  const hello: SyncoreDevtoolsMessage = {
    type: "hello",
    runtimeId: "syncore-dev-hub",
    platform: "dev"
  };

  websocketServer.on("connection", (socket: WebSocket) => {
    socket.send(JSON.stringify(hello));
    for (const snapshot of latestSnapshots.values()) {
      socket.send(JSON.stringify(snapshot));
    }

    socket.on("message", (payload) => {
      const rawPayload = decodeWebSocketPayload(payload);
      if (rawPayload.length === 0) {
        return;
      }
      const message = JSON.parse(rawPayload) as SyncoreDevtoolsMessage;
      if (message.type === "ping") {
        socket.send(
          JSON.stringify({ type: "pong" } satisfies SyncoreDevtoolsMessage)
        );
        return;
      }
      if (message.type === "snapshot") {
        latestSnapshots.set(message.snapshot.runtimeId, message);
      }
      const encoded = JSON.stringify(message);
      for (const client of websocketServer.clients) {
        if (client === socket || client.readyState !== WebSocket.OPEN) {
          continue;
        }
        client.send(encoded);
      }
    });
  });

  const heartbeat = setInterval(() => {
    const event: SyncoreDevtoolsMessage = {
      type: "event",
      event: {
        type: "log",
        runtimeId: "syncore-dev-hub",
        level: "info",
        message: "Syncore devtools hub is alive.",
        timestamp: Date.now()
      }
    };
    const payload = JSON.stringify(event);
    for (const client of websocketServer.clients) {
      client.send(payload);
    }
  }, 4000);

  httpServer.listen(devtoolsPort, "127.0.0.1", () => {
    void (async () => {
      console.log(`Syncore devtools hub: ws://127.0.0.1:${devtoolsPort}`);
      console.log(
        `Electron/Node runtimes: set devtoolsUrl to ws://127.0.0.1:${devtoolsPort}.`
      );
      console.log(
        `Web/Next apps: connect the dashboard or worker bridge to ws://127.0.0.1:${devtoolsPort}.`
      );
      console.log(
        "Expo apps: use the same hub URL through LAN or adb reverse while developing."
      );
      await setupDevProjectWatch(options.cwd, options.template);
      const dashboardRoot = path.resolve(process.cwd(), "apps", "dashboard");
      if (await fileExists(path.join(dashboardRoot, "vite.config.ts"))) {
        try {
          const viteModule = await import("vite");
          const server = await viteModule.createServer({
            configFile: path.join(dashboardRoot, "vite.config.ts"),
            root: dashboardRoot,
            server: {
              port: dashboardPort
            }
          });
          await server.listen();
          console.log(`Dashboard shell: http://127.0.0.1:${dashboardPort}`);
        } catch {
          console.log(
            "Dashboard source not started automatically. Run the dashboard app separately if needed."
          );
        }
      }
    })();
  });

  const close = () => {
    clearInterval(heartbeat);
    websocketServer.close();
    httpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", close);
  process.on("SIGTERM", close);
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

async function runDevProjectBootstrap(
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

function resolvePortFromEnv(
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
