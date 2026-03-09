import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import WebSocket from "ws";
import type {
  SyncoreDevtoolsMessage,
  SyncoreDevtoolsRequest,
  SyncoreDevtoolsSnapshot,
  SyncoreRequestPayload,
  SyncoreResponsePayload
} from "@syncore/devtools-protocol";
import {
  type AnySyncoreSchema,
  createFunctionReference,
  type DevtoolsSink,
  describeValidator,
  type SchedulerOptions,
  type StorageObject,
  type StorageWriteInput,
  type SyncoreCapabilities,
  type SyncoreExperimentalPlugin,
  SyncoreRuntime,
  type SyncoreRuntimeOptions,
  type SyncoreSqlDriver,
  type SyncoreStorageAdapter
} from "@syncore/core";
import { attachNodeIpcRuntime, createNodeIpcMessageEndpoint } from "./ipc.js";
export * from "./ipc.js";
export type {
  SyncoreDevtoolsEvent,
  SyncoreDevtoolsSnapshot
} from "@syncore/devtools-protocol";

export type NodeSyncoreSchema = AnySyncoreSchema;

function normalizeData(input: StorageWriteInput["data"]): Uint8Array {
  if (typeof input === "string") {
    return Buffer.from(input);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
}

function toSqlParameters(params: unknown[]): SQLInputValue[] {
  return params as SQLInputValue[];
}

export class NodeSqliteDriver implements SyncoreSqlDriver {
  private readonly database: DatabaseSync;
  private transactionDepth = 0;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
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
    const statement = this.database.prepare(sql);
    const result = statement.run(...toSqlParameters(params));
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowid:
        typeof result.lastInsertRowid === "bigint"
          ? Number(result.lastInsertRowid)
          : result.lastInsertRowid
    };
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const statement = this.database.prepare(sql);
    return statement.get(...toSqlParameters(params)) as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const statement = this.database.prepare(sql);
    return statement.all(...toSqlParameters(params)) as T[];
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

export class NodeFileStorageAdapter implements SyncoreStorageAdapter {
  constructor(private readonly directory: string) {}

  private filePath(id: string): string {
    return path.join(this.directory, id);
  }

  async put(id: string, input: StorageWriteInput): Promise<StorageObject> {
    await mkdir(this.directory, { recursive: true });
    const filePath = this.filePath(id);
    const bytes = normalizeData(input.data);
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

  async delete(id: string): Promise<void> {
    await rm(this.filePath(id), { force: true });
  }

  async list(): Promise<StorageObject[]> {
    try {
      const entries = await readdir(this.directory, { withFileTypes: true });
      const objects = await Promise.all(
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
      return objects;
    } catch {
      return [];
    }
  }
}

export interface CreateNodeRuntimeOptions {
  databasePath: string;
  storageDirectory: string;
  schema: NodeSyncoreSchema;
  functions: SyncoreRuntimeOptions<NodeSyncoreSchema>["functions"];
  capabilities?: SyncoreCapabilities;
  experimentalPlugins?: Array<SyncoreExperimentalPlugin<NodeSyncoreSchema>>;
  platform?: string;
  devtools?: DevtoolsSink;
  devtoolsUrl?: string;
  scheduler?: SchedulerOptions;
}

/**
 * Options for creating a managed Node Syncore client.
 */
export type WithNodeSyncoreClientOptions = CreateNodeRuntimeOptions;

/**
 * A started local Node runtime paired with its client and a dispose helper.
 */
export interface ManagedNodeSyncoreClient {
  runtime: SyncoreRuntime<NodeSyncoreSchema>;
  client: ReturnType<SyncoreRuntime<NodeSyncoreSchema>["createClient"]>;
  dispose(): Promise<void>;
}

export interface SyncoreElectronIpcBinding {
  ready: Promise<void>;
  dispose(): Promise<void>;
}

export interface SyncoreElectronBridgeWindow {
  isDestroyed(): boolean;
  webContents: {
    send(channel: string, message: unknown): void;
  };
}

export interface CreateElectronSyncoreBridgeOptions {
  window: SyncoreElectronBridgeWindow;
  onRendererMessage(listener: (message: unknown) => void): () => void;
  channel?: string;
}

/**
 * The subset of Electron's `ipcMain` used by Syncore's main-process helper.
 */
export interface SyncoreElectronIpcMain {
  on(
    channel: string,
    listener: (event: unknown, message: unknown) => void
  ): void;
  off(
    channel: string,
    listener: (event: unknown, message: unknown) => void
  ): void;
}

export interface CreateSyncoreRendererWindowClientOptions {
  bridgeName?: string;
}

/**
 * Create a Node or Electron runtime backed by SQLite and local file storage.
 */
export function createNodeSyncoreRuntime(
  options: CreateNodeRuntimeOptions
): SyncoreRuntime<NodeSyncoreSchema> {
  const websocketDevtools =
    !options.devtools && options.devtoolsUrl
      ? createNodeWebSocketDevtoolsSink({
          url: options.devtoolsUrl
        })
      : undefined;
  const runtimeOptions: SyncoreRuntimeOptions<NodeSyncoreSchema> = {
    schema: options.schema,
    functions: options.functions,
    driver: new NodeSqliteDriver(options.databasePath),
    storage: new NodeFileStorageAdapter(options.storageDirectory),
    platform: options.platform ?? "node"
  };
  if (options.capabilities) {
    runtimeOptions.capabilities = options.capabilities;
  }
  if (options.experimentalPlugins) {
    runtimeOptions.experimentalPlugins = options.experimentalPlugins;
  }
  const resolvedDevtools = options.devtools ?? websocketDevtools;
  if (resolvedDevtools) {
    runtimeOptions.devtools = resolvedDevtools;
  }
  if (options.scheduler) {
    runtimeOptions.scheduler = options.scheduler;
  }
  const runtime = new SyncoreRuntime(runtimeOptions);
  websocketDevtools?.attachRuntime(() => runtime.getDevtoolsSnapshot());
  if (websocketDevtools) {
    websocketDevtools.attachRequestHandler(
      createDevtoolsRequestHandler({
        driver: runtimeOptions.driver,
        schema: options.schema,
        functions: options.functions,
        runtime
      })
    );
    const stop = runtime.stop.bind(runtime);
    runtime.stop = async () => {
      websocketDevtools.dispose();
      await stop();
    };
  }
  return runtime;
}

/**
 * Create a same-process Syncore client from a started Node runtime.
 */
export function createNodeSyncoreClient(
  runtime: SyncoreRuntime<NodeSyncoreSchema>
) {
  return runtime.createClient();
}

/**
 * Start a Node Syncore runtime and return its client together with a dispose helper.
 */
export async function createManagedNodeSyncoreClient(
  options: WithNodeSyncoreClientOptions
): Promise<ManagedNodeSyncoreClient> {
  const runtime = createNodeSyncoreRuntime(options);
  await runtime.start();
  return {
    runtime,
    client: runtime.createClient(),
    async dispose() {
      await runtime.stop();
    }
  };
}

/**
 * Run a callback with a started local Node Syncore client and always stop the runtime.
 *
 * @example
 * ```ts
 * await withNodeSyncoreClient(options, async (client) => {
 *   console.log(await client.query(api.tasks.list));
 * });
 * ```
 */
export async function withNodeSyncoreClient<TResult>(
  options: WithNodeSyncoreClientOptions,
  callback: (
    client: ReturnType<SyncoreRuntime<NodeSyncoreSchema>["createClient"]>,
    runtime: SyncoreRuntime<NodeSyncoreSchema>
  ) => Promise<TResult> | TResult
): Promise<TResult> {
  const managed = await createManagedNodeSyncoreClient(options);
  try {
    return await callback(managed.client, managed.runtime);
  } finally {
    await managed.dispose();
  }
}

/**
 * Create the default Electron main-process bridge used to connect a BrowserWindow
 * to a Syncore runtime.
 */
export function createElectronSyncoreBridge(
  options: CreateElectronSyncoreBridgeOptions
) {
  const channel = options.channel ?? "syncore:message";
  return createNodeIpcMessageEndpoint({
    postMessage(message: unknown) {
      if (!options.window.isDestroyed()) {
        options.window.webContents.send(channel, message);
      }
    },
    onMessage(listener: (message: unknown) => void) {
      return options.onRendererMessage(listener);
    }
  });
}

/**
 * Bind a BrowserWindow to a Syncore runtime with the default Electron IPC transport.
 */
export function bindElectronWindowToSyncoreRuntime(options: {
  runtime: SyncoreRuntime<NodeSyncoreSchema>;
  window: SyncoreElectronBridgeWindow;
  onRendererMessage(listener: (message: unknown) => void): () => void;
  channel?: string;
}): SyncoreElectronIpcBinding;
export function bindElectronWindowToSyncoreRuntime(options: {
  runtime: SyncoreRuntime<NodeSyncoreSchema>;
  window: SyncoreElectronBridgeWindow;
  ipcMain: SyncoreElectronIpcMain;
  channel?: string;
}): SyncoreElectronIpcBinding;
export function bindElectronWindowToSyncoreRuntime(options: {
  runtime: SyncoreRuntime<NodeSyncoreSchema>;
  window: SyncoreElectronBridgeWindow;
  onRendererMessage?(listener: (message: unknown) => void): () => void;
  ipcMain?: SyncoreElectronIpcMain;
  channel?: string;
}): SyncoreElectronIpcBinding {
  const cleanupCallbacks: Array<() => void> = [];
  const channel = options.channel ?? "syncore:message";
  let onRendererMessage:
    | ((listener: (message: unknown) => void) => () => void)
    | undefined;

  if (!options.onRendererMessage) {
    if (!options.ipcMain) {
      throw new Error(
        "bindElectronWindowToSyncoreRuntime requires either onRendererMessage() or ipcMain."
      );
    }
    const listeners = new Set<(message: unknown) => void>();
    const handleRendererMessage = (_event: unknown, message: unknown) => {
      for (const listener of listeners) {
        listener(message);
      }
    };
    options.ipcMain.on(channel, handleRendererMessage);
    cleanupCallbacks.push(() => {
      options.ipcMain?.off(channel, handleRendererMessage);
      listeners.clear();
    });
    onRendererMessage = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
  } else {
    onRendererMessage = (listener) => options.onRendererMessage!(listener);
  }

  const endpoint = createElectronSyncoreBridge({
    window: options.window,
    onRendererMessage,
    channel
  });
  const attachedRuntime = attachNodeIpcRuntime({
    endpoint,
    createRuntime: () => options.runtime
  });

  return {
    ready: attachedRuntime.ready,
    async dispose() {
      await attachedRuntime.dispose();
      endpoint.dispose();
      for (const cleanup of cleanupCallbacks) {
        cleanup();
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Devtools request handler                                           */
/* ------------------------------------------------------------------ */

interface DevtoolsRequestHandlerDeps {
  driver: SyncoreSqlDriver;
  schema: AnySyncoreSchema;
  functions: SyncoreRuntimeOptions<AnySyncoreSchema>["functions"];
  runtime: SyncoreRuntime<AnySyncoreSchema>;
}

function createDevtoolsRequestHandler(
  deps: DevtoolsRequestHandlerDeps
): DevtoolsRequestHandler {
  const { driver, schema, functions, runtime } = deps;

  return async (payload): Promise<SyncoreResponsePayload> => {
    switch (payload.kind) {
      /* ---- Function listing ---- */
      case "fn.list": {
        const defs = Object.entries(functions)
          .filter(
            (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
              entry[1] !== undefined
          )
          .map(([name, fn]) => {
            const def: {
              name: string;
              type: "query" | "mutation" | "action";
              file: string;
              args?: Record<string, unknown>;
            } = {
              name,
              type: fn.kind,
              file: inferFileFromFunctionName(name)
            };
            const argsDesc = describeValidator(fn.argsValidator);
            if (argsDesc.kind === "object") {
              def.args = argsDesc.shape as Record<string, unknown>;
            }
            return def;
          });
        return { kind: "fn.list.result", functions: defs };
      }

      /* ---- Function execution ---- */
      case "fn.run": {
        const start = performance.now();
        try {
          let result: unknown;
          switch (payload.functionType) {
            case "query": {
              const ref = createFunctionReference(
                "query",
                payload.functionName
              );
              result = await runtime.runQuery(ref, payload.args);
              break;
            }
            case "mutation": {
              const ref = createFunctionReference(
                "mutation",
                payload.functionName
              );
              result = await runtime.runMutation(ref, payload.args);
              break;
            }
            case "action": {
              const ref = createFunctionReference(
                "action",
                payload.functionName
              );
              result = await runtime.runAction(ref, payload.args);
              break;
            }
          }
          return {
            kind: "fn.run.result",
            result,
            durationMs: performance.now() - start
          };
        } catch (err) {
          return {
            kind: "fn.run.result",
            error: err instanceof Error ? err.message : String(err),
            durationMs: performance.now() - start
          };
        }
      }

      /* ---- Schema ---- */
      case "schema.get": {
        const tableNames = schema.tableNames();
        const tables = await Promise.all(
          tableNames.map(async (name) => {
            const table = schema.getTable(name);
            const validatorDesc = describeValidator(table.validator);

            // Extract fields from the object validator description
            const fields =
              validatorDesc.kind === "object"
                ? Object.entries(validatorDesc.shape).map(
                    ([fieldName, fieldDesc]) => {
                      const desc = fieldDesc as {
                        kind: string;
                        inner?: { kind: string };
                      };
                      const optional = desc.kind === "optional";
                      const innerKind = optional
                        ? (desc.inner?.kind ?? "any")
                        : desc.kind;
                      return {
                        name: fieldName,
                        type: innerKind,
                        optional
                      };
                    }
                  )
                : [];

            // Always include _id and _creationTime
            fields.unshift(
              { name: "_id", type: "string", optional: false },
              { name: "_creationTime", type: "number", optional: false }
            );

            // Get row count from SQLite
            let documentCount = 0;
            try {
              const countRow = await driver.get<{ count: number }>(
                `SELECT COUNT(*) as count FROM "${name}"`
              );
              if (countRow) {
                documentCount = countRow.count;
              }
            } catch {
              /* table may not exist yet */
            }

            return {
              name,
              fields,
              indexes: table.indexes.map(
                (idx: { name: string; fields: string[] }) => ({
                  name: idx.name,
                  fields: idx.fields,
                  unique: false
                })
              ),
              documentCount
            };
          })
        );
        return { kind: "schema.result", tables };
      }

      /* ---- Data query ---- */
      case "data.query": {
        try {
          let sql = `SELECT _id, _creationTime, _json FROM "${payload.table}"`;
          const params: unknown[] = [];

          // Apply filters
          if (payload.filters && payload.filters.length > 0) {
            const conditions = payload.filters.map((f, i) => {
              const op = filterOperatorToSql(f.operator);
              params.push(f.value);
              return `json_extract(_json, '$.${f.field}') ${op} ?`;
            });
            sql += ` WHERE ${conditions.join(" AND ")}`;
          }

          sql += ` ORDER BY _creationTime DESC`;
          if (payload.limit) {
            sql += ` LIMIT ${payload.limit}`;
          }

          const rawRows = await driver.all<{
            _id: string;
            _creationTime: number;
            _json: string;
          }>(sql, params);

          const rows = rawRows.map((row) => ({
            _id: row._id,
            _creationTime: row._creationTime,
            ...(JSON.parse(row._json) as Record<string, unknown>)
          }));

          // Get total count
          const countRow = await driver.get<{ count: number }>(
            `SELECT COUNT(*) as count FROM "${payload.table}"`
          );

          return {
            kind: "data.result",
            rows,
            totalCount: countRow?.count ?? 0
          };
        } catch (err) {
          return {
            kind: "error",
            message: err instanceof Error ? err.message : String(err)
          };
        }
      }

      /* ---- Data insert ---- */
      case "data.insert": {
        try {
          const id = generateId();
          const now = Date.now();
          await driver.run(
            `INSERT INTO "${payload.table}" (_id, _creationTime, _json) VALUES (?, ?, ?)`,
            [id, now, JSON.stringify(payload.document)]
          );
          return { kind: "data.mutate.result", success: true, id };
        } catch (err) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      /* ---- Data patch ---- */
      case "data.patch": {
        try {
          const existing = await driver.get<{ _json: string }>(
            `SELECT _json FROM "${payload.table}" WHERE _id = ?`,
            [payload.id]
          );
          if (!existing) {
            return {
              kind: "data.mutate.result",
              success: false,
              error: `Document ${payload.id} not found`
            };
          }
          const doc = {
            ...(JSON.parse(existing._json) as Record<string, unknown>),
            ...payload.fields
          };
          await driver.run(
            `UPDATE "${payload.table}" SET _json = ? WHERE _id = ?`,
            [JSON.stringify(doc), payload.id]
          );
          return { kind: "data.mutate.result", success: true, id: payload.id };
        } catch (err) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      /* ---- Data delete ---- */
      case "data.delete": {
        try {
          await driver.run(`DELETE FROM "${payload.table}" WHERE _id = ?`, [
            payload.id
          ]);
          return { kind: "data.mutate.result", success: true };
        } catch (err) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      /* ---- SQL execution ---- */
      case "sql.execute": {
        try {
          // Detect if it's a read or write query
          const trimmed = payload.query.trim().toUpperCase();
          if (
            trimmed.startsWith("SELECT") ||
            trimmed.startsWith("PRAGMA") ||
            trimmed.startsWith("EXPLAIN")
          ) {
            const rows = await driver.all<Record<string, unknown>>(
              payload.query
            );
            const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
            return {
              kind: "sql.result",
              columns,
              rows: rows.map((row) => columns.map((col) => row[col])),
              rowsAffected: 0
            };
          } else {
            const result = await driver.run(payload.query);
            return {
              kind: "sql.result",
              columns: [],
              rows: [],
              rowsAffected: result.changes
            };
          }
        } catch (err) {
          return {
            kind: "sql.result",
            columns: [],
            rows: [],
            rowsAffected: 0,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      /* ---- Scheduler list ---- */
      case "scheduler.list": {
        try {
          const rows = await driver.all<{
            id: string;
            function_name: string;
            function_kind: string;
            args_json: string;
            status: string;
            run_at: number;
            created_at: number;
            updated_at: number;
            recurring_name: string | null;
            schedule_json: string | null;
            last_run_at: number | null;
          }>(
            `SELECT * FROM "_scheduled_functions" ORDER BY run_at DESC LIMIT 200`
          );

          const jobs = rows.map((row) => {
            const job: {
              id: string;
              functionName: string;
              args: Record<string, unknown>;
              scheduledAt: number;
              runAt: number;
              status:
                | "pending"
                | "running"
                | "completed"
                | "failed"
                | "cancelled";
              cronSchedule?: string;
              completedAt?: number;
            } = {
              id: row.id,
              functionName: row.function_name,
              args: JSON.parse(row.args_json) as Record<string, unknown>,
              scheduledAt: row.created_at,
              runAt: row.run_at,
              status: mapJobStatus(row.status)
            };
            if (row.schedule_json) {
              try {
                const schedule = JSON.parse(row.schedule_json) as {
                  cron?: string;
                };
                if (schedule.cron) {
                  job.cronSchedule = schedule.cron;
                }
              } catch {
                /* ignore parse errors */
              }
            }
            if (row.status === "completed" || row.status === "failed") {
              job.completedAt = row.updated_at;
            }
            return job;
          });

          return { kind: "scheduler.list.result", jobs };
        } catch {
          // Table may not exist if scheduler hasn't been initialized
          return { kind: "scheduler.list.result", jobs: [] };
        }
      }

      /* ---- Scheduler cancel ---- */
      case "scheduler.cancel": {
        try {
          await driver.run(
            `UPDATE "_scheduled_functions" SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'scheduled'`,
            [Date.now(), payload.jobId]
          );
          return { kind: "scheduler.cancel.result", success: true };
        } catch (err) {
          return {
            kind: "scheduler.cancel.result",
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      default:
        return {
          kind: "error",
          message: `Unknown request kind: ${(payload as { kind: string }).kind}`
        };
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Request handler helpers                                            */
/* ------------------------------------------------------------------ */

function inferFileFromFunctionName(name: string): string {
  const parts = name.split(":");
  if (parts.length > 1) {
    return parts[0]! + ".ts";
  }
  return "unknown";
}

function filterOperatorToSql(op: string): string {
  switch (op) {
    case "eq":
      return "=";
    case "neq":
      return "!=";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    case "contains":
      return "LIKE";
    case "startsWith":
      return "LIKE";
    default:
      return "=";
  }
}

function mapJobStatus(
  status: string
): "pending" | "running" | "completed" | "failed" | "cancelled" {
  switch (status) {
    case "scheduled":
      return "pending";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "skipped":
      return "cancelled";
    default:
      return "pending";
  }
}

function generateId(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (let i = 0; i < 24; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export interface NodeWebSocketDevtoolsSinkOptions {
  url: string;
  reconnectDelayMs?: number;
}

export type DevtoolsRequestHandler = (
  payload: SyncoreRequestPayload
) => Promise<SyncoreResponsePayload>;

export interface NodeWebSocketDevtoolsSink extends DevtoolsSink {
  attachRuntime(getSnapshot: () => SyncoreDevtoolsSnapshot): void;
  attachRequestHandler(handler: DevtoolsRequestHandler): void;
  dispose(): void;
}

export function createNodeWebSocketDevtoolsSink(
  options: NodeWebSocketDevtoolsSinkOptions
): NodeWebSocketDevtoolsSink {
  let socket: WebSocket | undefined;
  let disposed = false;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let getSnapshot: (() => SyncoreDevtoolsSnapshot) | undefined;
  let onRequest: DevtoolsRequestHandler | undefined;
  const pendingMessages: SyncoreDevtoolsMessage[] = [];
  let latestHello:
    | {
        runtimeId: string;
        platform: string;
      }
    | undefined;

  const connect = () => {
    if (disposed) {
      return;
    }
    socket = new WebSocket(options.url);
    socket.on("open", () => {
      if (latestHello) {
        sendNow({
          type: "hello",
          runtimeId: latestHello.runtimeId,
          platform: latestHello.platform
        });
      }
      if (getSnapshot) {
        sendNow({
          type: "snapshot",
          snapshot: getSnapshot()
        });
      }
      flushPendingMessages();
    });
    socket.on("message", (payload) => {
      const rawPayload =
        typeof payload === "string"
          ? payload
          : payload instanceof Buffer
            ? payload.toString("utf8")
            : Array.isArray(payload)
              ? Buffer.concat(payload).toString("utf8")
              : payload instanceof ArrayBuffer
                ? Buffer.from(payload).toString("utf8")
                : Buffer.from(
                    payload.buffer,
                    payload.byteOffset,
                    payload.byteLength
                  ).toString("utf8");
      if (rawPayload.length === 0) {
        return;
      }
      const message = JSON.parse(rawPayload) as
        | SyncoreDevtoolsMessage
        | SyncoreDevtoolsRequest;
      if (message.type === "ping") {
        send({ type: "pong" });
      } else if (message.type === "request" && onRequest) {
        const req = message as SyncoreDevtoolsRequest;
        onRequest(req.payload)
          .then((responsePayload) => {
            send({
              type: "response",
              requestId: req.requestId,
              payload: responsePayload
            });
          })
          .catch((err) => {
            send({
              type: "response",
              requestId: req.requestId,
              payload: {
                kind: "error",
                message: err instanceof Error ? err.message : "Unknown error"
              }
            });
          });
      }
    });
    socket.on("close", scheduleReconnect);
    socket.on("error", scheduleReconnect);
  };

  const scheduleReconnect = () => {
    if (disposed || connectTimer) {
      return;
    }
    connectTimer = setTimeout(() => {
      connectTimer = undefined;
      connect();
    }, options.reconnectDelayMs ?? 1200);
  };

  const sendNow = (message: SyncoreDevtoolsMessage) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const flushPendingMessages = () => {
    while (pendingMessages.length > 0) {
      const nextMessage = pendingMessages.shift();
      if (!nextMessage) {
        continue;
      }
      sendNow(nextMessage);
    }
  };

  const send = (message: SyncoreDevtoolsMessage) => {
    if (socket?.readyState === WebSocket.OPEN) {
      sendNow(message);
      return;
    }
    pendingMessages.push(message);
  };

  connect();

  return {
    emit(event) {
      if (event.type === "runtime.connected") {
        latestHello = {
          runtimeId: event.runtimeId,
          platform: event.platform
        };
        send({
          type: "hello",
          runtimeId: event.runtimeId,
          platform: event.platform
        });
      }
      send({
        type: "event",
        event
      });
      if (getSnapshot) {
        send({
          type: "snapshot",
          snapshot: getSnapshot()
        });
      }
    },
    attachRuntime(snapshotGetter) {
      getSnapshot = snapshotGetter;
      if (socket?.readyState === WebSocket.OPEN) {
        send({
          type: "snapshot",
          snapshot: getSnapshot()
        });
      }
    },
    attachRequestHandler(handler) {
      onRequest = handler;
    },
    dispose() {
      disposed = true;
      if (connectTimer) {
        clearTimeout(connectTimer);
      }
      socket?.close();
    }
  };
}
