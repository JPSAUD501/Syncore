import type {
  DocumentChangePreview,
  StorageEntry,
  SyncoreActiveQueryInfo,
  SyncoreDevtoolsEvent,
  SyncoreDevtoolsEventOrigin,
  SyncoreRuntimeSummary
} from "@syncore/devtools-protocol";
import type {
  AnyTableDefinition,
  InferDocument,
  InferTableInput,
  SyncoreSchemaDefinition,
  TableIndexFields,
  TableIndexNames,
  TableSearchIndexConfig,
  TableSearchIndexNames,
  Validator
} from "@syncore/schema";
import type {
  ResolvedSyncoreComponent,
  SyncoreComponentFunctionMetadata
} from "./components.js";
import type {
  FunctionArgs,
  FunctionArgsFromDefinition,
  FunctionKindFromDefinition,
  FunctionReference,
  FunctionResultFromDefinition,
  MisfirePolicy,
  RecurringJobDefinition,
  RecurringSchedule,
  SyncoreFunctionKind
} from "./functions.js";
import { RuntimeKernel } from "./internal/runtimeKernel.js";

/**
 * A registered Syncore function ready for execution by the runtime.
 *
 * This is the shape stored in the function registry after Syncore processes a
 * definition exported from `syncore/functions/`. You rarely interact with this
 * directly — prefer the generated `api` object and the high-level function
 * builders ({@link query}, {@link mutation}, {@link action}).
 */
export interface RegisteredSyncoreFunction {
  kind: SyncoreFunctionKind;
  argsValidator: Validator<unknown, unknown, string>;
  returnsValidator?: Validator<unknown, unknown, string>;
  handler: RegisteredSyncoreHandler;
  __syncoreComponent?: SyncoreComponentFunctionMetadata;
}

/**
 * A map from function path strings (e.g. `"tasks/create"`) to their registered
 * definitions.
 *
 * This is the type of the second argument to {@link SyncoreRuntimeOptions} and
 * is produced by `npx syncorejs codegen` in `syncore/_generated/functions.ts`.
 * You should not need to implement this interface manually.
 */
export interface SyncoreFunctionRegistry {
  readonly [name: string]: RegisteredSyncoreFunction | undefined;
}

/**
 * Function handler stored in a registered Syncore function.
 *
 * This type is intentionally bivariant so generated registries can preserve
 * precise handler types while still satisfying the runtime registry shape.
 */
export type RegisteredSyncoreHandler = {
  bivarianceHack(ctx: unknown, args: unknown): unknown;
}["bivarianceHack"];
/** A plain JSON-serialisable object. Used for function arguments and scheduler payloads. */
export type JsonObject = Record<string, unknown>;

/** A SQL-style comparison operator used when building index range queries. */
export type ComparisonOperator = "=" | ">" | ">=" | "<" | "<=";

/**
 * A single field comparison used inside a query filter or index range.
 *
 * You typically get `QueryCondition` values from the builder callbacks passed
 * to {@link IndexRangeBuilder} or {@link FilterBuilder} — you do not construct
 * them manually.
 */
export type QueryCondition = {
  field: string;
  operator: ComparisonOperator;
  value: unknown;
};

/**
 * A composable predicate tree used by {@link FilterBuilder}.
 *
 * Leaf nodes are single {@link QueryCondition} values; branch nodes combine
 * conditions with `and` / `or` semantics. The runtime evaluates these trees
 * against documents during a query scan.
 */
export type QueryExpression =
  | { type: "condition"; condition: QueryCondition }
  | { type: "and"; expressions: QueryExpression[] }
  | { type: "or"; expressions: QueryExpression[] };

/**
 * The arguments Syncore passes to its SQLite FTS5 full-text search layer when
 * a query uses `.withSearchIndex()`.
 */
export type SearchQuery = {
  searchField: string;
  searchText: string;
  filters: QueryCondition[];
};

/**
 * Result metadata returned by a single SQL `run` call.
 *
 * Wraps the driver's raw result so callers get consistent change-count and
 * last-insert-rowid values regardless of the underlying SQLite binding.
 */
export interface RunResult {
  /** Number of rows affected by the statement. */
  changes: number;
  /** The rowid of the last inserted row, if applicable. */
  lastInsertRowid?: number | string;
}

/**
 * Describes an optional runtime capability that functions can read from `ctx.capabilities`.
 *
 * Capabilities let platform adapters expose platform-specific services (e.g.
 * push notifications, biometrics) to Syncore functions in a portable way. The
 * runtime validates capabilities against their descriptors at start-up.
 */
export interface CapabilityDescriptor {
  /** Unique capability name. Must match the key used in `SyncoreCapabilities`. */
  name: string;
  /** Semantic version number for the capability’s interface contract. */
  version: number;
  /** Optional feature flags exposed by this capability. */
  features?: string[];
  /** Arbitrary metadata for introspection or devtools display. */
  metadata?: Record<string, unknown>;
  /**
   * When `true`, the runtime starts even if the capability is absent. Useful
   * for progressively-enhanced features that degrade gracefully.
   */
  optional?: boolean;
}

/**
 * Identifies a subset of the runtime state that a query depends on or that a
 * mutation has changed.
 *
 * The reactivity engine uses impact scopes to efficiently determine which
 * active queries need to be re-executed after a mutation commits. Scopes are
 * additive: a query subscribed to `"table:tasks"` will be invalidated by any
 * mutation that writes to the `tasks` table.
 *
 * - `"runtime.summary"` / `"runtime.activeQueries"` / `"schema.tables"` /
 *   `"scheduler.jobs"` / `"storage.objects"` - runtime-level state consumed by devtools.
 * - `table:${string}` - every document in a specific table.
 * - `row:${string}:${string}` - a single document (table + id).
 * - `storage:${string}` - a specific storage object.
 */
export type ImpactScope =
  | "runtime.summary"
  | "runtime.activeQueries"
  | "schema.tables"
  | "scheduler.jobs"
  | "storage.objects"
  | `table:${string}`
  | `row:${string}:${string}`
  | `storage:${string}`;

/** A frozen set of {@link ImpactScope} values. */
export type ImpactSet = ReadonlySet<ImpactScope>;

export interface ExecutionResult<TResult = unknown> {
  result: TResult;
  changedTables: Set<string>;
  documentChanges: DocumentChangePreview[];
  storageChanges: Array<{
    storageId: string;
    reason: Extract<
      SyncoreExternalChangeReason,
      "storage-put" | "storage-delete"
    >;
  }>;
  scheduledJobs: string[];
  devtoolsEvents: SyncoreDevtoolsEvent[];
  externalChangeRequests: Array<{
    scope: SyncoreExternalChangeScope;
    reason: SyncoreExternalChangeReason;
    changedScopes: ImpactScope[];
  }>;
}

/**
 * Low-level interface that Syncore uses to communicate with a SQLite database.
 *
 * The runtime ships concrete implementations for every supported environment
 * (`NodeSqliteDriver`, `SqlJsDriver`, `ExpoSqliteDriver`). Implement this
 * interface only if you need to integrate a custom SQLite binding.
 *
 * All methods must be safe to call concurrently — the runtime serialises
 * concurrent writes through the driver’s own transaction mechanism.
 */
