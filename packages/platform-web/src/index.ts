import {
  createDevtoolsCommandHandler,
  createDevtoolsSubscriptionHost,
  type DevtoolsCommandHandler,
  type DevtoolsSink,
  type DevtoolsSubscriptionHost,
  type SyncoreDataModel,
  generateId,
  SyncoreRuntime,
  type SchedulerOptions,
  type SyncoreCapabilities,
  type SyncoreRuntimeCapabilities,
  type SyncoreRuntimeOptions,
  type SyncoreStorageAdapter,
  type StorageObject,
  type StorageWriteInput
} from "@syncore/core";
import {
  SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
  SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
  SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
  type SyncoreDevtoolsClientMessage,
  type SyncoreDevtoolsCapabilities,
  type SyncoreDevtoolsMessage,
  type SyncoreRuntimeSummary
} from "@syncore/devtools-protocol";
import {
  createWebPersistence,
  type SyncoreWebPersistence,
  type WebPersistenceMode
} from "./persistence.js";
import {
  BroadcastChannelExternalChangeSignal,
  createDefaultSyncChannelName,
  SqlJsExternalChangeApplier
} from "./external-change.js";
import { SqlJsDriver } from "./sqljs.js";
import {
  attachWebWorkerRuntime,
  type SyncoreWorkerMessageEndpoint
} from "./worker.js";
export * from "./worker.js";
export * from "./persistence.js";
export * from "./indexeddb.js";
export * from "./opfs.js";
export * from "./external-change.js";

/**
 * Schema type constraint for web-platform Syncore runtimes.
 *
 * Pass any schema produced by `defineSchema()` where this type is expected.
 * Defaults to the unconstrained `SyncoreDataModel` when omitted.
 */
export type WebSyncoreSchema<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> = TSchema;
/**
 * Alias of {@link WebSyncoreSchema} for the `syncorejs/browser` surface.
 * @see WebSyncoreSchema
 */
export type BrowserSyncoreSchema<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> = WebSyncoreSchema<TSchema>;

const DEVTOOLS_META_NAMESPACE = "__syncore_devtools_meta__";
const STORAGE_SCOPE_ID_PREFIX = "storage-scope";
const DATA_SOURCE_ALIAS_PREFIX = "data-source-alias";

/**
 * Options for constructing a browser Syncore runtime.
 *
 * Use this when you want to host the full runtime directly in a browser tab or
 * dedicated Web Worker. In most React or Svelte apps you should call
 * `createWebWorkerSyncoreRuntime()` inside a worker file instead, so that
 * SQLite and query execution run off the main thread.
 *
 * At minimum you must supply `schema` and `functions`. Everything else has
 * sensible defaults (OPFS persistence, SQL.js driver, auto-devtools connect).
 *
 * ```ts
 * const runtime = await createWebSyncoreRuntime({
 *   schema,
 *   functions,
 *   databaseName: "my-app",
 * });
 * ```
 */
export interface CreateWebRuntimeOptions<
  TSchema extends WebSyncoreSchema = WebSyncoreSchema
> {
  /** The data model that defines the available tables and indexes. */
  schema: TSchema;

  /**
   * The registered function map. In practice this is always the `functions`
   * export from `syncore/_generated/functions.ts`.
   */
  functions: SyncoreRuntimeOptions<TSchema>["functions"];

  /**
   * Resolved Syncore component instances to mount alongside the root app.
   * Only required when your app installs Syncore component packages.
   */
  components?: SyncoreRuntimeOptions<TSchema>["components"];

  /**
   * Platform capabilities injected into `ctx.capabilities` inside function
   * handlers. Use this to expose browser APIs (e.g. `navigator.geolocation`)
   * to your Syncore functions in a portable way.
   */
  capabilities?: SyncoreCapabilities;

  /**
   * Custom SQLite driver. Defaults to a `SqlJsDriver` backed by the
   * persistence layer chosen by `persistenceMode` / `persistence`.
   *
   * Override only when you need a non-standard SQLite binding.
   */
  driver?: SyncoreRuntimeOptions<TSchema>["driver"];

  /**
   * Custom blob storage adapter. Defaults to `BrowserFileStorageAdapter`
   * only when the resolved persistence layer is OPFS. IndexedDB persistence is
   * data-only unless a custom adapter is provided explicitly.
   *
   * Override when you want to store files in a different location (e.g. an
   * in-memory adapter for tests).
   */
  storage?: SyncoreStorageAdapter;

  /**
   * An explicit persistence implementation. When provided, `persistenceMode`,
   * `persistenceDatabaseName`, and `opfsRootDirectoryName` are ignored.
   *
   * Most apps should omit this and let Syncore choose the best available mode
   * automatically via `persistenceMode`.
   */
  persistence?: SyncoreWebPersistence;

  /**
   * Which browser storage backend Syncore should use when it creates the
   * persistence layer for you.
   *
   * - `"opfs"` — Origin Private File System (recommended for modern browsers;
   *   supports large databases and true WAL mode).
   * - `"indexeddb"` — IndexedDB-backed persistence (wider compatibility).
   *
   * Defaults to the best mode available in the current browser.
   */
  persistenceMode?: WebPersistenceMode;

  /**
   * Logical name used to namespace the SQL.js database and local storage keys.
   *
   * Set a stable value (e.g. your app’s slug) so the database persists across
   * page reloads with a predictable name. Defaults to `"syncore"`.
   */
  databaseName?: string;

  /**
   * IndexedDB database name used to store persistence metadata (e.g. the OPFS
   * scope identifier). Defaults to `databaseName`.
   */
  persistenceDatabaseName?: string;

  /**
   * OPFS root directory name for the SQLite database file and blob storage.
   * Defaults to `databaseName` or `"syncore"`.
   */
  opfsRootDirectoryName?: string;

  /**
   * Namespace prefix for blob storage keys. Defaults to `databaseName` or
   * `"syncore"`.
   */
  storageNamespace?: string;

  /**
   * Explicit URL for the `sql.js` WebAssembly binary.
   *
   * Syncore resolves the URL automatically in most bundler setups. Override
   * this only if the auto-resolved URL is incorrect (e.g. in a custom CDN
   * deploy or a worker with a different asset base path).
   */
  wasmUrl?: string;

  /**
   * Custom file resolver for SQL.js support files (wasm + worker scripts).
   *
   * Takes a filename (e.g. `"sql-wasm.wasm"`) and returns the full URL.
   * Equivalent to sql.js’s `locateFile` option. Use `wasmUrl` instead when
   * you only need to override the `.wasm` path.
   */
  locateFile?: (fileName: string) => string;

  /**
   * Platform label reported to the devtools dashboard.
   * Defaults to `"browser"`.
   */
  platform?: string;

  /** Human-readable app name shown in the devtools dashboard header. */
  appName?: string;

  /**
   * Explicit devtools WebSocket server URL.
   * Defaults to `ws://127.0.0.1:4311` (the Syncore devtools default port).
   */
  devtoolsUrl?: string;

  /**
   * Allow the connected devtools WebSocket endpoint to send privileged
   * commands/subscriptions to this runtime. Defaults to `true` only for the
   * trusted loopback devtools URL used by Syncore's automatic devtools setup.
   */
  devtoolsRemoteControl?: boolean;

  /**
   * Devtools event sink. Pass `false` to disable devtools entirely
   * (recommended for production builds). Omit to auto-connect to the local
   * devtools server when running in development.
   */
  devtools?: DevtoolsSink | false;

  /** Scheduler configuration for background and recurring jobs. */
  scheduler?: SchedulerOptions;
}

