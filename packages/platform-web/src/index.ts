import {
  type AnySyncoreSchema,
  createDevtoolsRequestHandler,
  type DevtoolsRequestHandler,
  type DevtoolsSink,
  SyncoreRuntime,
  type SchedulerOptions,
  type SyncoreCapabilities,
  type SyncoreExperimentalPlugin,
  type SyncoreRuntimeOptions,
  type SyncoreStorageAdapter,
  type StorageObject,
  type StorageWriteInput
} from "@syncore/core";
import {
  type SyncoreDevtoolsMessage,
  type SyncoreDevtoolsRequest,
  type SyncoreDevtoolsSnapshot
} from "@syncore/devtools-protocol";
import {
  createWebPersistence,
  type SyncoreWebPersistence,
  type WebPersistenceMode
} from "./persistence.js";
import { SqlJsDriver } from "./sqljs.js";
import {
  attachWebWorkerRuntime,
  type SyncoreWorkerMessageEndpoint
} from "./worker.js";
export * from "./worker.js";
export * from "./persistence.js";
export * from "./indexeddb.js";
export * from "./opfs.js";

export type WebSyncoreSchema = AnySyncoreSchema;
export type BrowserSyncoreSchema = WebSyncoreSchema;

/**
 * Options for constructing a browser Syncore runtime.
 *
 * Use this when you want to host the full runtime in a browser tab or worker.
 */
export interface CreateWebRuntimeOptions {
  /** The schema for the local Syncore app. */
  schema: WebSyncoreSchema;

  /** The generated function registry for the local Syncore app. */
  functions: SyncoreRuntimeOptions<WebSyncoreSchema>["functions"];

  /** Optional platform capabilities exposed to function handlers. */
  capabilities?: SyncoreCapabilities;

  /** Optional custom SQL driver. Defaults to SQL.js with local persistence. */
  driver?: SyncoreRuntimeOptions<WebSyncoreSchema>["driver"];

  /** Optional custom file/blob storage adapter. */
  storage?: SyncoreStorageAdapter;

  /** Optional experimental plugins for runtime hooks. */
  experimentalPlugins?: Array<SyncoreExperimentalPlugin<WebSyncoreSchema>>;

  /** Optional explicit persistence implementation. */
  persistence?: SyncoreWebPersistence;

  /** Which browser persistence mode to use when Syncore creates one for you. */
  persistenceMode?: WebPersistenceMode;

  /** Logical database name for SQL.js and local storage namespaces. */
  databaseName?: string;

  /** Optional IndexedDB database name for persistence metadata. */
  persistenceDatabaseName?: string;

  /** Optional OPFS directory name for persistent files. */
  opfsRootDirectoryName?: string;

  /** Optional namespace for file/blob storage. */
  storageNamespace?: string;

  /** Optional direct wasm URL for SQL.js. */
  wasmUrl?: string;

  /** Optional callback for resolving SQL.js support files. */
  locateFile?: (fileName: string) => string;

  /** Optional runtime platform label shown in devtools snapshots. */
  platform?: string;

  /** Optional devtools sink used during development. */
  devtools?: DevtoolsSink | false;

  /** Optional scheduler configuration for jobs and recurring work. */
  scheduler?: SchedulerOptions;
}

/**
 * Options for hosting a Syncore runtime inside a browser Worker.
 */
export interface CreateWebWorkerRuntimeOptions extends CreateWebRuntimeOptions {
  /** The message endpoint exposed by the current worker global. */
  endpoint: SyncoreWorkerMessageEndpoint;
}

/**
 * Options for constructing a browser Syncore runtime.
 */
export type CreateBrowserRuntimeOptions = CreateWebRuntimeOptions;

/**
 * Options for hosting a Syncore runtime inside a browser Worker.
 */
export type CreateBrowserWorkerRuntimeOptions = CreateWebWorkerRuntimeOptions;

/**
 * Create a full Syncore runtime directly in the browser.
 *
 * Most React apps should use a worker runtime instead so queries and SQLite work
 * stay off the main thread.
 */
