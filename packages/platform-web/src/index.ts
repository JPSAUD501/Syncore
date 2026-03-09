import {
  type AnySyncoreSchema,
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
  devtools?: DevtoolsSink;

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

  return new SyncoreRuntime({
    schema: options.schema,
    functions: options.functions,
    driver,
    storage,
    platform: options.platform ?? "browser",
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    ...(options.devtools ? { devtools: options.devtools } : {}),
    ...(options.experimentalPlugins
      ? { experimentalPlugins: options.experimentalPlugins }
      : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {})
  });
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
