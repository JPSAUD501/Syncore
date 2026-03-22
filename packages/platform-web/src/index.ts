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

export type WebSyncoreSchema<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> = TSchema;
export type BrowserSyncoreSchema<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> = WebSyncoreSchema<TSchema>;

const DEVTOOLS_META_NAMESPACE = "__syncore_devtools_meta__";
const STORAGE_SCOPE_ID_PREFIX = "storage-scope";

/**
 * Options for constructing a browser Syncore runtime.
 *
 * Use this when you want to host the full runtime in a browser tab or worker.
 */
export interface CreateWebRuntimeOptions<
  TSchema extends WebSyncoreSchema = WebSyncoreSchema
> {
  /** The schema for the local Syncore app. */
  schema: TSchema;

  /** The generated function registry for the local Syncore app. */
  functions: SyncoreRuntimeOptions<TSchema>["functions"];

  /** Optional resolved installed components for the local Syncore app. */
  components?: SyncoreRuntimeOptions<TSchema>["components"];

  /** Optional platform capabilities exposed to function handlers. */
  capabilities?: SyncoreCapabilities;

  /** Optional custom SQL driver. Defaults to SQL.js with local persistence. */
  driver?: SyncoreRuntimeOptions<TSchema>["driver"];

  /** Optional custom file/blob storage adapter. */
  storage?: SyncoreStorageAdapter;

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
export interface CreateWebWorkerRuntimeOptions<
  TSchema extends WebSyncoreSchema = WebSyncoreSchema
> extends CreateWebRuntimeOptions<TSchema> {
  /** The message endpoint exposed by the current worker global. */
  endpoint: SyncoreWorkerMessageEndpoint;
}

/**
 * Options for constructing a browser Syncore runtime.
 */
export type CreateBrowserRuntimeOptions<
  TSchema extends BrowserSyncoreSchema = BrowserSyncoreSchema
> = CreateWebRuntimeOptions<TSchema>;

/**
 * Options for hosting a Syncore runtime inside a browser Worker.
 */
export type CreateBrowserWorkerRuntimeOptions<
  TSchema extends BrowserSyncoreSchema = BrowserSyncoreSchema
> = CreateWebWorkerRuntimeOptions<TSchema>;

export interface WebExternalChangeSupport {
  signal: BroadcastChannelExternalChangeSignal;
  applier?: SqlJsExternalChangeApplier;
}

/**
 * Create a full Syncore runtime directly in the browser.
 *
 * Most React apps should use a worker runtime instead so queries and SQLite work
 * stay off the main thread.
 */
export async function createWebSyncoreRuntime<
  TSchema extends WebSyncoreSchema
>(
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
  const externalChangeSupport = createWebExternalChangeSupport({
    databaseName: options.databaseName ?? "syncore",
    persistence,
    driver
  });
  const appName = resolveWebAppName();
  const origin = resolveWebOrigin();
  const sessionLabel = resolveWebSessionLabel();
  const databaseLabel = options.databaseName ?? "syncore";
  const storageScopeId = await resolvePersistedStorageScopeId(
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
            url: resolveDefaultDevtoolsUrl(),
            targetKind: "client",
            storageProtocol: persistence.storageProtocol,
            databaseLabel,
            storageIdentity
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
        : resolveDefaultDevtoolsUrl()
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
    ...(resolvedDevtools ? { devtools: resolvedDevtools } : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {})
  });

  if (autoDevtools) {
    autoDevtools.attachRuntime(runtime);
    autoDevtools.attachCommandHandler(
      createDevtoolsCommandHandler({
        driver,
        schema: options.schema,
        functions: options.functions,
        admin: runtime.getAdmin()
      })
    );
    autoDevtools.attachSubscriptionHost(
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
  const driver = await SqlJsDriver.create({
    databaseName: options.databaseName,
    persistence,
    ...(options.wasmUrl ? { wasmUrl: options.wasmUrl } : {}),
    ...(options.locateFile ? { locateFile: options.locateFile } : {})
  });

  return createWebExternalChangeSupport({
    databaseName: options.databaseName,
    persistence,
    driver
  });
}

/**
 * Attach a Syncore runtime to a browser Worker endpoint.
 */
export function createWebWorkerRuntime<
  TSchema extends WebSyncoreSchema
>(options: CreateWebWorkerRuntimeOptions<TSchema>) {
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
export function createWebSyncoreClient<
  TSchema extends WebSyncoreSchema
>(runtime: SyncoreRuntime<TSchema>) {
  return runtime.createClient();
}

/**
 * Create a full Syncore runtime directly in the browser.
 */
export function createBrowserSyncoreRuntime<
  TSchema extends BrowserSyncoreSchema
>(options: CreateBrowserRuntimeOptions<TSchema>) {
  return createWebSyncoreRuntime(options);
}

/**
 * Create a client directly from a browser Syncore runtime.
 */
export function createBrowserSyncoreClient<
  TSchema extends BrowserSyncoreSchema
>(runtime: SyncoreRuntime<TSchema>) {
  return createWebSyncoreClient(runtime);
}

export interface BrowserWebSocketDevtoolsSinkOptions {
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

export interface BrowserWebSocketDevtoolsSink extends DevtoolsSink {
  attachRuntime(runtime: SyncoreRuntime<WebSyncoreSchema>): void;
  attachCommandHandler(handler: DevtoolsCommandHandler): void;
  attachSubscriptionHost(host: DevtoolsSubscriptionHost): void;
  dispose(): void;
}

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
          ...(options.databaseLabel ? { databaseLabel: options.databaseLabel } : {}),
          ...(options.storageIdentity
            ? { storageIdentity: options.storageIdentity }
            : {})
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
          ...(options.databaseLabel ? { databaseLabel: options.databaseLabel } : {}),
          ...(options.storageIdentity
            ? { storageIdentity: options.storageIdentity }
            : {})
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
    ...(options.storageIdentity
      ? { storageIdentity: options.storageIdentity }
      : {})
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

function generateUniqueSessionName(): string {
  const adj =
    SESSION_ADJECTIVES[Math.floor(Math.random() * SESSION_ADJECTIVES.length)]!;
  const noun = SESSION_NOUNS[Math.floor(Math.random() * SESSION_NOUNS.length)]!;
  return `${adj} ${noun}`;
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