export interface SyncoreSqlDriver {
  /**
   * Execute one or more SQL statements that produce no result rows (e.g.
   * `CREATE TABLE`, `PRAGMA journal_mode = WAL`).
   */
  exec(sql: string): Promise<void>;
  /**
   * Execute a single parameterised statement and return change metadata.
   * Typically used for `INSERT`, `UPDATE`, and `DELETE`.
   */
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  /**
   * Execute a query and return the first row, or `undefined` if there are no
   * results. Useful for `SELECT … LIMIT 1` lookups.
   */
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /**
   * Execute a query and return all matching rows as an array. Returns an empty
   * array when there are no results.
   */
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /**
   * Run `callback` inside an atomic SQLite transaction.
   *
   * If the callback throws, the transaction is rolled back automatically.
   * Implementations should support nested calls by using `SAVEPOINT`.
   */
  withTransaction<T>(callback: () => Promise<T>): Promise<T>;
  /**
   * Run `callback` inside a named SQLite savepoint, allowing partial rollback
   * within an outer transaction.
   */
  withSavepoint<T>(name: string, callback: () => Promise<T>): Promise<T>;
  /**
   * Release the underlying database handle. Called by the runtime during
   * shutdown. Implementations that hold no persistent resources may omit this.
   */
  close?(): Promise<void>;
}

/**
 * Identifies which category of local state an external change event affects.
 *
 * - `"database"` — One or more SQLite tables were written by an external
 *   source (e.g. another Syncore instance sharing the same database file).
 * - `"storage"` — One or more blob/file storage objects were added or removed.
 * - `"all"` — Both the database and storage should be treated as changed.
 */
export type SyncoreExternalChangeScope = "database" | "storage" | "all";

/**
 * Why an external change event was emitted.
 *
 * - `"commit"` — A write transaction was committed by another runtime instance.
 * - `"storage-put"` — A new storage object was written.
 * - `"storage-delete"` — A storage object was removed.
 * - `"reconcile"` — The runtime is re-synchronising with the underlying store
 *   after a reconnect or restart.
 */
export type SyncoreExternalChangeReason =
  | "commit"
  | "storage-put"
  | "storage-delete"
  | "reconcile";

/**
 * A message that notifies a Syncore runtime that state has changed in a source
 * it does not own — for example, a write made by a shared Node process that
 * the browser tab needs to reflect.
 *
 * The runtime subscribes to these events through a
 * {@link SyncoreExternalChangeSignal} and uses them to invalidate and refresh
 * affected queries without polling.
 */
export interface SyncoreExternalChangeEvent {
  /** Identifies the runtime instance that published this event. */
  sourceId: string;
  /** Which category of state changed. */
  scope: SyncoreExternalChangeScope;
  /** Why the change occurred. */
  reason: SyncoreExternalChangeReason;
  /** Unix timestamp (milliseconds) when the change was published. */
  timestamp: number;
  /** Optional opaque string used to detect duplicate or out-of-order events. */
  revision?: string;
  /** Specific impact scopes that were affected (subset of `scope`). */
  changedScopes?: ImpactScope[];
  /** Table names that were written to, when `scope` includes `"database"`. */
  changedTables?: string[];
  /** Storage object IDs that were affected, when `scope` includes `"storage"`. */
  storageIds?: string[];
}

/**
 * A pub/sub channel for cross-instance change notifications.
 *
 * Provide an implementation to `SyncoreRuntimeOptions.externalChangeSignal`
 * when multiple Syncore runtimes share the same underlying database (e.g. an
 * Electron main process and renderer, or multiple browser tabs). The runtime
 * will publish events after its own commits and react to events published by
 * other instances.
 *
 * Platform adapters ship ready-made implementations:
 * - `BroadcastChannelExternalChangeSignal` (browser, shared workers)
 * - Node IPC signal (Electron main ↔ renderer)
 */
export interface SyncoreExternalChangeSignal {
  /**
   * Register a listener for incoming change events.
   * @returns A cleanup function that removes the listener when called.
   */
  subscribe(listener: (event: SyncoreExternalChangeEvent) => void): () => void;
  /** Publish an outgoing change event to other subscribers. */
  publish(event: SyncoreExternalChangeEvent): void | Promise<void>;
  /** Optional cleanup called when the runtime shuts down. */
  close?(): void | Promise<void>;
}

/**
 * Applies an incoming {@link SyncoreExternalChangeEvent} to a local SQL
 * driver, reconciling the local state with a remote source.
 *
 * Typically provided by the same adapter that supplies
 * {@link SyncoreExternalChangeSignal} (e.g. `SqlJsExternalChangeApplier` for
 * browser runtimes). Only necessary when the local driver needs to pull in
 * changes made to the database file on disk by another process.
 */
export interface SyncoreExternalChangeApplier {
  applyExternalChange(event: SyncoreExternalChangeEvent): Promise<{
    databaseChanged: boolean;
    storageChanged: boolean;
    changedScopes: ImpactScope[];
  }>;
}

/**
 * The payload used when writing a new object through Syncore storage APIs.
 *
 * Pass this to `ctx.storage.put()` inside a mutation or action to persist a
 * binary blob alongside your database documents.
 *
 * ```ts
 * const id = await ctx.storage.put({
 *   data: new Uint8Array(imageBytes),
 *   contentType: "image/png",
 *   fileName: "avatar.png",
 * });
 * // Store `id` in the database to reference the object later.
 * ```
 */
export interface StorageWriteInput {
  /**
   * The raw data to store. Accepts `Uint8Array`, `ArrayBuffer`, or a UTF-8
   * string (the string is encoded to bytes automatically).
   */
  data: Uint8Array | ArrayBuffer | string;
  /**
   * MIME type hint stored alongside the object (e.g. `"image/png"`,
   * `"application/pdf"`). Not validated or enforced by Syncore; purely
   * informational for downstream consumers.
   */
  contentType?: string;
  /**
   * Optional human-readable filename hint. Stored as metadata and surfaced in
   * devtools but not used for addressing the object (the auto-generated `id` is
   * used for that).
   */
  fileName?: string;
}

/**
 * Metadata describing a stored object managed by the Syncore storage adapter.
 *
 * Returned by `ctx.storage.get()` and `SyncoreStorageAdapter.list()`. The
 * `id` field is the opaque string you store in the database to reference this
 * object; use it with `ctx.storage.read()` to fetch the bytes.
 */
export interface StorageObject {
  /** Opaque identifier. Store this in a database document to reference the object. */
  id: string;
  /** Absolute path or key used by the storage backend (filesystem path, OPFS key, etc.). */
  path: string;
  /** Size of the stored data in bytes. */
  size: number;
  /** MIME type provided at write time, or `null` if none was specified. */
  contentType: string | null;
}

/**
 * Low-level interface for persisting and retrieving binary blobs alongside the
 * Syncore database.
 *
 * The runtime ships concrete implementations for every supported environment
 * (`NodeFileStorageAdapter`, `BrowserFileStorageAdapter`,
 * `ExpoFileStorageAdapter`). Implement this interface only if you need a custom
 * storage backend (e.g. an in-memory store for tests or an S3-compatible
 * remote).
 */
export interface SyncoreStorageAdapter {
  /**
   * Write a blob and return its metadata.
   *
   * @param id    - The opaque identifier Syncore assigns to this object. Use
   *   the same value to retrieve or delete the object later.
   * @param input - The data and optional metadata to persist.
   */
  put(id: string, input: StorageWriteInput): Promise<StorageObject>;
  /**
   * Return the metadata for a stored object, or `null` if it does not exist.
   * Does **not** return the raw bytes — use {@link read} for that.
   */
  get(id: string): Promise<StorageObject | null>;
  /**
   * Return the raw bytes of a stored object, or `null` if it does not exist.
   */
  read(id: string): Promise<Uint8Array | null>;
  /**
   * Return a byte range for a stored object, or `null` if it does not exist.
   *
   * Adapters that can seek without loading the whole object should implement
   * this so devtools preview and download endpoints can stream large files.
   */
  readRange?(
    id: string,
    offset: number,
    length: number
  ): Promise<Uint8Array | null>;
  /**
   * Return `false` when `readRange` is intentionally unavailable for this
   * adapter instance.
   */
  supportsRange?(): boolean;
  /**
   * Permanently remove a stored object. A no-op if the object does not exist.
   */
  delete(id: string): Promise<void>;
  /**
   * Enumerate all stored objects. Used by devtools and migration tooling.
   * Optional — omit for backends that don’t support listing.
   */
  list?(): Promise<StorageObject[]>;
}