/**
 * Options for hosting a Syncore runtime inside a dedicated browser Worker.
 *
 * Extends {@link CreateWebRuntimeOptions} with the `endpoint` field that wires
 * the runtime to the worker’s message port. Use this inside a worker entry
 * file (`syncore.worker.ts`):
 *
 * ```ts
 * // syncore.worker.ts
 * import { createWebWorkerSyncoreRuntime } from "syncorejs/browser";
 * import schema from "./syncore/schema";
 * import { functions } from "./syncore/_generated/functions";
 *
 * createWebWorkerSyncoreRuntime({
 *   schema,
 *   functions,
 *   endpoint: self as unknown as SyncoreWorkerMessageEndpoint,
 * });
 * ```
 */
export interface CreateWebWorkerRuntimeOptions<
  TSchema extends WebSyncoreSchema = WebSyncoreSchema
> extends CreateWebRuntimeOptions<TSchema> {
  /** The message endpoint exposed by the current worker global. */
  endpoint: SyncoreWorkerMessageEndpoint;
}

/**
 * Alias of {@link CreateWebRuntimeOptions} for the `syncorejs/browser` surface.
 * @see CreateWebRuntimeOptions
 */
export type CreateBrowserRuntimeOptions<
  TSchema extends BrowserSyncoreSchema = BrowserSyncoreSchema
> = CreateWebRuntimeOptions<TSchema>;

/**
 * Alias of {@link CreateWebWorkerRuntimeOptions} for the `syncorejs/browser` surface.
 * @see CreateWebWorkerRuntimeOptions
 */
export type CreateBrowserWorkerRuntimeOptions<
  TSchema extends BrowserSyncoreSchema = BrowserSyncoreSchema
> = CreateWebWorkerRuntimeOptions<TSchema>;

/**
 * Internal bookkeeping for the browser cross-tab change synchronisation layer.
 *
 * Holds the `BroadcastChannel`-based signal that publishes and receives
 * database-change events between tabs, and optionally an `applier` that
 * reconciles incoming changes into an in-memory SQL.js database.
 *
 * You do not need to use this directly — `createWebSyncoreRuntime` builds it
 * for you from your options. Exposed for advanced setups (e.g. Expo web) that
 * construct the change support layer independently.
 */
export interface WebExternalChangeSupport {
  signal: BroadcastChannelExternalChangeSignal;
  applier?: SqlJsExternalChangeApplier;
}

/**
 * Create a full Syncore runtime directly in the browser (main thread or
 * shared worker).
 *
 * This function sets up SQL.js, the OPFS/IndexedDB persistence layer,
 * OPFS-backed blob storage when available, cross-tab change synchronisation via `BroadcastChannel`, and
 * auto-connects to the devtools server in development.
 *
 * @remarks
 * Most React/Svelte apps should run the runtime inside a `Worker` using
 * `createWebWorkerSyncoreRuntime()` instead, so that SQLite queries don’t
 * block the main thread. Use `createWebSyncoreRuntime` only when a worker is
 * not practical (e.g. in Electron renderer processes or certain test setups).
 *
 * ```ts
 * const runtime = await createWebSyncoreRuntime({ schema, functions });
 * await runtime.start();
 * const client = runtime.createClient();
 * ```
 */