export async function createWebSyncoreRuntime(
  options: CreateWebRuntimeOptions
): Promise<SyncoreRuntime<WebSyncoreSchema>> {
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
  const driver =
    options.driver ??
    (await SqlJsDriver.create({
      databaseName: options.databaseName ?? "syncore",
      persistence,
      ...(options.wasmUrl ? { wasmUrl: options.wasmUrl } : {}),
      ...(options.locateFile ? { locateFile: options.locateFile } : {})
    }));
  const storage =
    options.storage ??
    new BrowserFileStorageAdapter(
      persistence,
      options.storageNamespace ?? options.databaseName ?? "syncore"
    );
  const appName = resolveWebAppName();
  const origin = resolveWebOrigin();
  const sessionLabel = resolveWebSessionLabel();
  const autoDevtools =
    options.devtools === undefined && shouldAutoConnectDevtools()
      ? (() => {
          const sinkOptions: BrowserWebSocketDevtoolsSinkOptions = {
            url: resolveDefaultDevtoolsUrl()
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

  const runtime = new SyncoreRuntime({
    schema: options.schema,
    functions: options.functions,
    driver,
    storage,
    platform: options.platform ?? "browser",
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    ...(resolvedDevtools ? { devtools: resolvedDevtools } : {}),
    ...(options.experimentalPlugins
      ? { experimentalPlugins: options.experimentalPlugins }
      : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {})
  });

  if (autoDevtools) {
    autoDevtools.attachRuntime(() => runtime.getDevtoolsSnapshot());
    autoDevtools.attachRequestHandler(
      createDevtoolsRequestHandler({
        driver,
        schema: options.schema,
        functions: options.functions,
        runtime
      })
    );
  }

  return runtime;
}

/**
 * Attach a Syncore runtime to a browser Worker endpoint.
 */
export function createWebWorkerRuntime(options: CreateWebWorkerRuntimeOptions) {
  return attachWebWorkerRuntime({
    endpoint: options.endpoint,
    createRuntime: () => createWebSyncoreRuntime(options)
  });
}

/**
 * Attach a Syncore runtime to a browser Worker endpoint.
 */
export function createBrowserWorkerRuntime(
  options: CreateBrowserWorkerRuntimeOptions
) {
  return createWebWorkerRuntime(options);
}

/**
 * Create a client directly from a browser Syncore runtime.
 */
export function createWebSyncoreClient(
  runtime: SyncoreRuntime<WebSyncoreSchema>
) {
  return runtime.createClient();
}

/**
 * Create a full Syncore runtime directly in the browser.
 */
export function createBrowserSyncoreRuntime(
  options: CreateBrowserRuntimeOptions
) {
  return createWebSyncoreRuntime(options);
}

/**
 * Create a client directly from a browser Syncore runtime.
 */
export function createBrowserSyncoreClient(
  runtime: SyncoreRuntime<BrowserSyncoreSchema>
) {
  return createWebSyncoreClient(runtime);
}

export interface BrowserWebSocketDevtoolsSinkOptions {
  url: string;
  reconnectDelayMs?: number;
  appName?: string;
  origin?: string;
  sessionLabel?: string;
}

export interface BrowserWebSocketDevtoolsSink extends DevtoolsSink {
  attachRuntime(getSnapshot: () => SyncoreDevtoolsSnapshot): void;
  attachRequestHandler(handler: DevtoolsRequestHandler): void;
  dispose(): void;
}

export function createBrowserWebSocketDevtoolsSink(
  options: BrowserWebSocketDevtoolsSinkOptions
): BrowserWebSocketDevtoolsSink {
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
    if (disposed || typeof WebSocket === "undefined") {
      return;
    }
    socket = new WebSocket(options.url);
    socket.onopen = () => {
      if (latestHello) {
        sendNow({
          type: "hello",
          runtimeId: latestHello.runtimeId,
          platform: latestHello.platform,
          ...(options.appName ? { appName: options.appName } : {}),
          ...(options.origin ? { origin: options.origin } : {}),
          ...(options.sessionLabel
            ? { sessionLabel: options.sessionLabel }
            : {})
        });
      }
      if (getSnapshot) {
        sendNow({
          type: "snapshot",
          snapshot: withSnapshotMeta(getSnapshot(), options)
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
        | SyncoreDevtoolsRequest;
      if (message.type === "ping") {
        send({ type: "pong" });
      } else if (message.type === "request" && onRequest) {
        onRequest(message.payload)
          .then((responsePayload) => {
            const runtimeId =
              latestHello?.runtimeId ?? getSnapshot?.().runtimeId;
            if (!runtimeId) {
              return;
            }
            send({
              type: "response",
              requestId: message.requestId,
              runtimeId,
              payload: responsePayload
            });
          })
          .catch((err) => {
            const runtimeId =
              latestHello?.runtimeId ?? getSnapshot?.().runtimeId;
            if (!runtimeId) {
              return;
            }
            send({
              type: "response",
              requestId: message.requestId,
              runtimeId,
              payload: {
                kind: "error",
                message: err instanceof Error ? err.message : "Unknown error"
              }
            });
          });
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
            : {})
        });
      }
      send({ type: "event", event });
      if (getSnapshot) {
        send({
          type: "snapshot",
          snapshot: withSnapshotMeta(getSnapshot(), options)
        });
      }
    },
    attachRuntime(snapshotGetter) {
      getSnapshot = snapshotGetter;
      if (socket?.readyState === WebSocket.OPEN) {
        send({
          type: "snapshot",
          snapshot: withSnapshotMeta(getSnapshot(), options)
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

function withSnapshotMeta(
  snapshot: SyncoreDevtoolsSnapshot,
  options: BrowserWebSocketDevtoolsSinkOptions
): SyncoreDevtoolsSnapshot {
  return {
    ...snapshot,
    ...(options.appName ? { appName: options.appName } : {}),
    ...(options.origin ? { origin: options.origin } : {}),
    ...(options.sessionLabel ? { sessionLabel: options.sessionLabel } : {})
  };
}

function shouldAutoConnectDevtools(): boolean {
  if (typeof globalThis === "undefined") {
    return false;
  }
  try {
    return globalThis.location?.hostname === "localhost" ||
      globalThis.location?.hostname === "127.0.0.1"
      ? true
      : Boolean(globalThis.location?.hostname?.endsWith?.(".local"));
  } catch {
    return false;
  }
}

function resolveDefaultDevtoolsUrl(): string {
  return "ws://127.0.0.1:4311";
}

function resolveWebOrigin(): string | undefined {
  try {
    return globalThis.location?.origin;
  } catch {
    return undefined;
  }
}

function resolveWebAppName(): string | undefined {
  try {
    return (
      globalThis.location?.hostname ?? globalThis.document?.title ?? undefined
    );
  } catch {
    return undefined;
  }
}

function resolveWebSessionLabel(): string | undefined {
  try {
    if (typeof navigator === "undefined") {
      return undefined;
    }
    return navigator.userAgent.includes("Firefox")
      ? "Firefox"
      : navigator.userAgent.includes("Chrome")
        ? "Chrome"
        : navigator.userAgent.includes("Safari")
          ? "Safari"
          : navigator.userAgent;
  } catch {
    return undefined;
  }
}

/**
 * Browser file/blob storage built on top of Syncore web persistence.
 */
export class BrowserFileStorageAdapter implements SyncoreStorageAdapter {
  constructor(
    private readonly persistence: SyncoreWebPersistence,
    private readonly namespace: string
  ) {}

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

  async delete(id: string): Promise<void> {
    await this.persistence.deleteFile(this.namespace, id);
  }

  async list(): Promise<StorageObject[]> {
    const files = await this.persistence.listFiles(this.namespace);
    return files.map((file) => ({
      id: file.id,
      path: `${this.persistence.storageProtocol}://${this.namespace}/${file.id}`,
      size: file.size,
      contentType: file.contentType
    }));
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
