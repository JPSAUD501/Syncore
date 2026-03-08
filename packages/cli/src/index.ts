import { readdir, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
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
  renderMigrationSql,
  type SchemaSnapshot,
  type SyncoreSchema
} from "syncore";

interface SyncoreConfig {
  databasePath: string;
  storageDirectory: string;
}

const program = new Command();
const migrationSnapshotFileName = "_schema_snapshot.json";
let pendingDevBootstrap: NodeJS.Timeout | undefined;
let devBootstrapInFlight = false;

program
  .name("syncore")
  .description("Syncore local-first toolkit CLI")
  .version("0.1.0");

program
  .command("init")
  .description("Scaffold a Syncore project in the current directory")
  .action(async () => {
    const cwd = process.cwd();
    await mkdir(path.join(cwd, "syncore", "functions"), { recursive: true });
    await mkdir(path.join(cwd, "syncore", "_generated"), { recursive: true });
    await mkdir(path.join(cwd, "syncore", "migrations"), { recursive: true });

    await writeIfMissing(
      path.join(cwd, "syncore.config.ts"),
      `export default {
  databasePath: ".syncore/syncore.db",
  storageDirectory: ".syncore/storage"
};
`
    );

    await writeIfMissing(
      path.join(cwd, "syncore", "schema.ts"),
      `import { defineSchema, defineTable, v } from "syncore";

export default defineSchema({
  messages: defineTable({
    body: v.string(),
    done: v.boolean(),
    createdBy: v.optional(v.string())
  })
    .index("by_done", ["done"])
    .searchIndex("search_body", { searchField: "body" })
});
`
    );

    await writeIfMissing(
      path.join(cwd, "syncore", "functions", "messages.ts"),
      `import { mutation, query, v } from "../_generated/server";

export const listMessages = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    return ctx.db.query("messages").order("desc").take(25);
  }
});

export const createMessage = mutation({
  args: {
    body: v.string()
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    return ctx.db.insert("messages", {
      body: args.body,
      done: false
    });
  }
});
`
    );

    await writeIfMissing(
      path.join(cwd, "syncore", "crons.ts"),
      `import { cronJobs } from "syncore";

const crons = cronJobs();

export default crons;
`
    );

    await runCodegen(cwd);
    console.log("Syncore project scaffolded.");
  });

program
  .command("codegen")
  .description("Generate typed function references from syncore/functions")
  .action(async () => {
    await runCodegen(process.cwd());
    console.log("Generated syncore/_generated files.");
  });

program
  .command("doctor")
  .description("Check Syncore project structure")
  .action(async () => {
    const cwd = process.cwd();
    const checks = [
      "syncore.config.ts",
      path.join("syncore", "schema.ts"),
      path.join("syncore", "functions"),
      path.join("syncore", "migrations")
    ];
    for (const check of checks) {
      const exists = await fileExists(path.join(cwd, check));
      console.log(`${exists ? "OK" : "MISSING"} ${check}`);
    }
  });

program
  .command("migrate:status")
  .description("Compare the current schema against the last saved migration snapshot")
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
    await writeFile(path.join(migrationsDirectory, migrationFileName), migrationSql);
    await writeStoredSnapshot(cwd, currentSnapshot);
    console.log(`Generated ${path.join("syncore", "migrations", migrationFileName)}`);
  });

program
  .command("migrate:apply")
  .description("Apply SQL migrations from syncore/migrations to the configured database")
  .action(async () => {
    const appliedCount = await applyProjectMigrations(process.cwd());
    console.log(`Applied ${appliedCount} migration(s).`);
  });

program
  .command("dev")
  .description("Start the Syncore devtools hub")
  .action(async () => {
    await startDevHub();
  });

await program.parseAsync(process.argv);

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
    `import { createFunctionReferenceFor } from "syncore";`,
    ...renderFunctionTypeImports(functionEntries, functionImportExtension),
    "",
    `export const api = ${renderApiTree(functionEntries)} as const;`,
    ""
  ].join("\n");

  const functionsSource = [
    ...renderFunctionImports(functionEntries, functionImportExtension),
    "",
    `export const functions = {`,
    ...functionEntries.map(
      (entry) =>
        `  ${JSON.stringify(`${entry.pathParts.join("/")}/${entry.exportName}`)}: ${renderFunctionImportName(entry)},`
    ),
    `} as const;`,
    ""
  ].join("\n");

  const serverSource = [
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
    `export type QueryCtx = BaseQueryCtx<typeof schema>;`,
    `export type MutationCtx = BaseMutationCtx<typeof schema>;`,
    `export type ActionCtx = BaseActionCtx<typeof schema>;`,
    `export type { FunctionReference } from "syncore";`,
    ``,
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
    ""
  ].join("\n");

  await writeFile(path.join(generatedDir, "api.ts"), apiSource);
  await writeFile(path.join(generatedDir, "functions.ts"), functionsSource);
  await writeFile(path.join(generatedDir, "server.ts"), serverSource);
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