/**
 * Receives structured devtools events emitted by the runtime.
 *
 * In development the platform adapters automatically connect a WebSocket sink
 * that forwards events to the Syncore devtools dashboard. You can also supply
 * a custom sink for testing, logging, or building your own observability layer:
 *
 * ```ts
 * const sink: DevtoolsSink = {
 *   emit(event) { console.log("[syncore]", event.type); },
 * };
 * ```
 *
 * Pass `devtools: false` to the runtime options to disable devtools entirely
 * (recommended for production builds).
 */
export interface DevtoolsSink {
  /** Called synchronously every time the runtime emits a new event. */
  emit(event: SyncoreDevtoolsEvent): void;
  /**
   * Optional hook called once after the runtime is constructed so the sink can
   * hold a reference to it (e.g. to call `runtime.getAdmin()`).
   */
  attachRuntime?(runtime: SyncoreRuntime<SyncoreDataModel>): void;
}

export interface DevtoolsLiveQuerySnapshot {
  summary: SyncoreRuntimeSummary;
  activeQueries: SyncoreActiveQueryInfo[];
  schemaTables: Array<{
    name: string;
    displayName?: string;
    owner: "root" | "component";
    componentPath?: string;
    componentName?: string;
    fields: Array<{
      name: string;
      type: string;
      optional: boolean;
    }>;
    indexes: Array<{
      name: string;
      fields: string[];
      unique: boolean;
    }>;
    documentCount: number;
  }>;
}

export type DevtoolsLiveQueryScope =
  | "all"
  | "runtime.summary"
  | "runtime.activeQueries"
  | "schema.tables"
  | "scheduler.jobs"
  | "storage.objects"
  | `table:${string}`
  | `storage:${string}`;

/**
 * Configuration for the Syncore built-in scheduler.
 *
 * Pass this to `SyncoreRuntimeOptions.scheduler` to enable background job
 * processing. The scheduler polls for pending one-off jobs (created via
 * `ctx.scheduler.runAfter` / `ctx.scheduler.runAt`) and for recurring jobs
 * defined with {@link CronJobs}.
 *
 * ```ts
 * import crons from "./syncore/crons";
 *
 * createNodeSyncoreRuntime({
 *   ...,
 *   scheduler: {
 *     pollIntervalMs: 500,
 *     recurringJobs: crons.jobs,
 *   },
 * });
 * ```
 */
export interface SchedulerOptions {
  /**
   * How often the scheduler checks for jobs that are due, in milliseconds.
   * Defaults to `1000` (1 second). Lower values increase responsiveness at
   * the cost of more frequent SQLite reads.
   */
  pollIntervalMs?: number;
  /**
   * Static list of recurring job definitions to register when the runtime
   * starts. Build this with the {@link CronJobs} helper and a call to
   * {@link cronJobs}.
   */
  recurringJobs?: RecurringJobDefinition[];
}

export type SyncoreResolvedComponents = readonly ResolvedSyncoreComponent[];

export interface UpdateScheduledJobOptions {
  id: string;
  schedule?: RecurringSchedule;
  args: JsonObject;
  misfirePolicy?: MisfirePolicy;
  runAt?: number;
}

/**
 * An open-ended bag of platform-specific capabilities exposed to Syncore
 * function handlers via `ctx.capabilities`.
 *
 * Use capabilities to inject platform services (push notifications, camera
 * access, native storage, etc.) that should be available inside your
 * functions without hard-coding platform imports:
 *
 * ```ts
 * // Runtime setup (platform-specific)
 * createExpoSyncoreRuntime({
 *   ...,
 *   capabilities: { pushNotifications: Notifications },
 * });
 *
 * // Inside a mutation
 * export const notify = mutation({
 *   args: { message: s.string() },
 *   handler: async (ctx, { message }) => {
 *     await ctx.capabilities?.pushNotifications?.scheduleAsync({ body: message });
 *   },
 * });
 * ```
 */
export interface SyncoreCapabilities {
  [name: string]: unknown;
}

/**
 * The typed data model that backs a Syncore runtime.
 *
 * `SyncoreDataModel` is the shape of the value returned by
 * {@link defineSchema}. It is the type parameter you see on
 * {@link SyncoreRuntime}, {@link QueryCtx}, {@link MutationCtx}, and the
 * generated server context types. Application code typically gets this from
 * the schema file rather than constructing it directly:
 *
 * ```ts
 * import schema from "../syncore/schema";
 * type MySchema = typeof schema;
 * ```
 */
export interface SyncoreDataModel<
  TTables extends SyncoreSchemaDefinition = SyncoreSchemaDefinition
> {
  readonly tables: TTables;
  getTable(
    tableName: Extract<keyof TTables, string>
  ): TTables[Extract<keyof TTables, string>];
  tableNames(): Array<Extract<keyof TTables, string>>;
}

/**
 * Low-level options for constructing a {@link SyncoreRuntime} directly.
 *
 * Most applications should use a platform-specific factory function instead
 * (`createNodeSyncoreRuntime`, `createWebSyncoreRuntime`,
 * `createExpoSyncoreRuntime`, etc.), which fill in sensible defaults for the
 * driver, storage adapter, and devtools connection.
 *
 * Only reach for `SyncoreRuntimeOptions` when you need full control over the
 * underlying SQLite driver or storage backend.
 */
export interface SyncoreRuntimeOptions<TSchema extends SyncoreDataModel> {
  /** The data model that defines the available tables, indexes, and schemas. */
  schema: TSchema;
  /**
   * The registered functions Syncore can invoke. In practice this is always
   * the generated `functions` export from `syncore/_generated/functions.ts`.
   */
  functions: SyncoreFunctionRegistry;
  /**
   * Resolved Syncore component instances to mount alongside the root app
   * functions. Only required when your app installs Syncore components.
   */
  components?: SyncoreResolvedComponents;
  /**
   * The SQLite driver Syncore will use for all database operations.
   *
   * Use one of the platform-specific drivers shipped by Syncore
   * (`NodeSqliteDriver`, `SqlJsDriver`, `ExpoSqliteDriver`) or provide a
   * custom implementation of {@link SyncoreSqlDriver}.
   */
  driver: SyncoreSqlDriver;
  /**
   * The blob storage adapter used for `ctx.storage.put()` and related APIs.
   *
   * Use one of the platform-specific adapters
   * (`NodeFileStorageAdapter`, `BrowserFileStorageAdapter`,
   * `ExpoFileStorageAdapter`) or a custom implementation of
   * {@link SyncoreStorageAdapter}.
   */
  storage: SyncoreStorageAdapter;
  /**
   * A pub/sub channel that lets this runtime receive change notifications
   * published by other Syncore instances sharing the same data source.
   *
   * Required when running Syncore across multiple contexts that share a
   * database (e.g. Electron main + renderer, or multiple browser tabs).
   * Platform adapters provide ready-made implementations.
   */
  externalChangeSignal?: SyncoreExternalChangeSignal;
  /**
   * Applies incoming external change events to the local SQLite driver,
   * reconciling the local state with changes written by another process.
   *
   * Usually paired with `externalChangeSignal`. Only required for drivers
   * that hold an in-memory copy of the database (e.g. SQL.js in the browser).
   */
  externalChangeApplier?: SyncoreExternalChangeApplier;
  /**
   * Platform-specific capabilities injected into `ctx.capabilities` inside
   * every function handler. See {@link SyncoreCapabilities}.
   */
  capabilities?: SyncoreCapabilities;
  /**
   * Capabilities exposed to clients through `watchRuntimeStatus()`.
   *
   * Platform adapters fill this with feature availability that app UIs should
   * honor, such as whether `ctx.storage` is usable in the current environment.
   */
  runtimeCapabilities?: SyncoreRuntimeCapabilities;
  /** Structured capability descriptors validated at start-up. */
  capabilityDescriptors?: CapabilityDescriptor[];
  /**
   * Label reported to devtools to identify the runtime’s environment
   * (e.g. `"node"`, `"browser"`, `"expo"`, `"electron-main"`).
   */
  platform?: string;
  /**
   * Devtools event sink used during development.
   *
   * Pass `false` to disable devtools entirely (recommended for production).
   * Omit to use the platform adapter’s default auto-connect behaviour.
   */
  devtools?: DevtoolsSink;
  /** Scheduler configuration for background and recurring jobs. */
  scheduler?: SchedulerOptions;
}