export async function createWebSyncoreRuntime<TSchema extends WebSyncoreSchema>(
  options: CreateWebRuntimeOptions<TSchema>
): Promise<SyncoreRuntime<TSchema>> {
  const persistence =
    options.persistence ??
    (await createWebPersistence({
      ...(options.persistenceMode ? { mode: options.persistenceMode } : {}),
      ...(options.persistenceDatabaseName
        ? { indexedDbDatabaseName: options.persistenceDatabaseName }
        : {}),
      opfsRootDirectoryName:
        options.opfsRootDirectoryName ?? options.databaseName ?? "syncore"
    }));
  const wasmUrl =
    options.wasmUrl ??
    (options.locateFile || !isBrowserLikeRuntime()
      ? undefined
      : await resolveDefaultWebWasmUrl());
  const driver =
    options.driver ??
    (await SqlJsDriver.create({
      databaseName: options.databaseName ?? "syncore",
      persistence,
      ...(wasmUrl ? { wasmUrl } : {}),
      ...(options.locateFile ? { locateFile: options.locateFile } : {})
    }));
  const storageNamespace =
    options.storageNamespace ?? options.databaseName ?? "syncore";
  const storage =
    options.storage ??
    (persistence.storageProtocol === "opfs"
      ? new BrowserFileStorageAdapter(persistence, storageNamespace)
      : new UnavailableBrowserStorageAdapter(
          BROWSER_STORAGE_UNAVAILABLE_REASON
        ));
  const runtimeCapabilities = createBrowserRuntimeCapabilities(
    persistence,
    storage,
    Boolean(options.storage)
  );
  const externalChangeSupport = createWebExternalChangeSupport({
    databaseName: options.databaseName ?? "syncore",
    persistence,
    driver
  });
  const appName = options.appName ?? resolveWebAppName();
  const origin = resolveWebOrigin();
  const sessionLabel = resolveWebSessionLabel();
  const databaseLabel = options.databaseName ?? "syncore";
  const storageScopeId = await resolvePersistedStorageScopeId(
    persistence,
    databaseLabel
  );
  const dataSourceAlias = await resolvePersistedDataSourceAlias(
    persistence,
    databaseLabel
  );
  const storageIdentity = [
    origin ?? "unknown-origin",
    persistence.storageProtocol,
    databaseLabel,
    storageScopeId
  ].join("::");
  const autoDevtools =
    options.devtools === undefined && shouldAutoConnectDevtools()
      ? (() => {
          const sinkOptions: BrowserWebSocketDevtoolsSinkOptions = {
            url: options.devtoolsUrl ?? resolveDefaultDevtoolsUrl(),
            allowRemoteControl:
              options.devtoolsRemoteControl ??
              isTrustedLoopbackWebSocketUrl(
                options.devtoolsUrl ?? resolveDefaultDevtoolsUrl()
              ),
            targetKind: "client",
            storageProtocol: persistence.storageProtocol,
            databaseLabel,
            dataSourceAlias,
            storageIdentity,
            capabilities: createBrowserDevtoolsCapabilities(runtimeCapabilities)
          };
          if (appName) {
            sinkOptions.appName = appName;
          }
          if (origin) {
            sinkOptions.origin = origin;
          }
          if (sessionLabel) {
            sinkOptions.sessionLabel = sessionLabel;
          }
          return createBrowserWebSocketDevtoolsSink(sinkOptions);
        })()
      : undefined;
  const resolvedDevtools =
    options.devtools === false ? undefined : (options.devtools ?? autoDevtools);

  announceBrowserSession({
    enabled: resolvedDevtools !== undefined,
    sessionLabel,
    appName,
    origin,
    devtoolsUrl:
      options.devtools && typeof options.devtools === "object"
        ? undefined
        : (options.devtoolsUrl ?? resolveDefaultDevtoolsUrl())
  });

  const runtime = new SyncoreRuntime({
    schema: options.schema,
    functions: options.functions,
    ...(options.components ? { components: options.components } : {}),
    driver,
    storage,
    externalChangeSignal: externalChangeSupport.signal,
    ...(externalChangeSupport.applier
      ? { externalChangeApplier: externalChangeSupport.applier }
      : {}),
    platform: options.platform ?? "browser",
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    runtimeCapabilities,
    ...(resolvedDevtools ? { devtools: resolvedDevtools } : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {})
  });

  if (isAttachableBrowserDevtoolsSink(resolvedDevtools)) {
    resolvedDevtools.attachRuntime(runtime);
    resolvedDevtools.attachCommandHandler(
      createDevtoolsCommandHandler({
        driver,
        schema: options.schema,
        functions: options.functions,
        admin: runtime.getAdmin()
      })
    );
    resolvedDevtools.attachSubscriptionHost(
      createDevtoolsSubscriptionHost({
        driver,
        schema: options.schema,
        functions: options.functions,
        admin: runtime.getAdmin()
      })
    );
  }

  return runtime;
}

function isAttachableBrowserDevtoolsSink(
  sink: DevtoolsSink | undefined
): sink is BrowserWebSocketDevtoolsSink {
  return (
    !!sink &&
    typeof (sink as BrowserWebSocketDevtoolsSink).acceptsRemoteControl ===
      "function" &&
    (sink as BrowserWebSocketDevtoolsSink).acceptsRemoteControl() &&
    typeof (sink as BrowserWebSocketDevtoolsSink).attachRuntime ===
      "function" &&
    typeof (sink as BrowserWebSocketDevtoolsSink).attachCommandHandler ===
      "function" &&
    typeof (sink as BrowserWebSocketDevtoolsSink).attachSubscriptionHost ===
      "function"
  );
}

