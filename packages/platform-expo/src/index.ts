// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./assets.d.ts" />

import { Directory, File, Paths } from "expo-file-system";
import {
  defaultDatabaseDirectory,
  openDatabaseSync,
  type SQLiteDatabase
} from "expo-sqlite";
import {
  type ImpactScope,
  type DevtoolsSink,
  type SyncoreExternalChangeApplier,
  type SyncoreExternalChangeSignal,
  SyncoreRuntime,
  type SchedulerOptions,
  type SyncoreCapabilities,
  type SyncoreDataModel,
  type SyncoreRuntimeOptions,
  type SyncoreSqlDriver,
  type SyncoreStorageAdapter,
  type StorageObject,
  type StorageWriteInput
} from "@syncore/core";
import {
  BroadcastChannelExternalChangeSignal,
  createDefaultSyncChannelName,
  createWebSyncoreRuntime
} from "@syncore/platform-web";
import { normalizeSqliteParams } from "@syncore/internal";

export type ExpoSyncoreSchema<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> = TSchema;

/**
 * Options for {@link createExpoSyncoreRuntime}.
 *
 * On native (iOS/Android) Syncore uses `expo-sqlite` and `expo-file-system`
 * automatically. When the same app is served on web (via `expo-router` or
 * Metro’s web bundler) it falls back to the SQL.js + OPFS web stack instead.
 *
 * At minimum supply `schema` and `functions`. Everything else has platform
 * defaults.
 *
 * ```ts
 * const runtime = createExpoSyncoreRuntime({
 *   schema,
 *   functions,
 *   databaseName: "app.db",
 *   storageDirectoryName: "app-storage",
 * });
 * await runtime.start();
 * ```
 */
export interface CreateExpoRuntimeOptions<
  TSchema extends ExpoSyncoreSchema = ExpoSyncoreSchema
> {
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

  /**
   * Custom SQL driver. Defaults to an `ExpoSqliteDriver` backed by
   * `expo-sqlite`.
   */
  driver?: SyncoreSqlDriver;

  /** Custom file/blob storage adapter. Defaults to `ExpoFileStorageAdapter`. */
  storage?: SyncoreStorageAdapter;

  /**
   * SQLite database filename (e.g. `"app.db"`). Defaults to `"syncore.db"`.
   * The file is created inside the app-local documents directory on device.
   */
  databaseName?: string;

  /**
   * Absolute path to the directory where the SQLite file is stored.
   * Defaults to `expo-sqlite`’s `defaultDatabaseDirectory`.
   */
  databaseDirectory?: string;

  /**
   * Name of the sub-directory inside the app’s documents folder used for
   * blob/file storage. Defaults to `"syncore-storage"`.
   */
  storageDirectoryName?: string;

  /**
   * Platform label reported to devtools. Defaults to `"expo"`. Override to
   * `"expo-web"` when running on web.
   */
  platform?: string;

  /**
   * Devtools event sink. Omit to disable devtools. On-device devtools
   * connections require pointing to your development machine’s IP address.
   */
  devtools?: DevtoolsSink | false;

  /** Scheduler configuration for background and recurring jobs. */
  scheduler?: SchedulerOptions;

  /**
   * External change signal used to keep multiple in-process instances in sync.
   * On web, defaults to a `BroadcastChannel`-based signal automatically.
   */
  externalChangeSignal?: SyncoreExternalChangeSignal;

  /**
   * External change applier used when change events arrive from other tabs or
   * processes. On web with `ExpoSqliteDriver`, defaults to
   * `ExpoWebExternalChangeApplier` automatically.
   */
  externalChangeApplier?: SyncoreExternalChangeApplier;

  /**
   * Direct URL to the SQL.js `.wasm` binary. Only needed when the app runs on
   * web and the default CDN URL is unreachable.
   */
  wasmUrl?: string;

  /**
   * Resolver for SQL.js support files (`.wasm`, `.worker.js`). Equivalent to
   * the `locateFile` option in `initSqlJs()`. Only used on web.
   */
  locateFile?: (fileName: string) => string;
}

/**
 * A reusable, lazily-started Expo Syncore runtime handle.
 *
 * Created by {@link createExpoSyncoreBootstrap}. The bootstrap defers actual
 * runtime startup until the first call to `getClient()` and keeps a single
 * instance alive across React Navigation reloads.
 *
 * ```ts
 * const bootstrap = createExpoSyncoreBootstrap({ schema, functions });
 *
 * // In your root component:
 * const client = await bootstrap.getClient();
 * ```
 */
export interface ExpoSyncoreBootstrap<
  TSchema extends ExpoSyncoreSchema = ExpoSyncoreSchema