/**
 * Arguments for a paginated Syncore query.
 *
 * Add `paginationOpts: s.object({ cursor: s.nullable(s.string()), numItems: s.number() })`
 * to your query’s `args` schema, then accept a `PaginationOptions` value in the
 * handler to enable cursor-based pagination:
 *
 * ```ts
 * export const listTasks = query({
 *   args: {
 *     paginationOpts: s.object({
 *       cursor: s.nullable(s.string()),
 *       numItems: s.number(),
 *     }),
 *   },
 *   handler: async (ctx, { paginationOpts }) =>
 *     ctx.db.query("tasks").paginate(paginationOpts),
 * });
 * ```
 *
 * In React, use {@link usePaginatedQuery} which manages the cursor for you.
 */
export interface PaginationOptions {
  /**
   * The cursor returned by the previous page, or `null` / `undefined` for the
   * first page.
   */
  cursor?: string | null;
  /** Maximum number of items to return in this page. */
  numItems: number;
}

/**
 * The value returned by `ctx.db.query(…).paginate()`.
 *
 * Store the `cursor` field and pass it back in the next call to fetch the
 * following page. `isDone` is `true` when there are no more results.
 */
export interface PaginationResult<TItem> {
  /** The items in this page. May be fewer than `numItems` if `isDone` is `true`. */
  page: TItem[];
  /**
   * Opaque cursor to pass as `PaginationOptions.cursor` in the next call.
   * `null` when `isDone` is `true`.
   */
  cursor: string | null;
  /** `true` when this is the last page and no more results exist. */
  isDone: boolean;
}

/**
 * Coarse lifecycle phase of a Syncore runtime.
 *
 * - `"starting"` — The runtime is initialising (applying schema, loading driver).
 * - `"ready"` — The runtime is fully started and accepting function calls.
 * - `"recovering"` — A transient error occurred; the runtime is attempting recovery.
 * - `"unavailable"` — The runtime is unreachable (worker not started, IPC down, etc.).
 * - `"error"` — The runtime encountered an unrecoverable error.
 */
export type SyncoreRuntimeStatusKind =
  | "starting"
  | "ready"
  | "recovering"
  | "unavailable"
  | "error";

/**
 * Explains why the runtime entered its current non-`"ready"` state.
 *
 * Useful for rendering descriptive loading or error messages in the UI.
 */
export type SyncoreRuntimeStatusReason =
  | "booting"
  | "rehydrating"
  | "worker-restarting"
  | "worker-unavailable"
  | "ipc-unavailable"
  | "runtime-unavailable"
  | "disposed";

/** Runtime-visible storage capability for app UIs and adapters. */
export interface SyncoreRuntimeStorageCapability {
  /** Whether `ctx.storage` can read/write objects in this runtime. */
  available: boolean;
  /** Short reason to show when storage is unavailable. */
  reason?: string;
  /** Storage protocol used by the adapter, such as `"file"` or `"opfs"`. */
  protocol?: string;
  /** Whether the adapter can read byte ranges without loading the full object. */
  supportsRange?: boolean;
}

/** Runtime capabilities exposed through `watchRuntimeStatus()`. */
export interface SyncoreRuntimeCapabilities {
  storage: SyncoreRuntimeStorageCapability;
}

/**
 * Snapshot of the runtime’s current lifecycle state.
 *
 * Subscribe to changes with `client.watchRuntimeStatus()` or the
 * `useSyncoreStatus()` React hook to adapt the UI while the runtime is
 * starting up or recovering.
 *
 * ```ts
 * const status = useSyncoreStatus();
 * if (status.kind !== "ready") return <LoadingSpinner />;
 * ```
 */
export interface SyncoreRuntimeStatus {
  /** Coarse lifecycle phase. */
  kind: SyncoreRuntimeStatusKind;
  /** Machine-readable reason for a non-`"ready"` state. */
  reason?: SyncoreRuntimeStatusReason;
  /** The underlying error when `kind` is `"error"`. */
  error?: Error;
  /** Runtime capabilities that app UIs can use to enable or hide affordances. */
  capabilities?: SyncoreRuntimeCapabilities;
}

/**
 * Lifecycle status of an individual reactive query subscription.
 *
 * - `"loading"` — The query has never produced a result (first load).
 * - `"success"` — The query has data and no error.
 * - `"error"` — The last execution threw an error. `data` may still hold a
 *   stale value from a prior successful run.
 * - `"skipped"` — The subscription was suppressed with the `skip` sentinel.
 */
export type SyncoreQueryStatus = "loading" | "success" | "error" | "skipped";

/**
 * The full reactive state of a Syncore query subscription.
 *
 * Returned by {@link useQueryState} and Svelte’s `createQueryStore`. For most
 * components you only need the `data` field — use {@link useQuery} for that
 * simpler shape.
 */
export interface SyncoreQueryState<TData> {
  /** The most recent result from the query, or `undefined` while loading. */
  data: TData | undefined;
  /** The error thrown by the last execution, or `undefined` on success. */
  error: Error | undefined;
  /** Fine-grained subscription lifecycle status. */
  status: SyncoreQueryStatus;
  /** Current lifecycle status of the underlying runtime. */
  runtimeStatus: SyncoreRuntimeStatus;
  /** `true` while waiting for the first result. Equivalent to `status === "loading"`. */
  isLoading: boolean;
  /** `true` when the last execution threw an error. */
  isError: boolean;
  /** `true` when `data` is available and the runtime is ready. */
  isReady: boolean;
}

export type SyncoreQueryRequest<
  TReference extends FunctionReference<"query"> = FunctionReference<"query">
> = (Record<never, never> extends FunctionArgs<TReference>
  ? {
      query: TReference;
      args?: FunctionArgs<TReference>;
    }
  : {
      query: TReference;
      args: FunctionArgs<TReference>;
    }) & {
  skip?: boolean;
};

export type SyncoreQueriesRequest = Record<string, SyncoreQueryRequest>;

/**
 * Lifecycle status of a paginated Syncore query subscription.
 *
 * - `"loading"` — Waiting for the first page to arrive.
 * - `"ready"` — At least one page has loaded and more pages are available.
 * - `"loadingMore"` — A `loadMore()` call is in progress.
 * - `"exhausted"` — All pages have been loaded (`isDone` is `true` on the
 *   last page). `loadMore()` is a no-op in this state.
 * - `"error"` — The last page load failed. `error` contains the thrown error.
 */
export type SyncorePaginatedQueryStatus =
  | "loading"
  | "ready"
  | "loadingMore"
  | "exhausted"
  | "error";

/**
 * The result object returned by {@link usePaginatedQuery} and
 * `createPaginatedQueryStore`.
 *
 * Contains the accumulated items, pagination metadata, and a `loadMore`
 * callback for fetching the next page.
 */