/**
 * Build a {@link WebExternalChangeSupport} bundle for a given database and
 * persistence layer.
 *
 * Creates a `BroadcastChannel`-based signal so that all tabs sharing the same
 * `databaseName` are notified when a mutation commits. When `driver` is a
 * `SqlJsDriver` (i.e. an in-memory database), an `applier` is also created so
 * the local database can be updated from the latest on-disk snapshot.
 *
 * Called automatically by `createWebSyncoreRuntime`. Exposed for advanced use
 * cases such as the Expo web adapter.
 */
export function createWebExternalChangeSupport(options: {
  databaseName: string;
  persistence: SyncoreWebPersistence;
  driver: CreateWebRuntimeOptions<SyncoreDataModel>["driver"] | undefined;
}): WebExternalChangeSupport {
  const signal = new BroadcastChannelExternalChangeSignal({
    channelName: createDefaultSyncChannelName(options.databaseName)
  });
  const sqlDriver =
    options.driver instanceof SqlJsDriver ? options.driver : undefined;

  if (!sqlDriver) {
    return { signal };
  }

  return {
    signal,
    applier: new SqlJsExternalChangeApplier({
      databaseName: options.databaseName,
      persistence: options.persistence,
      createDatabase: (bytes) => sqlDriver.createDatabaseFromBytes(bytes),
      replaceDatabase: (database) => {
        sqlDriver.replaceDatabase(database);
      }
    })
  };
}

/**
 * Build a {@link WebExternalChangeSupport} bundle for an Expo app running on
 * the web platform.
 *
 * Behaves identically to {@link createWebExternalChangeSupport} but accepts
 * the same options shape used by `createExpoSyncoreRuntime`, making it easy
 * to share config when bootstrapping an Expo web runtime.
 *
 * Called internally by the Expo platform adapter. Use directly only when
 * constructing the runtime outside of `createExpoSyncoreRuntime`.
 */
export async function createExpoWebExternalChangeSupport(options: {
  databaseName: string;
  locateFile?: (fileName: string) => string;
  wasmUrl?: string;
  persistenceDatabaseName?: string;
  opfsRootDirectoryName?: string;
  persistenceMode?: WebPersistenceMode;
}): Promise<WebExternalChangeSupport> {
  const persistence = await createWebPersistence({
    ...(options.persistenceMode ? { mode: options.persistenceMode } : {}),
    ...(options.persistenceDatabaseName
      ? { indexedDbDatabaseName: options.persistenceDatabaseName }
      : {}),
    opfsRootDirectoryName: options.opfsRootDirectoryName ?? options.databaseName
  });
  const wasmUrl =
    options.wasmUrl ??
    (options.locateFile || !isBrowserLikeRuntime()
      ? undefined
      : await resolveDefaultWebWasmUrl());
  const driver = await SqlJsDriver.create({
    databaseName: options.databaseName,
    persistence,
    ...(wasmUrl ? { wasmUrl } : {}),
    ...(options.locateFile ? { locateFile: options.locateFile } : {})
  });

  return createWebExternalChangeSupport({
    databaseName: options.databaseName,
    persistence,
    driver
  });
}

/**
 * Start a Syncore runtime inside a browser `Worker` and wire it to the
 * worker’s own message endpoint.
 *
 * This is the function you call **inside your worker file** (`syncore.worker.ts`).
 * It creates the full runtime (SQL.js + OPFS + BroadcastChannel) in the worker
 * context and begins listening for messages from the main-thread client.
 *
 * ```ts
 * // syncore.worker.ts
 * import { createWebWorkerRuntime } from "syncorejs/browser";
 * import schema from "./syncore/schema";
 * import { functions } from "./syncore/_generated/functions";
 *
 * void createWebWorkerRuntime({
 *   schema,
 *   functions,
 *   endpoint: self as unknown as SyncoreWorkerMessageEndpoint,
 * });
 * ```
 *
 * On the main thread, connect with `createManagedWebWorkerClient()` or
 * `SyncoreNextProvider` (Next.js).
 */
export function createWebWorkerRuntime<TSchema extends WebSyncoreSchema>(
  options: CreateWebWorkerRuntimeOptions<TSchema>
) {
  return attachWebWorkerRuntime({
    endpoint: options.endpoint,
    createRuntime: () =>
      createWebSyncoreRuntime({
        ...options,
        platform: options.platform ?? "browser-worker"
      })
  });
}

/**
 * Alias of {@link createWebWorkerRuntime} for the `syncorejs/browser` surface.
 * @see createWebWorkerRuntime
 */
export function createBrowserWorkerRuntime(
  options: CreateBrowserWorkerRuntimeOptions
) {
  return createWebWorkerRuntime(options);
}

/**
 * Create a same-process Syncore client from a started browser runtime.
 *
 * Use this when the runtime lives in the same context as the client (e.g.
 * main-thread runtime in an Electron renderer or a test harness). For
 * worker-based setups use `createManagedWebWorkerClient()` instead, which
 * communicates with the worker over `postMessage`.
 *
 * ```ts
 * const runtime = await createWebSyncoreRuntime({ schema, functions });
 * await runtime.start();
 * const client = createWebSyncoreClient(runtime);
 * ```
 */
export function createWebSyncoreClient<TSchema extends WebSyncoreSchema>(
  runtime: SyncoreRuntime<TSchema>
) {
  return runtime.createClient();
}

