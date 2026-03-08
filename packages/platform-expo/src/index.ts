import { Directory, File, Paths } from "expo-file-system";
import {
  createElement,
  Fragment,
  useEffect,
  useState,
  type ReactNode
} from "react";
import {
  defaultDatabaseDirectory,
  openDatabaseSync,
  type SQLiteDatabase
} from "expo-sqlite";
import {
  type AnySyncoreSchema,
  type DevtoolsSink,
  SyncoreRuntime,
  type SchedulerOptions,
  type SyncoreCapabilities,
  type SyncoreExperimentalPlugin,
  type SyncoreRuntimeOptions,
  type SyncoreSqlDriver,
  type SyncoreStorageAdapter,
  type StorageObject,
  type StorageWriteInput
} from "syncore";
import { SyncoreProvider } from "@syncore/react";

export type ExpoSyncoreSchema = AnySyncoreSchema;

/**
 * Options for constructing an Expo Syncore runtime.
 *
 * Use this when you want Syncore to persist locally with `expo-sqlite` and the
 * Expo file system.
 */
export interface CreateExpoRuntimeOptions {
  /** The schema for the local Syncore app. */
  schema: ExpoSyncoreSchema;

  /** The generated function registry for the local Syncore app. */
  functions: SyncoreRuntimeOptions<ExpoSyncoreSchema>["functions"];

  /** Optional platform capabilities exposed to function handlers. */
  capabilities?: SyncoreCapabilities;

  /** Optional custom SQL driver. Defaults to `expo-sqlite`. */
  driver?: SyncoreSqlDriver;

  /** Optional experimental plugins for runtime hooks. */
  experimentalPlugins?: Array<SyncoreExperimentalPlugin<ExpoSyncoreSchema>>;

  /** Optional custom file/blob storage adapter. */
  storage?: SyncoreStorageAdapter;

  /** The SQLite database filename to open locally. */
  databaseName?: string;

  /** Optional directory for the SQLite database file. */
  databaseDirectory?: string;

  /** Directory name used for local file/blob storage. */
  storageDirectoryName?: string;

  /** Optional runtime platform label shown in devtools snapshots. */
  platform?: string;

  /** Optional devtools sink used during development. */
  devtools?: DevtoolsSink;

  /** Optional scheduler configuration for jobs and recurring work. */
  scheduler?: SchedulerOptions;
}

/**
 * A reusable bootstrap that lazily creates, starts, and stops an Expo Syncore runtime.
 */
export interface ExpoSyncoreBootstrap {
  /** Return the local runtime instance, creating it if needed. */
  getRuntime(): SyncoreRuntime<ExpoSyncoreSchema>;

  /** Start the runtime if needed and return a ready client. */
  getClient(): Promise<
    ReturnType<SyncoreRuntime<ExpoSyncoreSchema>["createClient"]>
  >;

  /** Stop the current runtime instance if one exists. */
  stop(): Promise<void>;

  /** Fully discard the runtime so the next call recreates it. */
  reset(): Promise<void>;
}

type ExpoSyncoreClient = ReturnType<
  SyncoreRuntime<ExpoSyncoreSchema>["createClient"]
>;

/**
 * Create an Expo Syncore runtime backed by `expo-sqlite` and local file storage.
 */
export function createExpoSyncoreRuntime(
  options: CreateExpoRuntimeOptions
): SyncoreRuntime<ExpoSyncoreSchema> {
  const databaseDirectory =
    options.databaseDirectory ??
    (typeof defaultDatabaseDirectory === "string"
      ? defaultDatabaseDirectory
      : undefined);
  const driver =
    options.driver ??
    new ExpoSqliteDriver(
      openDatabaseSync(
        options.databaseName ?? "syncore.db",
        undefined,
        databaseDirectory
      )
    );
  const storage =
    options.storage ??
    new ExpoFileStorageAdapter(
      options.storageDirectoryName ?? "syncore-storage"
    );

  return new SyncoreRuntime({
    schema: options.schema,
    functions: options.functions,
    driver,
    storage,
    platform: options.platform ?? "expo",
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    ...(options.devtools ? { devtools: options.devtools } : {}),
    ...(options.experimentalPlugins
      ? { experimentalPlugins: options.experimentalPlugins }
      : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {})
  });
}

/**
 * Create a same-process Syncore client from a started Expo runtime.
 */
export function createExpoSyncoreClient(
  runtime: SyncoreRuntime<ExpoSyncoreSchema>
) {
  return runtime.createClient();
}

/**
 * Create a reusable Expo bootstrap that lazily starts the local runtime.
 */
export function createExpoSyncoreBootstrap(
  options: CreateExpoRuntimeOptions
): ExpoSyncoreBootstrap {
  let runtime: SyncoreRuntime<ExpoSyncoreSchema> | null = null;
  let started: Promise<
    ReturnType<SyncoreRuntime<ExpoSyncoreSchema>["createClient"]>
  > | null = null;

  const ensureRuntime = () => {
    runtime ??= createExpoSyncoreRuntime(options);
    return runtime;
  };

  return {
    getRuntime() {
      return ensureRuntime();
    },
    async getClient() {
      if (!started) {
        const activeRuntime = ensureRuntime();
        started = activeRuntime
          .start()
          .then(() => activeRuntime.createClient());
      }
      return started;
    },
    async stop() {
      if (!runtime) {
        return;
      }
      await runtime.stop();
      started = null;
    },
    async reset() {
      if (runtime) {
        await runtime.stop();
      }
      runtime = null;
      started = null;
    }
  };
}