export interface UsePaginatedQueryResult<TItem> {
  /** All items loaded so far, across all fetched pages. */
  results: TItem[];
  /** Raw page results in order, one entry per fetched page. */
  pages: PaginationResult<TItem>[];
  /** Current lifecycle phase of the paginated query. */
  status: SyncorePaginatedQueryStatus;
  /** The error thrown by the last failed page load, or `undefined`. */
  error: Error | undefined;
  /** `true` while waiting for the first page. */
  isLoading: boolean;
  /** `true` while a `loadMore()` request is in progress. */
  isLoadingMore: boolean;
  /** `true` when there is a next page available to load. */
  hasMore: boolean;
  /** Cursor to pass to the next page request. `null` when `isDone` is `true`. */
  cursor: string | null;
  /** Current lifecycle status of the underlying runtime. */
  runtimeStatus: SyncoreRuntimeStatus;
  /**
   * Fetch the next page of results.
   *
   * @param numItems - Number of items to request. Defaults to `initialNumItems`.
   * A no-op when `hasMore` is `false`, `isLoadingMore` is `true`, or an error
   * occurred.
   */
  loadMore(numItems?: number): Promise<void> | void;
}

/**
 * A live, cancellable subscription to a reactive Syncore value.
 *
 * The runtime keeps the watched value up-to-date by re-running the underlying
 * query whenever its data dependencies change. `onUpdate` is called each time a
 * fresh result is available so the subscriber can read the new value with
 * `localQueryResult()`.
 *
 * React’s `useQuery` and Svelte’s `createQueryStore` are built on top of this
 * interface — you only need `SyncoreWatch` directly when integrating with
 * frameworks outside the first-party adapters.
 *
 * ```ts
 * const watch = client.watchQuery(api.tasks.list);
 * const unsubscribe = watch.onUpdate(() => {
 *   console.log(watch.localQueryResult());
 * });
 * // Later:
 * unsubscribe();
 * watch.dispose?.();
 * ```
 */
export interface SyncoreWatch<TValue> {
  /**
   * Register a callback to be called whenever the watched value changes.
   * @returns An `unsubscribe` function; call it to stop receiving updates.
   */
  onUpdate(callback: () => void): () => void;
  /** Return the latest available query result, or `undefined` if not yet loaded. */
  localQueryResult(): TValue | undefined;
  /** Return the error from the last failed execution, or `undefined` on success. */
  localQueryError(): Error | undefined;
  /**
   * Release all resources held by this watch handle.
   *
   * Call this when the subscriber is unmounted or the watch is no longer needed
   * to prevent memory leaks. Framework adapters call this automatically.
   */
  dispose?(): void;
}

export interface FilterBuilder {
  eq(field: string, value: unknown): QueryExpression;
  gt(field: string, value: unknown): QueryExpression;
  gte(field: string, value: unknown): QueryExpression;
  lt(field: string, value: unknown): QueryExpression;
  lte(field: string, value: unknown): QueryExpression;
  and(...expressions: QueryExpression[]): QueryExpression;
  or(...expressions: QueryExpression[]): QueryExpression;
}

export interface IndexRangeBuilder<TFieldName extends string = string> {
  eq(field: TFieldName, value: unknown): IndexRangeBuilder<TFieldName>;
  gt(field: TFieldName, value: unknown): IndexRangeBuilder<TFieldName>;
  gte(field: TFieldName, value: unknown): IndexRangeBuilder<TFieldName>;
  lt(field: TFieldName, value: unknown): IndexRangeBuilder<TFieldName>;
  lte(field: TFieldName, value: unknown): IndexRangeBuilder<TFieldName>;
  build(): QueryCondition[];
}

export interface SearchIndexBuilder<
  TSearchField extends string = string,
  TFilterFields extends string | readonly string[] = string
> {
  search(
    field: TSearchField,
    value: string
  ): SearchIndexBuilder<TSearchField, TFilterFields>;
  eq(
    field: SearchIndexFilterField<TFilterFields>,
    value: unknown
  ): SearchIndexBuilder<TSearchField, TFilterFields>;
  build(): SearchQuery;
}

export type SearchIndexFilterField<
  TFilterFields extends string | readonly string[]
> = TFilterFields extends readonly (infer TField)[]
  ? Extract<TField, string>
  : Extract<TFilterFields, string>;

export type TableNames<TSchema extends SyncoreDataModel> = Extract<
  keyof TSchema["tables"],
  string
>;

export type DocumentForTable<
  TSchema extends SyncoreDataModel,
  TTableName extends TableNames<TSchema>
> = InferDocument<TSchema["tables"][TTableName]>;

export type InsertValueForTable<
  TSchema extends SyncoreDataModel,
  TTableName extends TableNames<TSchema>
> = InferTableInput<TSchema["tables"][TTableName]>;

type OptionalPropertyNames<TValue> = TValue extends object
  ? {
      [TKey in keyof TValue]-?: Omit<TValue, TKey> extends TValue
        ? TKey
        : never;
    }[keyof TValue]
  : never;

type PatchValue<TValue> = TValue extends object
  ? {
      [TKey in keyof TValue]?: TKey extends OptionalPropertyNames<TValue>
        ? TValue[TKey] | undefined
        : TValue[TKey];
    }
  : never;

export type PatchValueForTable<
  TSchema extends SyncoreDataModel,
  TTableName extends TableNames<TSchema>
> = PatchValue<InsertValueForTable<TSchema, TTableName>>;

type OptionalArgsTuple<TArgs> =
  Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];

/**
 * Read-only database API available inside Syncore query (and mutation/action)
 * handlers via `ctx.db`.
 *
 * All methods are fully typed against your schema — the table names and
 * returned document shapes are inferred from the `TSchema` type parameter:
 *
 * ```ts
 * // Fetch by ID
 * const task = await ctx.db.get("tasks", taskId);
 *
 * // Chainable query builder
 * const todos = await ctx.db
 *   .query("tasks")
 *   .withIndex("by_status", (q) => q.eq("status", "todo"))
 *   .order("asc")
 *   .take(20);
 *
 * ```
 */
export interface SyncoreDatabaseReader<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> {
  /**
   * Fetch a single document by its `_id`, or `null` if it does not exist.
   *
   * @param table - The table to look in.
   * @param id    - The document’s `_id` string.
   */
  get<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string
  ): Promise<DocumentForTable<TSchema, TTableName> | null>;
  /**
   * Start a chainable {@link QueryBuilder} for the given table.
   *
   * Chain `.withIndex()` or `.withSearchIndex()` to use an index, `.filter()`
   * for additional predicates, `.order()` to control direction, and then a
   * terminal method (`.collect()`, `.first()`, `.take()`, `.paginate()`).
   */
  query<TTableName extends TableNames<TSchema>>(
    table: TTableName
  ): QueryBuilder<
    TSchema["tables"][TTableName],
    DocumentForTable<TSchema, TTableName>
  >;
}

/**
 * Read-write database API available inside Syncore mutation handlers via
 * `ctx.db`. Extends {@link SyncoreDatabaseReader} with write methods that
 * execute atomically within the mutation’s transaction.
 *
 * ```ts
 * // Insert a new document and get its generated _id
 * const id = await ctx.db.insert("tasks", { title: "Buy milk", status: "todo", projectId: null });
 *
 * // Merge a partial update (other fields are preserved)
 * await ctx.db.patch("tasks", id, { status: "done" });
 *
 * // Replace the entire document (all fields must be provided)
 * await ctx.db.replace("tasks", id, { title: "Buy oat milk", status: "todo", projectId: null });
 *
 * // Delete a document
 * await ctx.db.delete("tasks", id);
 * ```
 */