function renderApiTree(
  functionEntries: Array<{
    pathParts: string[];
    exportName: string;
    kind: "query" | "mutation" | "action";
  }>
): string {
  const root: Record<string, unknown> = {};

  for (const entry of functionEntries) {
    let cursor = root;
    for (const segment of entry.pathParts) {
      cursor[segment] ??= {};
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[entry.exportName] = `createFunctionReferenceFor<typeof ${renderFunctionImportName(entry)}>("${entry.kind}", "${entry.pathParts.join("/")}/${entry.exportName}")`;
  }

  return renderObject(root);
}

function renderObject(value: Record<string, unknown>): string {
  const lines = Object.entries(value).map(([key, nested]) => {
    if (typeof nested === "string") {
      return `${JSON.stringify(key)}: ${nested}`;
    }
    return `${JSON.stringify(key)}: ${renderObject(nested as Record<string, unknown>)}`;
  });
  return `{ ${lines.join(", ")} }`;
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
    throw new Error("syncore.config.ts must export { databasePath, storageDirectory }.");
  }
  return config;
}

async function loadProjectSchema(
  cwd: string
): Promise<SyncoreSchema<Record<string, AnyTableDefinition>>> {
  const filePath = path.join(cwd, "syncore", "schema.ts");
  const schema = await loadDefaultExport<SyncoreSchema<Record<string, AnyTableDefinition>>>(
    filePath
  );
  if (!schema || typeof schema !== "object" || typeof schema.tableNames !== "function") {
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
    throw new Error(`File ${path.relative(process.cwd(), filePath)} must have a default export.`);
  }
  const resolvedDefault = unwrapDefaultExport(loaded.default);
  if (resolvedDefault === undefined) {
    throw new Error(`File ${path.relative(process.cwd(), filePath)} exported undefined.`);
  }
  return resolvedDefault;
}

