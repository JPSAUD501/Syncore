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
} from "syncore";
import {
  createWebPersistence,
  type SyncoreWebPersistence,
  type WebPersistenceMode
} from "./persistence.js";
import { SqlJsDriver } from "./sqljs.js";
export * from "./worker.js";
export * from "./persistence.js";
export * from "./indexeddb.js";
export * from "./opfs.js";

export type WebSyncoreSchema = AnySyncoreSchema;

export interface CreateWebRuntimeOptions {
  schema: WebSyncoreSchema;
  functions: SyncoreRuntimeOptions<WebSyncoreSchema>["functions"];
  capabilities?: SyncoreCapabilities;
  driver?: SyncoreRuntimeOptions<WebSyncoreSchema>["driver"];
  storage?: SyncoreStorageAdapter;
  experimentalPlugins?: Array<SyncoreExperimentalPlugin<WebSyncoreSchema>>;
  persistence?: SyncoreWebPersistence;
  persistenceMode?: WebPersistenceMode;
  databaseName?: string;
  persistenceDatabaseName?: string;
  opfsRootDirectoryName?: string;
  storageNamespace?: string;
  wasmUrl?: string;
  locateFile?: (fileName: string) => string;
  platform?: string;
  devtools?: DevtoolsSink;
  scheduler?: SchedulerOptions;
}

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
    platform: options.platform ?? "web",
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    ...(options.devtools ? { devtools: options.devtools } : {}),
    ...(options.experimentalPlugins
      ? { experimentalPlugins: options.experimentalPlugins }
      : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {})
  });
}

export function createWebSyncoreClient(runtime: SyncoreRuntime<WebSyncoreSchema>) {
  return runtime.createClient();
}

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