export interface SyncoreDatabaseWriter<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> extends SyncoreDatabaseReader<TSchema> {
  /**
   * Insert a new document and return its generated `_id`.
   *
   * The value must satisfy the table’s validator schema. System fields
   * (`_id`, `_creationTime`) are set automatically.
   */
  insert<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    value: InsertValueForTable<TSchema, TTableName>
  ): Promise<string>;
  /**
   * Merge `value` into the existing document at `id`.
   *
   * Only the keys present in `value` are updated; all other fields retain their
   * current values. Equivalent to a SQL `UPDATE … SET …` for specific columns.
   */
  patch<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string,
    value: PatchValueForTable<TSchema, TTableName>
  ): Promise<void>;
  /**
   * Overwrite the entire document at `id` with `value`.
   *
   * The `_id` and `_creationTime` system fields are preserved; all other
   * fields are replaced. Use `patch` when you only want to change a subset of
   * fields.
   */
  replace<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string,
    value: InsertValueForTable<TSchema, TTableName>
  ): Promise<void>;
  /**
   * Permanently delete the document with the given `id`.
   *
   * A no-op if the document does not exist.
   */
  delete<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string
  ): Promise<void>;
}

/**
 * Blob storage operations exposed to Syncore function handlers via
 * `ctx.storage`.
 *
 * Store large binary objects (images, PDFs, audio files) separately from the
 * SQLite database. Each object gets an opaque `id` that you can persist in a
 * document field for later retrieval.
 *
 * ```ts
 * // In a mutation
 * const id = await ctx.storage.put({
 *   data: imageBuffer,
 *   contentType: "image/png",
 * });
 * await ctx.db.patch("users", userId, { avatarId: id });
 *
 * // In a query
 * const bytes = await ctx.storage.read(user.avatarId);
 * ```
 */
export interface SyncoreStorageApi {
  /**
   * Persist a binary blob and return its auto-generated opaque `id`.
   *
   * Store the returned `id` in a database document to reference the object.
   */
  put(input: StorageWriteInput): Promise<string>;
  /**
   * Return metadata for the stored object, or `null` if it does not exist.
   * Does not fetch the raw bytes — use `read` for that.
   */
  get(id: string): Promise<StorageObject | null>;
  /**
   * Return the raw bytes of the stored object, or `null` if it does not exist.
   */
  read(id: string): Promise<Uint8Array | null>;
  /**
   * Permanently delete the stored object. A no-op if the object does not exist.
   */
  delete(id: string): Promise<void>;
}

/**
 * Job scheduling API available to mutation and action handlers via
 * `ctx.scheduler`.
 *
 * Use `runAfter` and `runAt` to enqueue a mutation or action that runs outside
 * the current transaction — ideal for sending notifications, retrying
 * failed operations, or breaking long workflows into steps.
 *
 * ```ts
 * // Run a cleanup job 24 hours from now
 * await ctx.scheduler.runAfter(
 *   24 * 60 * 60_000,
 *   api.cleanup.deleteExpiredSessions,
 * );
 *
 * // Run at a specific timestamp
 * const tomorrow = Date.now() + 86_400_000;
 * const jobId = await ctx.scheduler.runAt(tomorrow, api.email.sendDigest, { userId });
 *
 * // Cancel if the user opts out before the job fires
 * await ctx.scheduler.cancel(jobId);
 * ```
 */
export interface SchedulerApi {
  /**
   * Enqueue a mutation or action to run after `delayMs` milliseconds.
   *
   * @param delayMs           - Delay from now in milliseconds.
   * @param functionReference - The mutation or action to execute.
   * @param args              - Arguments forwarded to the function.
   * @param misfirePolicy     - Optional policy for missed executions.
   * @returns An opaque job `id` you can pass to `cancel`.
   */
  runAfter<TArgs, TResult>(
    delayMs: number,
    functionReference: FunctionReference<"mutation" | "action", TArgs, TResult>,
    ...args: [...OptionalArgsTuple<TArgs>, misfirePolicy?: MisfirePolicy]
  ): Promise<string>;
  /**
   * Enqueue a mutation or action to run at a specific Unix timestamp (or
   * `Date` object).
   *
   * @param timestamp         - When to run the job (ms since epoch, or a Date).
   * @param functionReference - The mutation or action to execute.
   * @param args              - Arguments forwarded to the function.
   * @param misfirePolicy     - Optional policy for missed executions.
   * @returns An opaque job `id` you can pass to `cancel`.
   */
  runAt<TArgs, TResult>(
    timestamp: number | Date,
    functionReference: FunctionReference<"mutation" | "action", TArgs, TResult>,
    ...args: [...OptionalArgsTuple<TArgs>, misfirePolicy?: MisfirePolicy]
  ): Promise<string>;
  /**
   * Cancel a pending scheduled job by its `id`.
   *
   * A no-op if the job has already executed or was already cancelled.
   */
  cancel(id: string): Promise<void>;
}

/**
 * Execution context injected into every Syncore **query** handler.
 *
 * `ctx` is the first argument of every `query()` handler. It provides
 * read-only database access, storage access, platform capabilities, and the
 * ability to call other queries. The type is generic over the app schema so
 * that `ctx.db` is fully typed against your tables.
 *
 * The generated `QueryCtx` in `syncore/_generated/server.ts` is always
 * preferred over the base type because it is pre-bound to your app schema:
 *
 * ```ts
 * import type { QueryCtx } from "../_generated/server";
 *
 * export const list = query({
 *   args: { projectId: s.optional(s.id("projects")) },
 *   handler: async (ctx: QueryCtx, { projectId }) => {
 *     return ctx.db
 *       .query("tasks")
 *       .withIndex("by_project", (q) =>
 *         projectId ? q.eq("projectId", projectId) : q
 *       )
 *       .collect();
 *   },
 * });
 * ```
 */
export interface QueryCtx<TSchema extends SyncoreDataModel = SyncoreDataModel> {
  /** Read-only access to the local SQLite database. */
  db: SyncoreDatabaseReader<TSchema>;
  /** Blob storage access for reading files and images. */
  storage: SyncoreStorageApi;
  /**
   * Platform capabilities injected at runtime setup (e.g. push notifications,
   * biometrics). `undefined` when no capabilities were configured.
   */
  capabilities?: Readonly<SyncoreCapabilities>;
  /** Structured descriptors for the registered capabilities. */
  capabilityDescriptors?: ReadonlyArray<CapabilityDescriptor>;
  /**
   * Metadata about the Syncore component this function belongs to, if it was
   * installed as part of a component package rather than the root app.
   */
  component?: {
    path: string;
    name: string;
    version: string;
    capabilities: readonly string[];
  };
  /**
   * Call another Syncore query inside this handler.
   *
   * The callee’s read-set is merged into the current query’s dependencies, so
   * any change that would invalidate the callee also invalidates this query.
   */
  runQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
}

/**
 * Execution context injected into every Syncore **mutation** handler.
 *
 * Extends {@link QueryCtx} with a writable database (`ctx.db`), a scheduler,
 * and the ability to call mutations or actions. Everything runs inside a single
 * atomic SQLite transaction that is committed when the handler returns or
 * rolled back if it throws.
 *
 * Use the generated `MutationCtx` from `syncore/_generated/server.ts` so that
 * `ctx.db` is typed to your specific schema:
 *
 * ```ts
 * import type { MutationCtx } from "../_generated/server";
 *
 * export const create = mutation({
 *   args: { title: s.string() },
 *   handler: async (ctx: MutationCtx, { title }) => {
 *     const id = await ctx.db.insert("tasks", {
 *       title,
 *       status: "todo",
 *       projectId: null,
 *     });
 *     // Schedule a follow-up action without blocking the transaction
 *     await ctx.scheduler.runAfter(0, api.tasks.notifyCreated, { id });
 *     return id;
 *   },
 * });
 * ```
 */