> {
  /** @deprecated Access the runtime via `getClient()` instead. */
  getRuntime(): never;

  /**
   * Start the runtime on first call, then return the same client on subsequent
   * calls. Safe to call from multiple places concurrently.
   */
  getClient(): Promise<ReturnType<SyncoreRuntime<TSchema>["createClient"]>>;

  /** Stop the running runtime instance if one is active. */
  stop(): Promise<void>;

  /**
   * Stop and discard the current runtime so the next `getClient()` call
   * creates a fresh one. Useful after a full app reset or database migration.
   */
  reset(): Promise<void>;
}

/**
 * Create a Syncore runtime for Expo (React Native and Expo web) backed by
 * `expo-sqlite` on native platforms and SQL.js on web.
 *
 * Returns an unstarted SyncoreRuntime. Call `await runtime.start()`
 * before using the client:
 *
 * ```ts
 * import { createExpoSyncoreRuntime } from "syncorejs/expo";
 * import schema from "./syncore/schema";
 * import { functions } from "./syncore/_generated/functions";
 *
 * const runtime = createExpoSyncoreRuntime({ schema, functions });
 * await runtime.start();
 * const client = runtime.createClient();
 * ```
 *
 * For managed lifecycle in React components, prefer
 * {@link createExpoSyncoreBootstrap} instead.
 */
export function createExpoSyncoreRuntime<TSchema extends ExpoSyncoreSchema>(
  options: CreateExpoRuntimeOptions<TSchema>
): SyncoreRuntime<TSchema> {
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
      ),
      {
        databaseName: options.databaseName ?? "syncore.db",
        ...(databaseDirectory ? { databaseDirectory } : {})
      }
    );
  const storage =
    options.storage ??
    new ExpoFileStorageAdapter(
      options.storageDirectoryName ?? "syncore-storage"
    );
  const isWebEnvironment =
    typeof window !== "undefined" && typeof document !== "undefined";
  const webExternalChangeSignal =
    isWebEnvironment && !options.externalChangeSignal
      ? new BroadcastChannelExternalChangeSignal({
          channelName: createDefaultSyncChannelName(
            options.databaseName ?? "syncore.db"
          )
        })
      : undefined;
  const webExternalChangeApplier =
    isWebEnvironment &&
    !options.externalChangeApplier &&
    driver instanceof ExpoSqliteDriver
      ? new ExpoWebExternalChangeApplier(driver)
      : undefined;

  return new SyncoreRuntime({
    schema: options.schema,
    functions: options.functions,
    ...(options.components ? { components: options.components } : {}),
    driver,
    storage,
    ...(isWebEnvironment && options.externalChangeSignal
      ? { externalChangeSignal: options.externalChangeSignal }
      : isWebEnvironment && webExternalChangeSignal
        ? { externalChangeSignal: webExternalChangeSignal }
        : {}),
    ...(isWebEnvironment && options.externalChangeApplier
      ? { externalChangeApplier: options.externalChangeApplier }
      : isWebEnvironment && webExternalChangeApplier
        ? { externalChangeApplier: webExternalChangeApplier }
        : {}),
    platform: options.platform ?? "expo",
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    runtimeCapabilities: {
      storage: {
        available: true,
        protocol: "file",
        supportsRange: false
      }
    },
    ...(options.devtools ? { devtools: options.devtools } : {}),
    ...(options.scheduler ? { scheduler: options.scheduler } : {})
  });
}

/**
 * Create a same-process Syncore client directly from a started Expo runtime.
 *
 * Prefer this in scripts or non-component code. For React component trees,
 * use {@link createExpoSyncoreBootstrap} instead to get automatic lifecycle
 * management.
 *
 * ```ts
 * const client = createExpoSyncoreClient(runtime);
 * await client.mutation(api.todos.create, { text: "Buy milk" });
 * ```
 */
export function createExpoSyncoreClient<TSchema extends ExpoSyncoreSchema>(
  runtime: SyncoreRuntime<TSchema>
) {
  return runtime.createClient();
}

/**
 * Create a reusable Expo bootstrap that lazily starts the local runtime the
 * first time a client is requested.
 *
 * The bootstrap keeps a single runtime instance alive across component
 * remounts and safely handles concurrent `getClient()` calls.
 *
 * ```ts
 * // app/_layout.tsx
 * import { createExpoSyncoreBootstrap } from "syncorejs/expo";
 * import schema from "../syncore/schema";
 * import { functions } from "../syncore/_generated/functions";
 *
 * export const syncoreBootstrap = createExpoSyncoreBootstrap({
 *   schema,
 *   functions,
 * });
 *
 * // Later in SyncoreProvider:
 * const client = await syncoreBootstrap.getClient();
 * ```
 */