/**
 * Alias of {@link createWebSyncoreRuntime} for the `syncorejs/browser` surface.
 * @see createWebSyncoreRuntime
 */
export function createBrowserSyncoreRuntime<
  TSchema extends BrowserSyncoreSchema
>(options: CreateBrowserRuntimeOptions<TSchema>) {
  return createWebSyncoreRuntime(options);
}

/**
 * Alias of {@link createWebSyncoreClient} for the `syncorejs/browser` surface.
 * @see createWebSyncoreClient
 */
export function createBrowserSyncoreClient<
  TSchema extends BrowserSyncoreSchema
>(runtime: SyncoreRuntime<TSchema>) {
  return createWebSyncoreClient(runtime);
}

/**
 * Configuration options for {@link createBrowserWebSocketDevtoolsSink}.
 *
 * All fields except `url` are optional — `createWebSyncoreRuntime` fills them
 * in automatically from the runtime’s own metadata.
 */
export interface BrowserWebSocketDevtoolsSinkOptions {
  /** WebSocket URL of the Syncore devtools server, e.g. `"ws://127.0.0.1:4311"`. */
  url: string;
  /**
   * How long to wait before attempting a reconnect after the WebSocket closes,
   * in milliseconds. Defaults to `1200`.
   */
  reconnectDelayMs?: number;
  /** Human-readable app name shown in the devtools dashboard header. */
  appName?: string;
  /** Origin label (e.g. `window.location.origin`) shown in the devtools session list. */
  origin?: string;
  /** Session label auto-generated from the tab’s URL path; helps distinguish multiple open tabs. */
  sessionLabel?: string;
  /** Kind of this devtools participant. Always `"client"` for browser runtimes. */
  targetKind?: "client";
  /** Persistence protocol tag reported to devtools (e.g. `"opfs"`, `"indexeddb"`). */
  storageProtocol?: string;
  /** Logical database name used to group sessions in the devtools UI. */
  databaseLabel?: string;
  /** Stable alias for the data source, used by devtools for cross-session continuity. */
  dataSourceAlias?: string;
  /**
   * Opaque identity string that uniquely identifies this database across origin
   * + persistence protocol + name, used by devtools for data-source tracking.
   */
  storageIdentity?: string;
  /** Capability flags advertising what devtools features this runtime supports. */
  capabilities?: SyncoreDevtoolsCapabilities;
  /**
   * Allow this WebSocket endpoint to send privileged commands and
   * subscriptions. Omit to keep explicitly-created sinks event-only.
   */
  allowRemoteControl?: boolean;
}

async function resolveDefaultWebWasmUrl(): Promise<string | undefined> {
  try {
    const module = await import("./web-sqljs-wasm.js");
    return module.resolveDefaultWebSqlJsWasmUrl();
  } catch (error) {
    if (!isBrowserLikeRuntime()) {
      return undefined;
    }
    throw new Error(
      "Syncore could not resolve the default sql.js WebAssembly asset. " +
        "Pass wasmUrl or locateFile to createWebSyncoreRuntime/createBrowserWorkerRuntime for this bundler.",
      { cause: error }
    );
  }
}

function isBrowserLikeRuntime(): boolean {
  const scope = globalThis as typeof globalThis & {
    WorkerGlobalScope?: unknown;
  };
  return typeof window !== "undefined" || scope.WorkerGlobalScope !== undefined;
}

/**
 * A DevtoolsSink that forwards runtime events to the Syncore devtools
 * dashboard over a persistent WebSocket connection with auto-reconnect.
 *
 * Returned by {@link createBrowserWebSocketDevtoolsSink}. You typically do not
 * use this interface directly — `createWebSyncoreRuntime` creates and manages
 * the sink automatically when running in development.
 */
export interface BrowserWebSocketDevtoolsSink extends DevtoolsSink {
  /** Whether this sink may receive privileged command/subscription handlers. */
  acceptsRemoteControl(): boolean;
  /** Attach the runtime so the sink can pull metadata for devtools messages. */
  attachRuntime(runtime: SyncoreRuntime<WebSyncoreSchema>): void;
  /** Attach the command handler that processes devtools RPC commands. */
  attachCommandHandler(handler: DevtoolsCommandHandler): void;
  /** Attach the subscription host for live query streaming. */
  attachSubscriptionHost(host: DevtoolsSubscriptionHost): void;
  /** Close the WebSocket and stop reconnecting. Call on runtime shutdown. */
  dispose(): void;
}

/**
 * Create a WebSocket-based devtools sink that connects to the Syncore devtools
 * server and forwards runtime events in real time.
 *
 * The sink auto-reconnects if the connection drops (e.g. while the devtools
 * dashboard is restarting) and buffers events that arrive before the socket is
 * open.
 *
 * In most cases you do not need to call this directly — `createWebSyncoreRuntime`
 * creates and attaches the sink automatically when `devtools` is omitted and the
 * page is served from a local/private hostname.
 *
 * ```ts
 * const sink = createBrowserWebSocketDevtoolsSink({
 *   url: "ws://127.0.0.1:4311",
 *   appName: "My App",
 * });
 * const runtime = await createWebSyncoreRuntime({ schema, functions, devtools: sink });
 * ```
 */
