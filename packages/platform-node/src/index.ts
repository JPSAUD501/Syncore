import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { createRequire as createNodeRequire } from "node:module";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import WebSocket from "ws";
import type {
  SyncoreDevtoolsClientMessage,
  SyncoreDevtoolsMessage,
  SyncoreRuntimeSummary
} from "@syncore/devtools-protocol";
import {
  type AnySyncoreSchema,
  createDevtoolsCommandHandler,
  createDevtoolsSubscriptionHost,
  type DevtoolsSqlAnalysis,
  type DevtoolsCommandHandler,
  type DevtoolsSqlMode,
  type DevtoolsSqlReadResult,
  type DevtoolsSqlSupport,
  type DevtoolsSink,
  type DevtoolsSubscriptionHost,
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
  SyncoreActiveQueryInfo,
  SyncoreDevtoolsEvent,
  SyncoreRuntimeSummary
} from "@syncore/devtools-protocol";

export type NodeSyncoreSchema = AnySyncoreSchema;

const nodeRequire = createNodeRequire(import.meta.url);
const { Parser: NodeSqlParser } = nodeRequire("node-sql-parser") as {
  Parser: new () => {
    astify(sql: string, options?: { database?: string }): unknown;
  };
};
const nodeSqlParser = new NodeSqlParser();

type SqlAst = {
  type: string;
  from?: Array<{ table?: string; expr?: { ast?: SqlAst } }>;
  table?: Array<{ table?: string }> | { table?: string } | null | string;
};

const nodeDevtoolsSqlSupport: DevtoolsSqlSupport = {
  analyzeSqlStatement(query: string): DevtoolsSqlAnalysis {
    const ast = nodeSqlParser.astify(query, {
      database: "sqlite"
    }) as SqlAst | SqlAst[];
    if (Array.isArray(ast)) {
      throw new Error("Only a single SQL statement is supported.");
    }

    switch (ast.type) {
      case "select":
        return buildReadAnalysis(ast);
      case "update":
      case "delete":
      case "insert":
      case "replace":
        return buildWriteAnalysis(extractTables(ast.table), false);
      case "create":
      case "drop":
      case "alter":
        return buildWriteAnalysis(extractTables(ast.table), true);
      default:
        throw new Error(`Unsupported SQL statement type: ${String(ast.type)}`);
    }
  },
  ensureSqlMode(
    analysis: DevtoolsSqlAnalysis,
    expected: DevtoolsSqlMode | "watch"
  ): void {
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
      const columnsMeta = statement.columns();
      const columns = columnsMeta.map((column) => column.name);
      const observedTables = Array.from(
        new Set(
          columnsMeta
            .map((column) => column.table)
            .filter((table): table is string => typeof table === "string")
        )
      );

      return {
        columns,
        rows: rows.map((row) => columns.map((column) => row[column])),
        observedTables:
          observedTables.length > 0 ? observedTables : analysis.readTables
      };
    } finally {
      database.close();
    }
  }
};

