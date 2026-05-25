import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import WebSocket from "ws";
import {
  SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
  SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
  SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
} from "@syncore/devtools-protocol";
import type {
  SyncoreDevtoolsClientMessage,
  SyncoreDevtoolsCapabilities,
  SyncoreDevtoolsExternalChangeEvent,
  SyncoreDevtoolsMessage,
  SyncoreRuntimeSummary
} from "@syncore/devtools-protocol";
import {
  createDevtoolsCommandHandler,
  createDevtoolsSubscriptionHost,
  type DevtoolsCommandHandler,
  type DevtoolsSink,
  type DevtoolsSubscriptionHost,
  type SchedulerOptions,
  type StorageObject,
  type StorageWriteInput,
  type SyncoreCapabilities,
  type SyncoreDataModel,
  type SyncoreExternalChangeEvent,
  type SyncoreExternalChangeSignal,
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

export type NodeSyncoreSchema<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> = TSchema;

const DEVTOOLS_META_DIRECTORY = ".syncore-devtools";
const DATA_SOURCE_ALIAS_PREFIX = "data-source-alias";

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

/**
 * SQLite driver backed by Node.js’s built-in `node:sqlite` module (Node 22+).
 *
 * Opens the database at `databasePath` with `WAL` journal mode and foreign-key
 * enforcement enabled. The file is created if it does not exist.
 *
 * ```ts
 * const driver = new NodeSqliteDriver("./data/app.db");
 * ```
 *
 * In most cases you should use {@link createNodeSyncoreRuntime} which
 * instantiates this driver automatically from your `databasePath` option.
 */
export class NodeSqliteDriver implements SyncoreSqlDriver {
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

/**
 * Blob storage adapter that reads and writes files in a local directory.
 *
 * Each stored object is saved as a flat file named by its ID inside
 * `directory`. The directory is created automatically on first write.
 *
 * ```ts
 * const storage = new NodeFileStorageAdapter("./data/storage");
 * ```
 *
 * In most cases you should use {@link createNodeSyncoreRuntime} which
 * instantiates this adapter automatically from your `storageDirectory` option.
 */
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

const SESSION_ADJECTIVES = [
  "Acrobatic",
  "Bold",
  "Cosmic",
  "Daring",
  "Electric",
  "Fierce",
  "Golden",
  "Hidden",
  "Iron",
  "Jade",
  "Keen",
  "Lunar",
  "Mystic",
  "Noble",
  "Orbital",
  "Primal",
  "Quick",
  "Radiant",
  "Shadow",
  "Turbo",
  "Ultra",
  "Vivid",
  "Wicked",
  "Xenon",
  "Zen",
  "Arctic",
  "Binary",
  "Cyber",
  "Digital",
  "Ember",
  "Frozen",
  "Galactic",
  "Hyper",
  "Infra",
  "Jumbo",
  "Kinetic",
  "Liquid",
  "Magnetic",
  "Neon",
  "Onyx",
  "Phantom",
  "Quantum",
  "Rapid",
  "Sonic",
  "Titan",
  "Velvet",
  "Wild",
  "Blazing",
  "Crystal",
  "Dynamic"
] as const;

const SESSION_NOUNS = [
  "Phoenix",
  "Dragon",
  "Developer",
  "Hacker",
  "Wizard",
  "Runner",
  "Ranger",
  "Maverick",
  "Spartan",
  "Viking",
  "Sentinel",
  "Guardian",
  "Nomad",
  "Cipher",
  "Vector",
  "Matrix",
  "Prism",
  "Nebula",
  "Comet",
  "Pulse",
  "Vertex",
  "Flux",
  "Storm",
  "Blaze",
  "Frost",
  "Thunder",
  "Drift"
] as const;

function generateUniqueSessionName(): string {
  const adj =
    SESSION_ADJECTIVES[Math.floor(Math.random() * SESSION_ADJECTIVES.length)]!;
  const noun = SESSION_NOUNS[Math.floor(Math.random() * SESSION_NOUNS.length)]!;
  return `${adj} ${noun}`;
}

function resolvePersistedDataSourceAlias(
  storageDirectory: string,
  storageIdentity: string
): string {
  const metaDirectory = path.join(storageDirectory, DEVTOOLS_META_DIRECTORY);
  const aliasId = createHash("sha256")
    .update(storageIdentity)
    .digest("hex")
    .slice(0, 16);
  const aliasPath = path.join(
    metaDirectory,
    `${DATA_SOURCE_ALIAS_PREFIX}-${aliasId}.txt`
  );

  try {
    const existing = readFileSync(aliasPath, "utf8").trim();
    if (existing.length > 0) {
      return existing;
    }
  } catch {
    // Missing metadata is expected for a new data source.
  }

  const nextValue = generateUniqueSessionName();
  try {
    mkdirSync(metaDirectory, { recursive: true });
    writeFileSync(aliasPath, nextValue, "utf8");
  } catch {
    // The alias is a dashboard convenience; runtime startup must not depend on it.
  }
  return nextValue;
}

/**
 * Options for {@link createNodeSyncoreRuntime}.
 *
 * At minimum supply `databasePath`, `storageDirectory`, `schema`, and
 * `functions`. Everything else has sensible defaults (auto-devtools connect in
 * development, Node SQLite driver, local file storage).
 *
 * ```ts
 * createNodeSyncoreRuntime({
 *   databasePath: path.join(dataDir, "app.db"),
 *   storageDirectory: path.join(dataDir, "storage"),
 *   schema,
 *   functions,
 * });
 * ```
 */
export interface CreateNodeRuntimeOptions<
  TSchema extends NodeSyncoreSchema = NodeSyncoreSchema
> {
  /**
   * Absolute or relative path to the SQLite database file.
   *
   * The file is created if it does not exist. Use an absolute path in
   * production to avoid ambiguity about the current working directory.
   */
  databasePath: string;
  /**
   * Directory where blob storage objects (images, files, etc.) are persisted.
   *
   * The directory is created automatically if it does not exist.
   */
  storageDirectory: string;
  /** The data model that defines the available tables and indexes. */
  schema: TSchema;
  /**
   * The registered function map. Use the `functions` export from
   * `syncore/_generated/functions.ts`.
   */
  functions: SyncoreRuntimeOptions<TSchema>["functions"];
  /**
   * Resolved Syncore component instances. Only required when your app
   * installs Syncore component packages.
   */
  components?: SyncoreRuntimeOptions<TSchema>["components"];
  /**
   * Platform capabilities injected into `ctx.capabilities` inside function
   * handlers.
   */
  capabilities?: SyncoreCapabilities;
  /** Human-readable app name shown in the devtools dashboard. */
  appName?: string;
  /** Origin label (e.g. process name) shown in devtools. */
  origin?: string;
  /** Devtools session label. Auto-generated when omitted. */
  sessionLabel?: string;
  /**
   * Platform label reported to devtools. Defaults to `"node"`, or
   * `"electron-main"` when the runtime is used inside Electron's main process.
   */
  platform?: string;
  /**
   * Devtools event sink. Pass `false` to disable devtools entirely (recommended
   * for production). Omit to auto-connect to the local devtools server when
   * running in development.
   */
  devtools?: DevtoolsSink | false;
  /**
   * Explicit devtools WebSocket server URL. Defaults to
   * `ws://localhost:3099` (the Syncore devtools default port).
   */
  devtoolsUrl?: string;
  /** Scheduler configuration for background and recurring jobs. */
  scheduler?: SchedulerOptions;
}

/**
 * Alias of {@link CreateNodeRuntimeOptions} exposed for the managed-client
 * helper.
 * @see CreateNodeRuntimeOptions
 */
export type WithNodeSyncoreClientOptions<
  TSchema extends NodeSyncoreSchema = NodeSyncoreSchema
> = CreateNodeRuntimeOptions<TSchema>;

/**
 * A started local Node runtime paired with its client and a dispose helper.
 *
 * Returned by `withNodeSyncoreClient()`. Call `dispose()` when you are
 * finished (e.g. in tests or short-lived scripts) to stop the runtime and
 * close the database.
 */
export interface ManagedNodeSyncoreClient<
  TSchema extends NodeSyncoreSchema = NodeSyncoreSchema
> {
  /** The underlying runtime instance. */
  runtime: SyncoreRuntime<TSchema>;
  /** A ready-to-use client for calling Syncore functions. */
  client: ReturnType<SyncoreRuntime<TSchema>["createClient"]>;
  /** Stop the runtime, flush pending jobs, and close the database. */
  dispose(): Promise<void>;
}

/**
 * Opaque handle returned by Syncore’s Electron IPC bridge setup.
 *
 * - `ready`: resolves when the bridge is connected and the renderer is ready to
 *   receive messages.
 * - `dispose()`: tears down the bridge and removes IPC listeners.
 */
export interface SyncoreElectronIpcBinding {
  ready: Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Minimal interface that Syncore requires from an Electron `BrowserWindow`
 * instance.
 *
 * Scoped to avoid importing Electron at the type level.
 */
export interface SyncoreElectronBridgeWindow {
  isDestroyed(): boolean;
  webContents: {
    send(channel: string, message: unknown): void;
  };
}

/**
 * Options for setting up Syncore’s Electron main-process IPC bridge.
 *
 * The bridge forwards database change events from the main-process runtime to
 * the renderer window over a named IPC channel.
 *
 * ```ts
 * createElectronSyncoreBridge(runtime, {
 *   window: mainWindow,
 *   onRendererMessage: (listener) => {
 *     ipcMain.on("syncore", (_e, msg) => listener(msg));
 *     return () => ipcMain.removeAllListeners("syncore");
 *   },
 * });
 * ```
 */
export interface CreateElectronSyncoreBridgeOptions {
  /** The renderer window that will receive push messages. */
  window: SyncoreElectronBridgeWindow;
  /**
   * Register a listener for messages sent from the renderer. Must return an
   * unsubscribe function.
   */
  onRendererMessage(listener: (message: unknown) => void): () => void;
  /** IPC channel name. Defaults to `"syncore"`. */
  channel?: string;
}

/**
 * The subset of Electron’s `ipcMain` used by Syncore’s main-process helper.
 *
 * Using this narrowed interface avoids a hard runtime dependency on Electron.
 */
export interface SyncoreElectronIpcMain {
  on(
    channel: string,
    listener: (event: { sender: unknown }, message: unknown) => void
  ): void;
  off(
    channel: string,
    listener: (event: { sender: unknown }, message: unknown) => void
  ): void;
}

/**
 * Options for creating a client inside an Electron renderer process via the
 * preload IPC bridge.
 */
export interface CreateSyncoreRendererWindowClientOptions {
  /** Name of the bridge registered in the preload script. Defaults to `"syncore"`. */
  bridgeName?: string;
}

/**
 * Create a Syncore runtime for Node.js (or Electron’s main process) backed by
 * the built-in `node:sqlite` driver and local file storage.
 *
 * This is the recommended entry point for Node and Electron apps. It wires up
 * the SQL driver, storage adapter, devtools WebSocket connection, and
 * cross-process change signals automatically.
 *
 * ```ts
 * import path from "node:path";
 * import { createNodeSyncoreRuntime } from "syncorejs/node";
 * import schema from "./syncore/schema";
 * import { functions } from "./syncore/_generated/functions";
 *
 * const runtime = createNodeSyncoreRuntime({
 *   databasePath: path.join(app.getPath("userData"), "db.sqlite"),
 *   storageDirectory: path.join(app.getPath("userData"), "storage"),
 *   schema,
 *   functions,
 * });
 *
 * await runtime.start();
 * const client = runtime.createClient();
 * ```
 *
 * @param options - Configuration object. See {@link CreateNodeRuntimeOptions}.
 * @returns A configured (but not yet started) {@link SyncoreRuntime}. Call
 *   `await runtime.start()` before using the client.
 */
export function createNodeSyncoreRuntime<
  TSchema extends NodeSyncoreSchema
>(
  options: CreateNodeRuntimeOptions<TSchema>
): SyncoreRuntime<TSchema> {
  const resolvedDevtoolsUrl =
    options.devtoolsUrl ?? resolveDefaultNodeDevtoolsUrl();
  const storageIdentity = `file::${path.resolve(options.databasePath)}`;
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
          dataSourceAlias: resolvePersistedDataSourceAlias(
            options.storageDirectory,
            storageIdentity
          ),
          storageIdentity,
          runtimeRole: "app",
          capabilities: createNodeDevtoolsCapabilities()
        })
      : undefined;
  const runtimeOptions: SyncoreRuntimeOptions<TSchema> = {
    schema: options.schema,
    functions: options.functions,
    ...(options.components ? { components: options.components } : {}),
    driver: new NodeSqliteDriver(options.databasePath),
    storage: new NodeFileStorageAdapter(options.storageDirectory),
    platform: options.platform ?? "node"
  };
  if (options.capabilities) {
    runtimeOptions.capabilities = options.capabilities;
  }
  const resolvedDevtools =
    options.devtools === false
      ? undefined
      : (options.devtools ?? websocketDevtools);
  if (resolvedDevtools) {
    runtimeOptions.devtools = resolvedDevtools;
  }
  if (websocketDevtools?.externalChangeSignal) {
    runtimeOptions.externalChangeSignal = websocketDevtools.externalChangeSignal;
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
        admin: runtime.getAdmin()
      })
    );
    websocketDevtools.attachSubscriptionHost(
      createDevtoolsSubscriptionHost({
        driver: runtimeOptions.driver,
        schema: options.schema,
        functions: options.functions,
        admin: runtime.getAdmin()
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
export function createNodeSyncoreClient<
  TSchema extends NodeSyncoreSchema
>(runtime: SyncoreRuntime<TSchema>) {
  return runtime.createClient();
}

/**
 * Start a Node Syncore runtime and return its client together with a dispose helper.
 */
export async function createManagedNodeSyncoreClient<
  TSchema extends NodeSyncoreSchema
>(
  options: WithNodeSyncoreClientOptions<TSchema>
): Promise<ManagedNodeSyncoreClient<TSchema>> {
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
export async function withNodeSyncoreClient<
  TSchema extends NodeSyncoreSchema,
  TResult
>(
  options: WithNodeSyncoreClientOptions<TSchema>,
  callback: (
    client: ReturnType<SyncoreRuntime<TSchema>["createClient"]>,
    runtime: SyncoreRuntime<TSchema>
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
    const handleRendererMessage = (
      event: { sender: unknown },
      message: unknown
    ) => {
      if (event.sender !== options.window.webContents) {
        return;
      }
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
  targetKind?: "client" | "project";
  runtimeRole?: "app" | "project-target";
  storageProtocol?: string;
  databaseLabel?: string;
  dataSourceAlias?: string;
  storageIdentity?: string;
  capabilities?: SyncoreDevtoolsCapabilities;
}

export interface NodeWebSocketDevtoolsSink extends DevtoolsSink {
  attachRuntime(runtime: SyncoreRuntime<NodeSyncoreSchema>): void;
  attachCommandHandler(handler: DevtoolsCommandHandler): void;
  attachSubscriptionHost(host: DevtoolsSubscriptionHost): void;
  externalChangeSignal?: SyncoreExternalChangeSignal;
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
  const externalChangeListeners = new Set<
    (event: SyncoreExternalChangeEvent) => void
  >();
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
          protocolVersion: SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
          minSupportedProtocolVersion:
            SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
          maxSupportedProtocolVersion:
            SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
          runtimeId: latestHello.runtimeId,
          platform: latestHello.platform,
          ...(options.appName ? { appName: options.appName } : {}),
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.sessionLabel
            ? { sessionLabel: options.sessionLabel }
            : {}),
          ...(options.targetKind ? { targetKind: options.targetKind } : {}),
          ...(options.runtimeRole ? { runtimeRole: options.runtimeRole } : {}),
          ...(options.storageProtocol
            ? { storageProtocol: options.storageProtocol }
            : {}),
          ...(options.databaseLabel ? { databaseLabel: options.databaseLabel } : {}),
          ...(options.dataSourceAlias
            ? { dataSourceAlias: options.dataSourceAlias }
            : {}),
          ...(options.storageIdentity
            ? { storageIdentity: options.storageIdentity }
            : {}),
          capabilities: options.capabilities ?? createNodeDevtoolsCapabilities()
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
      } else if (message.type === "external.change") {
        for (const listener of externalChangeListeners) {
          listener(message.event as SyncoreExternalChangeEvent);
        }
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

  const sink: NodeWebSocketDevtoolsSink = {
    emit(event) {
      if (event.type === "runtime.connected") {
        latestHello = {
          runtimeId: event.runtimeId,
          platform: event.platform
        };
        send({
          type: "hello",
          protocolVersion: SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
          minSupportedProtocolVersion:
            SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
          maxSupportedProtocolVersion:
            SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
          runtimeId: event.runtimeId,
          platform: event.platform,
          ...(options.appName ? { appName: options.appName } : {}),
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.sessionLabel
            ? { sessionLabel: options.sessionLabel }
            : {}),
          ...(options.targetKind ? { targetKind: options.targetKind } : {}),
          ...(options.runtimeRole ? { runtimeRole: options.runtimeRole } : {}),
          ...(options.storageProtocol
            ? { storageProtocol: options.storageProtocol }
            : {}),
          ...(options.databaseLabel ? { databaseLabel: options.databaseLabel } : {}),
          ...(options.dataSourceAlias
            ? { dataSourceAlias: options.dataSourceAlias }
            : {}),
          ...(options.storageIdentity
            ? { storageIdentity: options.storageIdentity }
            : {}),
          capabilities: options.capabilities ?? createNodeDevtoolsCapabilities()
        });
      }
      send({
        type: "event",
        event
      });
    },
    attachRuntime(runtime) {
      getSummary = () =>
        withRuntimeSummaryMeta(runtime.getAdmin().getRuntimeSummary(), options);
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
  if (options.storageIdentity) {
    sink.externalChangeSignal = {
      subscribe(listener) {
        externalChangeListeners.add(listener);
        return () => {
          externalChangeListeners.delete(listener);
        };
      },
      publish(event) {
        const runtimeId = latestHello?.runtimeId ?? getSummary?.().runtimeId;
        if (!runtimeId) {
          return;
        }
        send({
          type: "external.change",
          runtimeId,
          storageIdentity: options.storageIdentity!,
          event: event as SyncoreDevtoolsExternalChangeEvent
        });
      },
      close() {
        externalChangeListeners.clear();
      }
    };
  }
  return sink;
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
    ...(options.runtimeRole ? { runtimeRole: options.runtimeRole } : {}),
    ...(options.storageProtocol
      ? { storageProtocol: options.storageProtocol }
      : {}),
    ...(options.databaseLabel ? { databaseLabel: options.databaseLabel } : {}),
    ...(options.dataSourceAlias ? { dataSourceAlias: options.dataSourceAlias } : {}),
    ...(options.storageIdentity
      ? { storageIdentity: options.storageIdentity }
      : {}),
    capabilities: options.capabilities ?? createNodeDevtoolsCapabilities()
  };
}

function createNodeDevtoolsCapabilities(): SyncoreDevtoolsCapabilities {
  return {
    sql: {
      read: false,
      write: false,
      live: false,
      reason: "SQL Console is provided by the Project Target for this data source."
    },
    data: {
      browse: true,
      mutate: true,
      importExport: true
    },
    scheduler: {
      read: true,
      edit: true
    }
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