export interface MutationCtx<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> extends QueryCtx<TSchema> {
  /** Read-write database access. Changes are committed atomically on handler return. */
  db: SyncoreDatabaseWriter<TSchema>;
  /** Schedule mutations and actions to run outside the current transaction. */
  scheduler: SchedulerApi;
  /**
   * Call another mutation inside this handler’s transaction.
   *
   * The callee shares the current transaction context, so its writes are part
   * of the same atomic commit.
   */
  runMutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
  /**
   * Launch an action from within a mutation. The action runs asynchronously
   * in a separate context **after** the mutation commits.
   */
  runAction<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
}

/**
 * Execution context injected into every Syncore **action** handler.
 *
 * Extends {@link QueryCtx} with a scheduler and the ability to call mutations
 * and other actions. Unlike mutations, actions run **outside** of any
 * transaction, so they can perform long-running or async work (HTTP requests,
 * file I/O, etc.) and delegate writes to mutations.
 *
 * Use the generated `ActionCtx` from `syncore/_generated/server.ts` so the
 * types are bound to your app schema:
 *
 * ```ts
 * import type { ActionCtx } from "../_generated/server";
 *
 * export const importFromApi = action({
 *   args: { projectId: s.id("projects") },
 *   handler: async (ctx: ActionCtx, { projectId }) => {
 *     const data = await fetch("https://api.example.com/tasks").then((r) => r.json());
 *     for (const item of data) {
 *       await ctx.runMutation(api.tasks.create, { title: item.title });
 *     }
 *   },
 * });
 * ```
 */
export interface ActionCtx<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> extends QueryCtx<TSchema> {
  /** Schedule mutations and actions to run at a later time. */
  scheduler: SchedulerApi;
  /**
   * Call a mutation from within this action.
   *
   * Because actions are non-transactional, each `runMutation` call creates its
   * own transaction. If the action fails partway through, earlier mutations are
   * **not** rolled back automatically — design accordingly.
   */
  runMutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
  /** Call another action from within this action. */
  runAction<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
}

/**
 * The client-facing API for calling Syncore functions and subscribing to
 * reactive query results.
 *
 * You obtain a `SyncoreClient` by calling `runtime.createClient()` or, for
 * worker-based browser setups, via the platform adapter’s
 * `createWebWorkerClient()` / `createManagedWebWorkerClient()` helpers.
 *
 * In React, the client is provided to the component tree via
 * {@link SyncoreProvider} and consumed through hooks (`useQuery`,
 * `useMutation`, etc.) — you rarely call these methods directly.
 *
 * ```ts
 * const client = runtime.createClient();
 *
 * // One-shot query
 * const tasks = await client.query(api.tasks.list);
 *
 * // One-shot mutation
 * await client.mutation(api.tasks.create, { title: "Buy milk" });
 *
 * // Reactive subscription
 * const watch = client.watchQuery(api.tasks.list);
 * watch.onUpdate(() => console.log(watch.localQueryResult()));
 * ```
 */
export interface SyncoreClient {
  /**
   * Execute a query and return its result.
   *
   * Unlike a reactive subscription, this is a one-shot call that does not
   * stay up to date. Use `watchQuery` or the `useQuery` hook for live data.
   */
  query<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
  /**
   * Execute a mutation and return its result.
   *
   * The mutation runs atomically and all affected queries are automatically
   * re-executed after the commit.
   */
  mutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
  /**
   * Execute an action and return its result.
   *
   * Actions are non-transactional and may take arbitrarily long to complete.
   */
  action<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
  /**
   * Subscribe to a reactive query and return a {@link SyncoreWatch} handle.
   *
   * The watch delivers a new result every time the underlying data changes.
   * Call `watch.onUpdate()` to listen and `watch.dispose()` when done.
   */
  watchQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): SyncoreWatch<TResult>;
  /**
   * Subscribe to the runtime’s lifecycle status.
   *
   * Useful for showing loading or error states in the UI while the runtime is
   * starting or recovering.
   */
  watchRuntimeStatus(): SyncoreWatch<SyncoreRuntimeStatus>;
}

export interface SyncoreRuntimeAdmin<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> {
  prepareForDirectAccess(): Promise<void>;
  createClient(): SyncoreClient;
  runQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    args?: JsonObject,
    meta?: DevtoolsEventMeta
  ): Promise<TResult>;
  runMutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    args?: JsonObject,
    meta?: DevtoolsEventMeta
  ): Promise<TResult>;
  runAction<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    args?: JsonObject,
    meta?: DevtoolsEventMeta
  ): Promise<TResult>;
  runDevtoolsMutation<TResult>(
    callback: (ctx: { db: SyncoreDatabaseWriter<TSchema> }) => Promise<TResult>,
    meta?: DevtoolsEventMeta
  ): Promise<TResult>;
  getRuntimeSummary(): SyncoreRuntimeSummary;
  getActiveQueryInfos(): SyncoreActiveQueryInfo[];
  getRuntimeId(): string;
  getDriverDatabasePath(): string | undefined;
  subscribeToDevtoolsEvents(
    listener: (event: SyncoreDevtoolsEvent) => void
  ): () => void;
  subscribeToDevtoolsInvalidations(
    listener: (scopes: Set<DevtoolsLiveQueryScope>) => void
  ): () => void;
  notifyDevtoolsScopes(scopes: Iterable<DevtoolsLiveQueryScope>): void;
  forceRefreshDevtools(
    reason: string,
    scopes?: Iterable<ImpactScope>,
    meta?: DevtoolsEventMeta
  ): Promise<void>;
  listStorageObjects(options?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{ entries: StorageEntry[]; totalCount: number }>;
  getStorageObjectAccessInfo(id: string): Promise<{
    entry: StorageEntry;
    supportsRange: boolean;
  } | null>;
  readStorageObjectRange(
    id: string,
    offset: number,
    length: number
  ): Promise<{
    entry: StorageEntry;
    bytes: Uint8Array;
    offset: number;
    bytesRead: number;
    done: boolean;
    supportsRange: boolean;
  } | null>;
  deleteStorageObject(id: string, meta?: DevtoolsEventMeta): Promise<boolean>;
  cancelScheduledJob(id: string): Promise<boolean>;
  updateScheduledJob(options: UpdateScheduledJobOptions): Promise<boolean>;
}

type DevtoolsEventMeta = {
  origin?: SyncoreDevtoolsEventOrigin;
  executionId?: string;
  parentExecutionId?: string;
  schedulerJobId?: string;
  schedulerRun?: boolean;
};

/**
 * Chainable query builder returned by `ctx.db.query(tableName)`.
 *
 * Chain methods in this order to build up a query:
 *
 * 1. **Optional** — `.withIndex()` or `.withSearchIndex()` to use an index.
 * 2. **Optional** — `.filter()` to add arbitrary field predicates.
 * 3. **Optional** — `.order()` to control sort direction (defaults to `"asc"`).
 * 4. **Required terminal** — `.collect()`, `.take()`, `.first()`, `.unique()`,
 *    or `.paginate()`.
 *
 * ```ts
 * // Fetch all tasks in a project, newest first, limited to 10
 * const tasks = await ctx.db
 *   .query("tasks")
 *   .withIndex("by_project", (q) => q.eq("projectId", id))
 *   .order("desc")
 *   .take(10);
 *
 * // Full-text search with a filter
 * const results = await ctx.db
 *   .query("tasks")
 *   .withSearchIndex("search_title", (q) =>
 *     q.search("title", searchText).eq("status", "todo")
 *   )
 *   .collect();
 * ```
 */
export interface QueryBuilder<
  TTable extends AnyTableDefinition,
  TDocument = InferDocument<TTable>