export function createExpoSyncoreBootstrap<TSchema extends ExpoSyncoreSchema>(
  options: CreateExpoRuntimeOptions<TSchema>
): ExpoSyncoreBootstrap<TSchema> {
  let runtime: SyncoreRuntime<TSchema> | null = null;
  let started: Promise<
    ReturnType<SyncoreRuntime<TSchema>["createClient"]>
  > | null = null;

  const ensureRuntime = async () => {
    runtime ??= isWebEnvironment()
      ? await createExpoWebSyncoreRuntime(options)
      : createExpoSyncoreRuntime(options);
    return runtime;
  };

  return {
    getRuntime() {
      throw new Error(
        "createExpoSyncoreBootstrap().getRuntime() is not available synchronously. Use getClient() instead."
      );
    },
    async getClient() {
      if (!started) {
        started = ensureRuntime().then((activeRuntime) =>
          activeRuntime.start().then(() => activeRuntime.createClient())
        );
      }
      return started;
    },
    async stop() {
      if (!runtime) {
        return;
      }
      await runtime.stop();
      runtime = null;
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
 * Syncore SQL driver implementation backed by `expo-sqlite`.
 */
export class ExpoSqliteDriver implements SyncoreSqlDriver {
  private transactionDepth = 0;
  private closed = false;
  private readonly databaseName: string;
  private readonly databaseDirectory: string | undefined;

  constructor(
    private database: SQLiteDatabase,
    options?: {
      databaseName?: string;
      databaseDirectory?: string;
    }
  ) {
    this.databaseName = options?.databaseName ?? "syncore.db";
    this.databaseDirectory = options?.databaseDirectory;
  }

  async exec(sql: string): Promise<void> {
    this.ensureOpen();
    await this.database.execAsync(sql);
  }

  async run(
    sql: string,
    params: unknown[] = []
  ): Promise<{ changes: number; lastInsertRowid?: number | string }> {
    this.ensureOpen();
    const result = await this.database.runAsync(
      sql,
      normalizeSqliteParams(params)
    );
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowId
    };
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    this.ensureOpen();
    const row = await this.database.getFirstAsync<T>(
      sql,
      normalizeSqliteParams(params)
    );
    return row ?? undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.ensureOpen();
    return this.database.getAllAsync<T>(sql, normalizeSqliteParams(params));
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

  async reopen(): Promise<void> {
    this.ensureOpen();
    await this.database.closeAsync();
    this.database = openDatabaseSync(
      this.databaseName,
      undefined,
      this.databaseDirectory
    );
  }
}

class ExpoWebExternalChangeApplier implements SyncoreExternalChangeApplier {
  constructor(private readonly driver: ExpoSqliteDriver) {}

  async applyExternalChange(event: {
    scope: "database" | "storage" | "all";
    changedScopes?: ImpactScope[];
    changedTables?: string[];
    storageIds?: string[];
  }) {
    if (event.scope === "database" || event.scope === "all") {
      await this.driver.reopen();
    }
    return {
      databaseChanged: event.scope === "database" || event.scope === "all",
      storageChanged: event.scope === "storage" || event.scope === "all",
      changedScopes:
        event.changedScopes ??
        ([
          ...(event.changedTables ?? []).map(
            (tableName) => `table:${tableName}`
          ),
          ...(event.storageIds ?? []).map((storageId) => `storage:${storageId}`)
        ] as ImpactScope[])
    };
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

function normalizeBinary(data: StorageWriteInput["data"]): Uint8Array {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  return new Uint8Array(data);
}

async function createExpoWebSyncoreRuntime<TSchema extends ExpoSyncoreSchema>(
  options: CreateExpoRuntimeOptions<TSchema>
): Promise<SyncoreRuntime<TSchema>> {
  const wasmUrl =
    options.wasmUrl ??
    (options.locateFile
      ? undefined
      : await resolveDefaultExpoWebSqlJsWasmUrl());

  return createWebSyncoreRuntime({
    schema: options.schema,
    functions: options.functions,
    ...(options.components ? { components: options.components } : {}),
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    databaseName: options.databaseName ?? "syncore.db",
    storageNamespace: options.storageDirectoryName ?? "syncore-storage",
    ...(wasmUrl ? { wasmUrl } : {}),
    ...(options.locateFile ? { locateFile: options.locateFile } : {}),
    platform: options.platform ?? "expo-web",
    devtools: options.devtools ?? false,
    ...(options.scheduler ? { scheduler: options.scheduler } : {})
  });
}

async function resolveDefaultExpoWebSqlJsWasmUrl(): Promise<
  string | undefined
> {
  const module = await import("./web-sqljs-wasm.js");
  return module.resolveDefaultExpoWebSqlJsWasmUrl();
}

function isWebEnvironment(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