export function createBrowserWebSocketDevtoolsSink(
  options: BrowserWebSocketDevtoolsSinkOptions
): BrowserWebSocketDevtoolsSink {
  let socket: WebSocket | undefined;
  let disposed = false;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let getSummary: (() => SyncoreRuntimeSummary) | undefined;
  let onCommand: DevtoolsCommandHandler | undefined;
  let subscriptionHost: DevtoolsSubscriptionHost | undefined;
  const pendingMessages: SyncoreDevtoolsMessage[] = [];
  const remoteControlAllowed = options.allowRemoteControl === true;
  let latestHello:
    | {
        runtimeId: string;
        platform: string;
      }
    | undefined;

  const connect = () => {
    if (disposed || typeof WebSocket === "undefined") {
      return;
    }
    socket = new WebSocket(options.url);
    socket.onopen = () => {
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
          ...(options.storageProtocol
            ? { storageProtocol: options.storageProtocol }
            : {}),
          ...(options.databaseLabel
            ? { databaseLabel: options.databaseLabel }
            : {}),
          ...(options.dataSourceAlias
            ? { dataSourceAlias: options.dataSourceAlias }
            : {}),
          ...(options.storageIdentity
            ? { storageIdentity: options.storageIdentity }
            : {}),
          capabilities:
            options.capabilities ?? createBrowserDevtoolsCapabilities()
        });
      }
      flushPendingMessages();
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      const message = JSON.parse(event.data) as
        | SyncoreDevtoolsMessage
        | SyncoreDevtoolsClientMessage;
      if (message.type === "ping") {
        send({ type: "pong" });
      } else if (
        message.type === "command" &&
        onCommand &&
        message.targetRuntimeId ===
          (latestHello?.runtimeId ?? getSummary?.().runtimeId)
      ) {
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
      } else if (
        message.type === "subscribe" &&
        subscriptionHost &&
        message.targetRuntimeId ===
          (latestHello?.runtimeId ?? getSummary?.().runtimeId)
      ) {
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
      } else if (
        message.type === "unsubscribe" &&
        message.targetRuntimeId ===
          (latestHello?.runtimeId ?? getSummary?.().runtimeId)
      ) {
        subscriptionHost?.unsubscribe(message.subscriptionId);
      }
    };
    socket.onclose = scheduleReconnect;
    socket.onerror = () => {
      socket?.close();
    };
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
      if (nextMessage) {
        sendNow(nextMessage);
      }
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
    acceptsRemoteControl() {
      return remoteControlAllowed;
    },
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
          ...(options.storageProtocol
            ? { storageProtocol: options.storageProtocol }
            : {}),
          ...(options.databaseLabel
            ? { databaseLabel: options.databaseLabel }
            : {}),
          ...(options.dataSourceAlias
            ? { dataSourceAlias: options.dataSourceAlias }
            : {}),
          ...(options.storageIdentity
            ? { storageIdentity: options.storageIdentity }
            : {}),
          capabilities:
            options.capabilities ?? createBrowserDevtoolsCapabilities()
        });
      }
      send({ type: "event", event });
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
}

function withRuntimeSummaryMeta(
  summary: SyncoreRuntimeSummary,
  options: BrowserWebSocketDevtoolsSinkOptions
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
    ...(options.dataSourceAlias
      ? { dataSourceAlias: options.dataSourceAlias }
      : {}),
    ...(options.storageIdentity
      ? { storageIdentity: options.storageIdentity }
      : {}),
    capabilities: options.capabilities ?? createBrowserDevtoolsCapabilities()
  };
}

function createBrowserRuntimeCapabilities(
  persistence: SyncoreWebPersistence,
  storage: SyncoreStorageAdapter,
  hasExplicitStorage: boolean
): SyncoreRuntimeCapabilities {
  if (!hasExplicitStorage && persistence.storageProtocol !== "opfs") {
    return {
      storage: {
        available: false,
        reason: BROWSER_STORAGE_UNAVAILABLE_REASON,
        protocol: persistence.storageProtocol,
        supportsRange: false
      }
    };
  }
  return {
    storage: {
      available: true,
      protocol: hasExplicitStorage ? "custom" : persistence.storageProtocol,
      ...(storage.supportsRange
        ? { supportsRange: storage.supportsRange() !== false }
        : {})
    }
  };
}

function createBrowserDevtoolsCapabilities(
  runtimeCapabilities?: SyncoreRuntimeCapabilities
): SyncoreDevtoolsCapabilities {
  const storageCapability = runtimeCapabilities?.storage;
  const storageAvailable = storageCapability?.available !== false;
  return {
    sql: {
      read: false,
      write: false,
      live: false,
      reason: "SQL Console is not available for browser runtimes."
    },
    data: {
      browse: true,
      mutate: true,
      importExport: true
    },
    storage: {
      browse: storageAvailable,
      download: storageAvailable,
      readRange: storageCapability?.supportsRange === true,
      delete: storageAvailable,
      maxPreviewBytes: 80_000,
      ...(!storageAvailable && storageCapability?.reason
        ? { reason: storageCapability.reason }
        : {})
    },
    scheduler: {
      read: true,
      edit: true
    }
  };
}

function shouldAutoConnectDevtools(): boolean {
  const hostname = resolveWebHostname();
  if (!hostname) {
    return false;
  }
  return (
    hostname === "localhost" ||
    isPrivateNetworkHostname(hostname) ||
    hostname.endsWith(".local")
  );
}

function resolveDefaultDevtoolsUrl(): string {
  return "ws://127.0.0.1:4311";
}

function isTrustedLoopbackWebSocketUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function resolveLocationString(
  key: "href" | "origin" | "hostname"
): string | undefined {
  try {
    const value = globalThis.location?.[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function resolveGlobalOrigin(): string | undefined {
  try {
    const value = (globalThis as { origin?: unknown }).origin;
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseUrlCandidate(candidate: string | undefined): URL | undefined {
  if (!candidate || candidate === "null") {
    return undefined;
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "blob:" && parsed.pathname.length > 0) {
      try {
        return new URL(parsed.pathname);
      } catch {
        return parsed;
      }
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function resolveWebHostname(): string | undefined {
  const directHostname = resolveLocationString("hostname");
  if (directHostname) {
    return directHostname;
  }
  return (
    parseUrlCandidate(resolveLocationString("href"))?.hostname ||
    parseUrlCandidate(resolveLocationString("origin"))?.hostname ||
    parseUrlCandidate(resolveGlobalOrigin())?.hostname ||
    undefined
  );
}

function isPrivateNetworkHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "::1") {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (!match) {
    return false;
  }
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }
  const first = octets[0];
  const second = octets[1];
  if (first === undefined || second === undefined) {
    return false;
  }
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function resolveWebOrigin(): string | undefined {
  const directOrigin = resolveLocationString("origin");
  if (directOrigin && directOrigin !== "null") {
    return directOrigin;
  }
  const parsedOrigin =
    parseUrlCandidate(resolveLocationString("href"))?.origin ||
    parseUrlCandidate(resolveGlobalOrigin())?.origin;
  return parsedOrigin && parsedOrigin !== "null" ? parsedOrigin : undefined;
}

function resolveWebAppName(): string | undefined {
  try {
    return resolveWebHostname() ?? globalThis.document?.title ?? undefined;
  } catch {
    return undefined;
  }
}

function resolveWebSessionLabel(): string | undefined {
  try {
    if (typeof navigator === "undefined") {
      return undefined;
    }

    // Generate or retrieve a persistent unique name for this browser instance.
    // This makes it much easier to identify which browser tab/window you're
    // looking at in the devtools dashboard.
    const STORAGE_KEY = "syncore-session-name";
    let uniqueName: string | null = null;

    try {
      uniqueName = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      /* localStorage may not be available */
    }

    if (!uniqueName) {
      uniqueName = generateUniqueSessionName();

      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, uniqueName);
      } catch {
        /* ignore storage errors */
      }
    }

    const browser = resolveBrowserName(navigator);

    return `${uniqueName} (${browser})`;
  } catch {
    return undefined;
  }
}

function resolveBrowserName(
  nav: Navigator & {
    userAgentData?: {
      brands?: Array<{
        brand: string;
      }>;
    };
  }
): string {
  const brands = nav.userAgentData?.brands?.map((entry) => entry.brand) ?? [];

  if (brands.some((brand) => /microsoft edge/i.test(brand))) {
    return "Edge";
  }
  if (brands.some((brand) => /firefox/i.test(brand))) {
    return "Firefox";
  }
  if (brands.some((brand) => /opera/i.test(brand))) {
    return "Opera";
  }
  if (brands.some((brand) => /chrome|chromium/i.test(brand))) {
    return "Chrome";
  }
  if (brands.some((brand) => /safari/i.test(brand))) {
    return "Safari";
  }

  const userAgent = nav.userAgent;
  if (/Firefox\//i.test(userAgent)) {
    return "Firefox";
  }
  if (/Edg\//i.test(userAgent)) {
    return "Edge";
  }
  if (/OPR\/|Opera/i.test(userAgent)) {
    return "Opera";
  }
  if (/Chrome\/|CriOS\//i.test(userAgent)) {
    return "Chrome";
  }
  if (/Safari\//i.test(userAgent)) {
    return "Safari";
  }
  return "Browser";
}

async function resolvePersistedStorageScopeId(
  persistence: SyncoreWebPersistence,
  databaseLabel: string
): Promise<string> {
  const id = `${STORAGE_SCOPE_ID_PREFIX}:${databaseLabel}`;
  const existing = await persistence.getFile(DEVTOOLS_META_NAMESPACE, id);

  if (existing) {
    const value = new TextDecoder().decode(existing.bytes).trim();
    if (value.length > 0) {
      return value;
    }
  }

  const nextValue = generateId();
  await persistence.putFile(
    DEVTOOLS_META_NAMESPACE,
    id,
    new TextEncoder().encode(nextValue),
    "text/plain"
  );
  return nextValue;
}

async function resolvePersistedDataSourceAlias(
  persistence: SyncoreWebPersistence,
  databaseLabel: string
): Promise<string> {
  const id = `${DATA_SOURCE_ALIAS_PREFIX}:${databaseLabel}`;
  const existing = await persistence.getFile(DEVTOOLS_META_NAMESPACE, id);

  if (existing) {
    const value = new TextDecoder().decode(existing.bytes).trim();
    if (value.length > 0) {
      return value;
    }
  }

  const nextValue = generateUniqueSessionName();
  await persistence.putFile(
    DEVTOOLS_META_NAMESPACE,
    id,
    new TextEncoder().encode(nextValue),
    "text/plain"
  );
  return nextValue;
}

function announceBrowserSession(options: {
  enabled: boolean;
  sessionLabel?: string | undefined;
  appName?: string | undefined;
  origin?: string | undefined;
  devtoolsUrl?: string | undefined;
}): void {
  if (!options.enabled || !options.sessionLabel) {
    return;
  }

  const announcedSessions = getAnnouncedBrowserSessions();
  if (announcedSessions.has(options.sessionLabel)) {
    return;
  }
  announcedSessions.add(options.sessionLabel);

  try {
    const details = [
      options.appName ? `app=${options.appName}` : undefined,
      options.origin ? `origin=${options.origin}` : undefined,
      options.devtoolsUrl ? `devtools=${options.devtoolsUrl}` : undefined
    ].filter((value): value is string => value !== undefined);

    console.info(
      `[syncore] Browser session: ${options.sessionLabel}${details.length > 0 ? ` (${details.join(", ")})` : ""}`
    );
  } catch {
    /* ignore console failures */
  }
}

function getAnnouncedBrowserSessions(): Set<string> {
  const key = "__syncoreAnnouncedBrowserSessions";
  const scope = globalThis as typeof globalThis & {
    [key]?: Set<string>;
  };
  if (!scope[key]) {
    scope[key] = new Set<string>();
  }
  return scope[key];
}

/* ------------------------------------------------------------------ */
/*  Unique session name generator                                      */
/* ------------------------------------------------------------------ */

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
  "Monkey",
  "Phoenix",
  "Tiger",
  "Dragon",
  "Falcon",
  "Panther",
  "Wolf",
  "Eagle",
  "Cobra",
  "Shark",
  "Raven",
  "Fox",
  "Lynx",
  "Hawk",
  "Bear",
  "Jaguar",
  "Viper",
  "Owl",
  "Stallion",
  "Dolphin",
  "Developer",
  "Hacker",
  "Wizard",
  "Ninja",
  "Pilot",
  "Pioneer",
  "Voyager",
  "Explorer",
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

const BROWSER_STORAGE_UNAVAILABLE_REASON =
  "Browser file storage requires OPFS. IndexedDB is used for data only.";

function generateUniqueSessionName(): string {
  const adj =
    SESSION_ADJECTIVES[Math.floor(Math.random() * SESSION_ADJECTIVES.length)]!;
  const noun = SESSION_NOUNS[Math.floor(Math.random() * SESSION_NOUNS.length)]!;
  return `${adj} ${noun}`;
}

/**
 * Browser file/blob storage adapter backed by `SyncoreWebPersistence`.
 *
 * Stores binary blobs (images, documents, etc.) in OPFS alongside the SQLite
 * database. Pass an instance to
 * `CreateWebRuntimeOptions.storage` to enable Syncore's Storage API
 * (`ctx.storage.put`, `ctx.storage.get`, etc.) in browser functions.
 *
 * ```ts
 * const runtime = await createWebSyncoreRuntime({
 *   schema,
 *   functions,
 *   storage: new BrowserFileStorageAdapter(persistence, "files"),
 * });
 * ```
 */
export class BrowserFileStorageAdapter implements SyncoreStorageAdapter {
  constructor(
    private readonly persistence: SyncoreWebPersistence,
    private readonly namespace: string
  ) {
    if (persistence.storageProtocol !== "opfs") {
      throw new Error(BROWSER_STORAGE_UNAVAILABLE_REASON);
    }
  }

  async put(id: string, input: StorageWriteInput): Promise<StorageObject> {
    const bytes = normalizeBinary(input.data);
    await this.persistence.putFile(
      this.namespace,
      id,
      bytes,
      input.contentType ?? null
    );
    return {
      id,
      path: `${this.persistence.storageProtocol}://${this.namespace}/${id}`,
      size: bytes.byteLength,
      contentType: input.contentType ?? null
    };
  }

  async get(id: string): Promise<StorageObject | null> {
    const file = await this.persistence.getFile(this.namespace, id);
    if (!file) {
      return null;
    }
    return {
      id,
      path: `${this.persistence.storageProtocol}://${this.namespace}/${id}`,
      size: file.size,
      contentType: file.contentType
    };
  }

  async read(id: string): Promise<Uint8Array | null> {
    const file = await this.persistence.getFile(this.namespace, id);
    return file?.bytes ?? null;
  }

  supportsRange(): boolean {
    return Boolean(this.persistence.getFileRange);
  }

  async readRange(
    id: string,
    offset: number,
    length: number
  ): Promise<Uint8Array | null> {
    if (!this.persistence.getFileRange) {
      return null;
    }
    const file = await this.persistence.getFileRange(
      this.namespace,
      id,
      offset,
      length
    );
    return file?.bytes ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.persistence.deleteFile(this.namespace, id);
  }

  async list(): Promise<StorageObject[]> {
    const files = this.persistence.listFileMetadata
      ? await this.persistence.listFileMetadata(this.namespace)
      : await this.persistence.listFiles(this.namespace);
    return files.map((file) => ({
      id: file.id,
      path: `${this.persistence.storageProtocol}://${this.namespace}/${file.id}`,
      size: file.size,
      contentType: file.contentType
    }));
  }
}

class UnavailableBrowserStorageAdapter implements SyncoreStorageAdapter {
  constructor(private readonly reason: string) {}

  async put(): Promise<StorageObject> {
    throw new Error(this.reason);
  }

  async get(): Promise<StorageObject | null> {
    throw new Error(this.reason);
  }

  async read(): Promise<Uint8Array | null> {
    throw new Error(this.reason);
  }

  supportsRange(): boolean {
    return false;
  }

  async delete(): Promise<void> {
    throw new Error(this.reason);
  }
}

function normalizeBinary(data: StorageWriteInput["data"]): Uint8Array {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  return new Uint8Array(data);
}