async function readStoredSnapshot(cwd: string): Promise<SchemaSnapshot | null> {
  const snapshotPath = path.join(cwd, "syncore", "migrations", migrationSnapshotFileName);
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

async function writeIfMissing(filePath: string, content: string): Promise<void> {
  if (await fileExists(filePath)) {
    return;
  }
  await writeFile(filePath, content);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveFunctionImportExtension(cwd: string): Promise<"" | ".js"> {
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
      const moduleResolution = rawConfig.compilerOptions?.moduleResolution?.toLowerCase();
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

function applyMigrationSql(database: DatabaseSync, sql: string, fileName: string): void {
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

async function startDevHub(): Promise<void> {
  const cwd = process.cwd();
  const dashboardPort = resolvePortFromEnv("SYNCORE_DASHBOARD_PORT", 4310);
  const devtoolsPort = resolvePortFromEnv("SYNCORE_DEVTOOLS_PORT", 4311);
  await runDevProjectBootstrap(cwd);
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
        socket.send(JSON.stringify({ type: "pong" } satisfies SyncoreDevtoolsMessage));
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
      console.log(`Syncore devtools hub listening on ws://127.0.0.1:${devtoolsPort}`);
      console.log(`Electron/Node runtimes: use devtoolsUrl "ws://127.0.0.1:${devtoolsPort}".`);
      console.log(`Web/Next apps: connect the dashboard or a worker bridge to ws://127.0.0.1:${devtoolsPort}.`);
      console.log("Expo apps: use the same hub URL through LAN or adb reverse while developing.");
      await setupDevProjectWatch(cwd);
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
          console.log(`Dashboard shell available on http://127.0.0.1:${dashboardPort}`);
        } catch {
          console.log("Dashboard source not started automatically. Run the dashboard app separately if needed.");
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

async function setupDevProjectWatch(cwd: string): Promise<void> {
  const snapshot = await createDevWatchSnapshot(cwd);
  if (snapshot.size === 0) {
    return;
  }

  console.log("Watching syncore sources for changes.");
  let lastSnapshot = snapshot;
  const interval = setInterval(() => {
    void (async () => {
      const nextSnapshot = await createDevWatchSnapshot(cwd);
      if (!areDevWatchSnapshotsEqual(lastSnapshot, nextSnapshot)) {
        lastSnapshot = nextSnapshot;
        scheduleDevProjectBootstrap(cwd);
      }
    })();
  }, 500);

  const dispose = () => {
    clearInterval(interval);
  };

  process.once("SIGINT", dispose);
  process.once("SIGTERM", dispose);
}

function scheduleDevProjectBootstrap(cwd: string): void {
  if (pendingDevBootstrap) {
    clearTimeout(pendingDevBootstrap);
  }
  pendingDevBootstrap = setTimeout(() => {
    void runDevProjectBootstrap(cwd);
  }, 150);
}

async function runDevProjectBootstrap(cwd: string): Promise<void> {
  if (devBootstrapInFlight) {
    scheduleDevProjectBootstrap(cwd);
    return;
  }

  devBootstrapInFlight = true;
  try {
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
          `Syncore dev updated schema snapshot (${plan.statements.length} statement(s), ${plan.warnings.length} warning(s)).`
        );
      } else {
        console.log("Syncore dev updated schema snapshot.");
      }
    }

    for (const warning of plan.warnings) {
      console.warn(`Syncore dev warning: ${warning}`);
    }

    const appliedCount = await applyProjectMigrations(cwd);
    console.log(
      `Syncore dev bootstrap complete. Codegen refreshed; ${appliedCount} migration(s) applied.`
    );
  } catch (error) {
    console.error(`Syncore dev bootstrap failed: ${formatError(error)}`);
  } finally {
    devBootstrapInFlight = false;
  }
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
  return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength).toString(
    "utf8"
  );
}

function isUnsupportedFts5Statement(statement: string, error: unknown): boolean {
  if (!/using\s+fts5/i.test(statement)) {
    return false;
  }
  return (
    error instanceof Error &&
    /fts5/i.test(error.message)
  );
}

function unwrapDefaultExport<TValue>(value: TValue): TValue {
  if (
    value &&
    typeof value === "object" &&
    "default" in (value as Record<string, unknown>) &&
    (value as Record<string, unknown>).default !== undefined
  ) {
    return unwrapDefaultExport((value as Record<string, unknown>).default as TValue);
  }
  return value;
}

function resolvePortFromEnv(environmentVariable: string, fallback: number): number {
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

async function applyProjectMigrations(cwd: string): Promise<number> {
  const config = await loadProjectConfig(cwd);
  const migrationsDirectory = path.join(cwd, "syncore", "migrations");
  if (!(await fileExists(migrationsDirectory))) {
    return 0;
  }

  const databasePath = path.resolve(cwd, config.databasePath);
  await mkdir(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS "_syncore_migrations" (
      id TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL,
      sql TEXT NOT NULL
    );
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  let appliedCount = 0;
  for (const file of files) {
    const alreadyApplied = database
      .prepare(`SELECT id FROM "_syncore_migrations" WHERE id = ?`)
      .get(file);
    if (alreadyApplied) {
      continue;
    }

    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    applyMigrationSql(database, sql, file);
    database
      .prepare(`INSERT INTO "_syncore_migrations" (id, applied_at, sql) VALUES (?, ?, ?)`)
      .run(file, Date.now(), sql);
    appliedCount += 1;
  }

  database.close();
  return appliedCount;
}

async function createDevWatchSnapshot(cwd: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  const explicitFiles = [
    path.join(cwd, "syncore.config.ts"),
    path.join(cwd, "syncore", "schema.ts"),
    path.join(cwd, "syncore", "crons.ts")
  ];

  for (const target of explicitFiles) {
    if (!(await fileExists(target))) {
      continue;
    }
    const metadata = await stat(target);
    snapshot.set(target, `${metadata.mtimeMs}:${metadata.size}`);
  }

  const functionFiles = await listTypeScriptFiles(path.join(cwd, "syncore", "functions"));
  for (const file of functionFiles) {
    const metadata = await stat(file);
    snapshot.set(file, `${metadata.mtimeMs}:${metadata.size}`);
  }

  const migrationsDirectory = path.join(cwd, "syncore", "migrations");
  if (await fileExists(migrationsDirectory)) {
    const migrationEntries = await readdir(migrationsDirectory, { withFileTypes: true });
    for (const entry of migrationEntries) {
      if (!entry.isFile() || !entry.name.endsWith(".sql")) {
        continue;
      }
      const filePath = path.join(migrationsDirectory, entry.name);
      const metadata = await stat(filePath);
      snapshot.set(filePath, `${metadata.mtimeMs}:${metadata.size}`);
    }
  }

  return snapshot;
}

function areDevWatchSnapshotsEqual(
  left: Map<string, string>,
  right: Map<string, string>
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    if (right.get(key) !== value) {
      return false;
    }
  }
  return true;
}