function normalizeData(input: StorageWriteInput["data"]): Uint8Array {
  if (typeof input === "string") {
    return Buffer.from(input);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
}

function buildReadAnalysis(ast: SqlAst): DevtoolsSqlAnalysis {
  const readTables = Array.from(new Set(extractReadTables(ast)));
  return {
    mode: "read",
    readTables,
    writeTables: [],
    schemaChanged: false,
    observedScopes:
      readTables.length > 0
        ? readTables.map((table) => `table:${table}` as const)
        : ["all"]
  };
}

function buildWriteAnalysis(
  tables: string[],
  schemaChanged: boolean
): DevtoolsSqlAnalysis {
  const uniqueTables = Array.from(new Set(tables));
  return {
    mode: schemaChanged ? "ddl" : "write",
    readTables: [],
    writeTables: uniqueTables,
    schemaChanged,
    observedScopes: schemaChanged
      ? [
          "schema.tables",
          ...uniqueTables.map((table) => `table:${table}` as const)
        ]
      : uniqueTables.length > 0
        ? uniqueTables.map((table) => `table:${table}` as const)
        : ["all"]
  };
}

function extractReadTables(ast: SqlAst): string[] {
  return (ast.from ?? [])
    .flatMap((entry) => {
      if (entry.table) {
        return [entry.table];
      }
      if (entry.expr?.ast) {
        return extractReadTables(entry.expr.ast);
      }
      return [];
    })
    .filter((table) => table !== "dual");
}

function extractTables(table: SqlAst["table"]): string[] {
  if (Array.isArray(table)) {
    return table
      .map((entry) => entry?.table)
      .filter((value): value is string => typeof value === "string");
  }
  if (table && typeof table === "object") {
    return typeof table.table === "string" ? [table.table] : [];
  }
  if (typeof table === "string") {
    return [table];
  }
  return [];
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
  appName?: string;
  origin?: string;
  sessionLabel?: string;
  platform?: string;
  devtools?: DevtoolsSink | false;
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
  const resolvedDevtoolsUrl =
    options.devtoolsUrl ?? resolveDefaultNodeDevtoolsUrl();
  const websocketDevtools =
    options.devtools === undefined &&
    resolvedDevtoolsUrl &&
    shouldAutoConnectNodeDevtools()
      ? createNodeWebSocketDevtoolsSink({
          url: resolvedDevtoolsUrl,
          ...(options.appName ? { appName: options.appName } : {}),
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.sessionLabel
            ? { sessionLabel: options.sessionLabel }
            : {}),
          targetKind: "client",
          storageProtocol: "file",
          databaseLabel: path.basename(options.databasePath),
          storageIdentity: `file::${path.resolve(options.databasePath)}`
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
  const resolvedDevtools =
    options.devtools === false
      ? undefined
      : (options.devtools ?? websocketDevtools);
  if (resolvedDevtools) {
    runtimeOptions.devtools = resolvedDevtools;
  }
  if (options.scheduler) {
    runtimeOptions.scheduler = options.scheduler;
  }
  const runtime = new SyncoreRuntime(runtimeOptions);
  websocketDevtools?.attachRuntime(runtime);
  if (websocketDevtools) {
    websocketDevtools.attachCommandHandler(
      createDevtoolsCommandHandler({
        driver: runtimeOptions.driver,
        schema: options.schema,
        functions: options.functions,
        runtime,
        sql: nodeDevtoolsSqlSupport
      })
    );
    websocketDevtools.attachSubscriptionHost(
      createDevtoolsSubscriptionHost({
        driver: runtimeOptions.driver,
        schema: options.schema,
        functions: options.functions,
        runtime,
        sql: nodeDevtoolsSqlSupport
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

export interface NodeWebSocketDevtoolsSinkOptions {
  url: string;
  reconnectDelayMs?: number;
  appName?: string;
  origin?: string;
  sessionLabel?: string;
  targetKind?: "client";
  storageProtocol?: string;
  databaseLabel?: string;
  storageIdentity?: string;
}

export interface NodeWebSocketDevtoolsSink extends DevtoolsSink {
  attachRuntime(runtime: SyncoreRuntime<AnySyncoreSchema>): void;
  attachCommandHandler(handler: DevtoolsCommandHandler): void;
  attachSubscriptionHost(host: DevtoolsSubscriptionHost): void;
  dispose(): void;
}

export function createNodeWebSocketDevtoolsSink(
  options: NodeWebSocketDevtoolsSinkOptions
): NodeWebSocketDevtoolsSink {
  let socket: WebSocket | undefined;
  let disposed = false;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let getSummary: (() => SyncoreRuntimeSummary) | undefined;
  let onCommand: DevtoolsCommandHandler | undefined;
  let subscriptionHost: DevtoolsSubscriptionHost | undefined;
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
          platform: latestHello.platform,
          ...(options.appName ? { appName: options.appName } : {}),
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.sessionLabel
            ? { sessionLabel: options.sessionLabel }
            : {}),
          ...(options.targetKind ? { targetKind: options.targetKind } : {}),
          ...(options.storageProtocol
            ? { storageProtocol: options.storageProtocol }
            : {}),
          ...(options.databaseLabel ? { databaseLabel: options.databaseLabel } : {}),
          ...(options.storageIdentity
            ? { storageIdentity: options.storageIdentity }
            : {})
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
        | SyncoreDevtoolsClientMessage;
      if (message.type === "ping") {
        send({ type: "pong" });
      } else if (message.type === "command" && onCommand) {
        onCommand(message.payload)
          .then((responsePayload) => {
            const runtimeId =
              latestHello?.runtimeId ?? getSummary?.().runtimeId;
            if (!runtimeId) {
              return;
            }
            send({
              type: "command.result",
              commandId: message.commandId,
              runtimeId,
              payload: responsePayload
            });
          })
          .catch((err) => {
            const runtimeId =
              latestHello?.runtimeId ?? getSummary?.().runtimeId;
            if (!runtimeId) {
              return;
            }
            send({
              type: "command.result",
              commandId: message.commandId,
              runtimeId,
              payload: {
                kind: "error",
                message: err instanceof Error ? err.message : "Unknown error"
              }
            });
          });
      } else if (message.type === "subscribe" && subscriptionHost) {
        void subscriptionHost.subscribe(
          message.subscriptionId,
          message.payload,
          (payload) => {
            const runtimeId =
              latestHello?.runtimeId ?? getSummary?.().runtimeId;
            if (!runtimeId) {
              return;
            }
            send({
              type: "subscription.data",
              subscriptionId: message.subscriptionId,
              runtimeId,
              payload
            });
          }
        );
      } else if (message.type === "unsubscribe") {
        subscriptionHost?.unsubscribe(message.subscriptionId);
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
          platform: event.platform,
          ...(options.appName ? { appName: options.appName } : {}),
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.sessionLabel
            ? { sessionLabel: options.sessionLabel }
            : {}),
          ...(options.targetKind ? { targetKind: options.targetKind } : {}),
          ...(options.storageProtocol
            ? { storageProtocol: options.storageProtocol }
            : {}),
          ...(options.databaseLabel ? { databaseLabel: options.databaseLabel } : {}),
          ...(options.storageIdentity
            ? { storageIdentity: options.storageIdentity }
            : {})
        });
      }
      send({
        type: "event",
        event
      });
    },
    attachRuntime(runtime) {
      getSummary = () =>
        withRuntimeSummaryMeta(runtime.getRuntimeSummary(), options);
    },
    attachCommandHandler(handler) {
      onCommand = handler;
    },
    attachSubscriptionHost(host) {
      subscriptionHost = host;
    },
    dispose() {
      disposed = true;
      if (connectTimer) {
        clearTimeout(connectTimer);
      }
      subscriptionHost?.dispose();
      socket?.close();
    }
  };
}

function withRuntimeSummaryMeta(
  summary: SyncoreRuntimeSummary,
  options: NodeWebSocketDevtoolsSinkOptions
): SyncoreRuntimeSummary {
  return {
    ...summary,
    ...(options.appName ? { appName: options.appName } : {}),
    ...(options.origin ? { origin: options.origin } : {}),
    ...(options.sessionLabel ? { sessionLabel: options.sessionLabel } : {}),
    ...(options.targetKind ? { targetKind: options.targetKind } : {}),
    ...(options.storageProtocol
      ? { storageProtocol: options.storageProtocol }
      : {}),
    ...(options.databaseLabel ? { databaseLabel: options.databaseLabel } : {}),
    ...(options.storageIdentity
      ? { storageIdentity: options.storageIdentity }
      : {})
  };
}

function shouldAutoConnectNodeDevtools(): boolean {
  return process.env.NODE_ENV !== "production";
}

function resolveDefaultNodeDevtoolsUrl(): string | undefined {
  if (process.env.SYNCORE_DISABLE_DEVTOOLS === "1") {
    return undefined;
  }
  return process.env.SYNCORE_DEVTOOLS_URL ?? "ws://127.0.0.1:4311";
}