> {
  /**
   * Restrict the query to documents matching an index range.
   *
   * @param indexName - The name of the index to use (must be registered via `defineTable().index()`).
   * @param builder   - Optional callback that receives an `IndexRangeBuilder` and returns it
   *   after chaining `eq`, `gt`, `gte`, `lt`, `lte` calls. Omit to return all documents in
   *   index order.
   */
  withIndex<TIndexName extends TableIndexNames<TTable>>(
    indexName: TIndexName,
    builder?: (
      range: IndexRangeBuilder<TableIndexFields<TTable, TIndexName>[number]>
    ) => IndexRangeBuilder<TableIndexFields<TTable, TIndexName>[number]>
  ): this;
  /**
   * Restrict the query to documents matching a full-text search index.
   *
   * @param indexName - The name of the search index (must be registered via `defineTable().searchIndex()`).
   * @param builder   - Callback that calls `.search(field, text)` and optionally chains
   *   `.eq(filterField, value)` conditions.
   */
  withSearchIndex<TIndexName extends TableSearchIndexNames<TTable>>(
    indexName: TIndexName,
    builder: (
      search: SearchIndexBuilder<
        TableSearchIndexConfig<TTable, TIndexName>["searchField"],
        TableSearchIndexConfig<TTable, TIndexName>["filterFields"]
      >
    ) => SearchIndexBuilder<
      TableSearchIndexConfig<TTable, TIndexName>["searchField"],
      TableSearchIndexConfig<TTable, TIndexName>["filterFields"]
    >
  ): this;
  /**
   * Set the iteration order for this query. Defaults to `"asc"`.
   *
   * When used with `withIndex`, the order applies to the index's primary sort key.
   * When used without an index (full table scan), `"asc"` and `"desc"` refer to
   * insertion order.
   */
  order(order: "asc" | "desc"): this;
  /**
   * Add an additional in-memory predicate that is applied after index
   * evaluation.
   *
   * Use this for conditions that cannot be expressed as an index range (e.g.
   * checking a field not covered by the active index). Heavy use of `filter`
   * on large tables causes a full index scan — prefer dedicated indexes for
   * frequently filtered fields.
   */
  filter(builder: (filter: FilterBuilder) => QueryExpression): this;
  /** Execute the query and return all matching documents as an array. */
  collect(): Promise<TDocument[]>;
  /**
   * Execute the query and return at most `count` documents.
   *
   * More efficient than `collect()` when you only need a limited number of
   * results.
   */
  take(count: number): Promise<TDocument[]>;
  /**
   * Execute the query and return the first matching document, or `null` if
   * there are no results.
   */
  first(): Promise<TDocument | null>;
  /**
   * Execute the query and return the single matching document, or `null` if
   * there are no results. Throws if more than one document matches.
   *
   * Use when you expect exactly zero or one result (e.g. a unique index
   * lookup).
   */
  unique(): Promise<TDocument | null>;
  /**
   * Execute the query with cursor-based pagination.
   *
   * Pass `PaginationOptions` (a `cursor` and `numItems`) to fetch one page at
   * a time. The returned `PaginationResult` contains the page items, the next
   * cursor, and an `isDone` flag.
   */
  paginate(options: PaginationOptions): Promise<PaginationResult<TDocument>>;
}

/**
 * Local-first Syncore runtime that hosts your schema, functions, and storage.
 *
 * `SyncoreRuntime` is the central engine of every Syncore app. It owns the
 * SQLite driver, the storage adapter, the reactivity engine, and the
 * background scheduler. Platform-specific factory functions
 * (`createNodeSyncoreRuntime`, `createWebSyncoreRuntime`, etc.) wrap it with
 * environment-appropriate defaults so you rarely need to instantiate it
 * directly.
 *
 * **Lifecycle**
 * 1. Construct the runtime (schema migration is deferred until first use).
 * 2. Call `await runtime.start()` to apply the schema, start the scheduler,
 *    and connect to devtools. The runtime emits `"runtime.connected"` when ready.
 * 3. Call `runtime.createClient()` to get a {@link SyncoreClient} for
 *    invoking functions and subscribing to reactive queries.
 * 4. Call `await runtime.stop()` on shutdown to flush pending jobs and close
 *    the database.
 *
 * ```ts
 * const runtime = new SyncoreRuntime({
 *   schema,
 *   functions,
 *   driver: new NodeSqliteDriver("./db.sqlite"),
 *   storage: new NodeFileStorageAdapter("./storage"),
 * });
 * await runtime.start();
 * const client = runtime.createClient();
 * ```
 */
export class SyncoreRuntime<TSchema extends SyncoreDataModel> {
  private readonly kernel: RuntimeKernel<TSchema>;

  constructor(private readonly options: SyncoreRuntimeOptions<TSchema>) {
    this.kernel = new RuntimeKernel(options, this);
  }

  /**
   * Start the runtime: apply the schema migration, initialise the scheduler,
   * and connect to devtools (if configured).
   *
   * Must be called and awaited before using the client. Calling `start()`
   * a second time is a no-op.
   */
  async start(): Promise<void> {
    await this.kernel.start();
  }

  /**
   * Prepare the runtime for direct (synchronous) access patterns used by
   * devtools and migration tooling.
   *
   * You do not need to call this in normal application code.
   */
  async prepareForDirectAccess(): Promise<void> {
    await this.kernel.prepareForDirectAccess();
  }

  /**
   * Stop the runtime gracefully.
   *
   * Flushes any pending scheduler jobs, closes the SQLite driver, and
   * disconnects from devtools. Call this when your application is shutting
   * down to avoid database file corruption.
   */
  async stop(): Promise<void> {
    await this.kernel.stop();
  }

  /**
   * Create a new {@link SyncoreClient} bound to this runtime.
   *
   * Multiple clients can be created from the same runtime — they all share
   * the same underlying database and reactivity engine. Usually you only need
   * one client per runtime instance.
   */
  createClient(): SyncoreClient {
    return this.kernel.createClient();
  }

  /**
   * Return the low-level admin API.
   *
   * The admin API exposes devtools introspection, direct query/mutation
   * execution, and scheduler management. It is used by the devtools
   * dashboard and integration tooling — most application code should use
   * the regular `SyncoreClient` instead.
   */
  getAdmin(): SyncoreRuntimeAdmin<TSchema> {
    return this.kernel.admin;
  }

  async runQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    args: JsonObject = {},
    meta: DevtoolsEventMeta = {}
  ): Promise<TResult> {
    return this.kernel.executionEngine.runQuery(reference, args, meta);
  }

  async runMutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    args: JsonObject = {},
    meta: DevtoolsEventMeta = {}
  ): Promise<TResult> {
    return this.kernel.executionEngine.runMutation(reference, args, meta);
  }

  async runAction<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    args: JsonObject = {},
    meta: DevtoolsEventMeta = {}
  ): Promise<TResult> {
    return this.kernel.executionEngine.runAction(reference, args, meta);
  }

  watchQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    args: JsonObject = {}
  ): SyncoreWatch<TResult> {
    return this.kernel.watchQuery(reference, args);
  }
}

export function createFunctionReference<
  TKind extends SyncoreFunctionKind,
  TArgs = Record<never, never>,
  TResult = unknown
>(kind: TKind, name: string): FunctionReference<TKind, TArgs, TResult> {
  return { kind, name };
}

/**
 * Create a function reference from an existing Syncore function definition
 * while preserving its inferred args and result types.
 */
export function createFunctionReferenceFor<
  TDefinition extends {
    kind: SyncoreFunctionKind;
    argsValidator: Validator<unknown, unknown, string>;
    returnsValidator?: Validator<unknown, unknown, string>;
  }
>(
  kind: FunctionKindFromDefinition<TDefinition>,
  name: string
): FunctionReference<
  FunctionKindFromDefinition<TDefinition>,
  FunctionArgsFromDefinition<TDefinition>,
  FunctionResultFromDefinition<TDefinition>
> {
  return { kind, name };
}