/**
 * Props for {@link SyncoreExpoProvider}.
 */
export interface SyncoreExpoProviderProps {
  /**
   * The bootstrap created with {@link createExpoSyncoreBootstrap}.
   */
  bootstrap: ExpoSyncoreBootstrap;

  /**
   * The React subtree that should receive the Syncore client.
   */
  children: ReactNode;

  /**
   * Optional fallback content rendered while the local runtime starts.
   */
  fallback?: ReactNode;
}

/**
 * Start an Expo Syncore bootstrap and provide its client to React descendants.
 *
 * This avoids the manual `useEffect` + loading-state boilerplate in simple Expo apps.
 */
export function SyncoreExpoProvider({
  bootstrap,
  children,
  fallback = null
}: SyncoreExpoProviderProps) {
  const [client, setClient] = useState<ExpoSyncoreClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    void bootstrap.getClient().then((nextClient) => {
      if (!cancelled) {
        setClient(nextClient);
      }
    });

    return () => {
      cancelled = true;
      setClient(null);
      void bootstrap.stop();
    };
  }, [bootstrap]);

  if (!client) {
    return createElement(Fragment, null, fallback);
  }

  return createElement(SyncoreProvider, { client, children });
}

/**
 * Syncore SQL driver implementation backed by `expo-sqlite`.
 */
export class ExpoSqliteDriver implements SyncoreSqlDriver {
  private transactionDepth = 0;
  private closed = false;

  constructor(private readonly database: SQLiteDatabase) {}

  async exec(sql: string): Promise<void> {
    this.ensureOpen();
    await this.database.execAsync(sql);
  }

  async run(
    sql: string,
    params: unknown[] = []
  ): Promise<{ changes: number; lastInsertRowid?: number | string }> {
    this.ensureOpen();
    const result = await this.database.runAsync(sql, normalizeParams(params));
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowId
    };
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    this.ensureOpen();
    const row = await this.database.getFirstAsync<T>(
      sql,
      normalizeParams(params)
    );
    return row ?? undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.ensureOpen();
    return this.database.getAllAsync<T>(sql, normalizeParams(params));
  }

  async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
    this.ensureOpen();
    if (this.transactionDepth > 0) {
      return this.withSavepoint(`nested_${this.transactionDepth}`, callback);
    }

    this.transactionDepth += 1;
    await this.database.execAsync("BEGIN IMMEDIATE");
    try {
      const result = await callback();
      await this.database.execAsync("COMMIT");
      return result;
    } catch (error) {
      await this.database.execAsync("ROLLBACK");
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  async withSavepoint<T>(name: string, callback: () => Promise<T>): Promise<T> {
    this.ensureOpen();
    const safeName = name.replaceAll(/[^a-zA-Z0-9_]/g, "_");
    this.transactionDepth += 1;
    await this.database.execAsync(`SAVEPOINT ${safeName}`);
    try {
      const result = await callback();
      await this.database.execAsync(`RELEASE SAVEPOINT ${safeName}`);
      return result;
    } catch (error) {
      await this.database.execAsync(`ROLLBACK TO SAVEPOINT ${safeName}`);
      await this.database.execAsync(`RELEASE SAVEPOINT ${safeName}`);
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    await this.database.closeAsync();
    this.closed = true;
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error("The Expo SQLite driver is already closed.");
    }
  }
}

/**
 * Syncore file/blob storage backed by the Expo file system.
 */
export class ExpoFileStorageAdapter implements SyncoreStorageAdapter {
  private readonly rootDirectory: Directory;

  constructor(storageDirectoryName: string) {
    this.rootDirectory = new Directory(Paths.document, storageDirectoryName);
    if (!this.rootDirectory.exists) {
      this.rootDirectory.create({ idempotent: true, intermediates: true });
    }
  }

  async put(id: string, input: StorageWriteInput): Promise<StorageObject> {
    const file = new File(this.rootDirectory, id);
    if (!file.exists) {
      file.create({ intermediates: true, overwrite: true });
    }
    const bytes = normalizeBinary(input.data);
    file.write(bytes);
    return {
      id,
      path: file.uri,
      size: bytes.byteLength,
      contentType: input.contentType ?? null
    };
  }

  async get(id: string): Promise<StorageObject | null> {
    const file = new File(this.rootDirectory, id);
    if (!file.exists) {
      return null;
    }
    return {
      id,
      path: file.uri,
      size: file.size,
      contentType: file.type || null
    };
  }

  async read(id: string): Promise<Uint8Array | null> {
    const file = new File(this.rootDirectory, id);
    if (!file.exists) {
      return null;
    }
    return file.bytes();
  }

  async delete(id: string): Promise<void> {
    const file = new File(this.rootDirectory, id);
    if (file.exists) {
      file.delete();
    }
  }
}

function normalizeParams(
  values: unknown[]
): Array<string | number | Uint8Array | null> {
  return values.map((value) => {
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    return JSON.stringify(value);
  });
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
