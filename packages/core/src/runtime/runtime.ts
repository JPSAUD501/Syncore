import type {
  SyncoreActiveQueryInfo,
  SyncoreDevtoolsEvent,
  SyncoreDevtoolsEventOrigin,
  SyncoreRuntimeSummary
} from "@syncore/devtools-protocol";
import type {
  InferDocument,
  InferTableInput,
  SyncoreSchema,
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

export interface RegisteredSyncoreFunction {
  kind: SyncoreFunctionKind;
  argsValidator: Validator<unknown>;
  returnsValidator?: Validator<unknown>;
  handler: RegisteredSyncoreHandler;
  __syncoreComponent?: SyncoreComponentFunctionMetadata;
}

export interface SyncoreFunctionRegistry {
  readonly [name: string]: RegisteredSyncoreFunction | undefined;
}

export type RegisteredSyncoreHandler = {
  bivarianceHack(ctx: unknown, args: unknown): unknown;
}["bivarianceHack"];

export type JsonObject = Record<string, unknown>;

export type ComparisonOperator = "=" | ">" | ">=" | "<" | "<=";

export type QueryCondition = {
  field: string;
  operator: ComparisonOperator;
  value: unknown;
};

export type QueryExpression =
  | { type: "condition"; condition: QueryCondition }
  | { type: "and"; expressions: QueryExpression[] }
  | { type: "or"; expressions: QueryExpression[] };

export type SearchQuery = {
  searchField: string;
  searchText: string;
  filters: QueryCondition[];
};

export interface RunResult {
  changes: number;
  lastInsertRowid?: number | string;
}

export interface CapabilityDescriptor {
  name: string;
  version: number;
  features?: string[];
  metadata?: Record<string, unknown>;
  optional?: boolean;
}

export type ImpactScope =
  | "runtime.summary"
  | "runtime.activeQueries"
  | "schema.tables"
  | "scheduler.jobs"
  | `table:${string}`
  | `row:${string}:${string}`
  | `storage:${string}`;

export type ImpactSet = ReadonlySet<ImpactScope>;

export interface ExecutionResult<TResult = unknown> {
  result: TResult;
  changedTables: Set<string>;
  storageChanges: Array<{
    storageId: string;
    reason: Extract<SyncoreExternalChangeReason, "storage-put" | "storage-delete">;
  }>;
  scheduledJobs: string[];
  devtoolsEvents: SyncoreDevtoolsEvent[];
  externalChangeRequests: Array<{
    scope: SyncoreExternalChangeScope;
    reason: SyncoreExternalChangeReason;
    changedScopes: ImpactScope[];
  }>;
}

export interface SyncoreSqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<RunResult>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  withTransaction<T>(callback: () => Promise<T>): Promise<T>;
  withSavepoint<T>(name: string, callback: () => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

export type SyncoreExternalChangeScope = "database" | "storage" | "all";

export type SyncoreExternalChangeReason =
  | "commit"
  | "storage-put"
  | "storage-delete"
  | "reconcile";

export interface SyncoreExternalChangeEvent {
  sourceId: string;
  scope: SyncoreExternalChangeScope;
  reason: SyncoreExternalChangeReason;
  timestamp: number;
  revision?: string;
  changedScopes?: ImpactScope[];
  changedTables?: string[];
  storageIds?: string[];
}

export interface SyncoreExternalChangeSignal {
  subscribe(listener: (event: SyncoreExternalChangeEvent) => void): () => void;
  publish(event: SyncoreExternalChangeEvent): void | Promise<void>;
  close?(): void | Promise<void>;
}

export interface SyncoreExternalChangeApplier {
  applyExternalChange(event: SyncoreExternalChangeEvent): Promise<{
    databaseChanged: boolean;
    storageChanged: boolean;
    changedScopes: ImpactScope[];
  }>;
}

/**
 * The payload used when writing a new object through Syncore storage APIs.
 */
export interface StorageWriteInput {
  data: Uint8Array | ArrayBuffer | string;
  contentType?: string;
  fileName?: string;
}

/**
 * Metadata describing a stored object managed by the Syncore storage adapter.
 */
export interface StorageObject {
  id: string;
  path: string;
  size: number;
  contentType: string | null;
}

export interface SyncoreStorageAdapter {
  put(id: string, input: StorageWriteInput): Promise<StorageObject>;
  get(id: string): Promise<StorageObject | null>;
  read(id: string): Promise<Uint8Array | null>;
  delete(id: string): Promise<void>;
  list?(): Promise<StorageObject[]>;
}

export interface DevtoolsSink {
  emit(event: SyncoreDevtoolsEvent): void;
  attachRuntime?(runtime: SyncoreRuntime<AnySyncoreSchema>): void;
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
  | `table:${string}`
  | `storage:${string}`;

export interface SchedulerOptions {
  pollIntervalMs?: number;
  recurringJobs?: RecurringJobDefinition[];
}

export type SyncoreResolvedComponents = readonly ResolvedSyncoreComponent[];

export interface UpdateScheduledJobOptions {
  id: string;
  schedule: RecurringSchedule;
  args: JsonObject;
  misfirePolicy: MisfirePolicy;
  runAt?: number;
}

export interface SyncoreCapabilities {
  [name: string]: unknown;
}

export interface SyncoreRuntimeOptions<TSchema extends AnySyncoreSchema> {
  schema: TSchema;
  functions: SyncoreFunctionRegistry;
  components?: SyncoreResolvedComponents;
  driver: SyncoreSqlDriver;
  storage: SyncoreStorageAdapter;
  externalChangeSignal?: SyncoreExternalChangeSignal;
  externalChangeApplier?: SyncoreExternalChangeApplier;
  capabilities?: SyncoreCapabilities;
  capabilityDescriptors?: CapabilityDescriptor[];
  platform?: string;
  devtools?: DevtoolsSink;
  scheduler?: SchedulerOptions;
}

export interface PaginationOptions {
  cursor?: string | null;
  numItems: number;
}

export interface PaginationResult<TItem> {
  page: TItem[];
  cursor: string | null;
  isDone: boolean;
}

export type SyncoreRuntimeStatusKind =
  | "starting"
  | "ready"
  | "recovering"
  | "unavailable"
  | "error";

export type SyncoreRuntimeStatusReason =
  | "booting"
  | "rehydrating"
  | "worker-restarting"
  | "worker-unavailable"
  | "ipc-unavailable"
  | "runtime-unavailable"
  | "disposed";

export interface SyncoreRuntimeStatus {
  kind: SyncoreRuntimeStatusKind;
  reason?: SyncoreRuntimeStatusReason;
  error?: Error;
}

export type SyncoreQueryStatus =
  | "loading"
  | "success"
  | "error"
  | "skipped";

export interface SyncoreQueryState<TData> {
  data: TData | undefined;
  error: Error | undefined;
  status: SyncoreQueryStatus;
  runtimeStatus: SyncoreRuntimeStatus;
  isLoading: boolean;
  isError: boolean;
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

export type SyncorePaginatedQueryStatus =
  | "loading"
  | "ready"
  | "loadingMore"
  | "exhausted"
  | "error";

export interface UsePaginatedQueryResult<TItem> {
  results: TItem[];
  pages: PaginationResult<TItem>[];
  status: SyncorePaginatedQueryStatus;
  error: Error | undefined;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  cursor: string | null;
  runtimeStatus: SyncoreRuntimeStatus;
  loadMore(numItems?: number): Promise<void> | void;
}

export interface SyncoreWatch<TValue> {
  onUpdate(callback: () => void): () => void;
  localQueryResult(): TValue | undefined;
  localQueryError(): Error | undefined;
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

export interface IndexRangeBuilder {
  eq(field: string, value: unknown): IndexRangeBuilder;
  gt(field: string, value: unknown): IndexRangeBuilder;
  gte(field: string, value: unknown): IndexRangeBuilder;
  lt(field: string, value: unknown): IndexRangeBuilder;
  lte(field: string, value: unknown): IndexRangeBuilder;
  build(): QueryCondition[];
}

export interface SearchIndexBuilder {
  search(field: string, value: string): SearchIndexBuilder;
  eq(field: string, value: unknown): SearchIndexBuilder;
  build(): SearchQuery;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySyncoreSchema = SyncoreSchema<any>;

export type TableNames<TSchema extends AnySyncoreSchema> = Extract<
  keyof TSchema["tables"],
  string
>;

export type DocumentForTable<
  TSchema extends AnySyncoreSchema,
  TTableName extends TableNames<TSchema>
> = InferDocument<TSchema["tables"][TTableName]>;

export type InsertValueForTable<
  TSchema extends AnySyncoreSchema,
  TTableName extends TableNames<TSchema>
> = InferTableInput<TSchema["tables"][TTableName]>;

type OptionalArgsTuple<TArgs> =
  Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];

export interface SyncoreDatabaseReader<
  TSchema extends AnySyncoreSchema = AnySyncoreSchema
> {
  get<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string
  ): Promise<DocumentForTable<TSchema, TTableName> | null>;
  query<TTableName extends TableNames<TSchema>>(
    table: TTableName
  ): QueryBuilder<DocumentForTable<TSchema, TTableName>>;
  raw<TValue = unknown>(sql: string, params?: unknown[]): Promise<TValue[]>;
}

export interface SyncoreDatabaseWriter<
  TSchema extends AnySyncoreSchema = AnySyncoreSchema
> extends SyncoreDatabaseReader<TSchema> {
  insert<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    value: InsertValueForTable<TSchema, TTableName>
  ): Promise<string>;
  patch<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string,
    value: Partial<InsertValueForTable<TSchema, TTableName>>
  ): Promise<void>;
  replace<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string,
    value: InsertValueForTable<TSchema, TTableName>
  ): Promise<void>;
  delete<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string
  ): Promise<void>;
}

/**
 * Storage operations exposed to Syncore functions and clients.
 */
export interface SyncoreStorageApi {
  put(input: StorageWriteInput): Promise<string>;
  get(id: string): Promise<StorageObject | null>;
  read(id: string): Promise<Uint8Array | null>;
  delete(id: string): Promise<void>;
}

export interface SchedulerApi {
  runAfter<TArgs, TResult>(
    delayMs: number,
    functionReference: FunctionReference<"mutation" | "action", TArgs, TResult>,
    ...args: [...OptionalArgsTuple<TArgs>, misfirePolicy?: MisfirePolicy]
  ): Promise<string>;
  runAt<TArgs, TResult>(
    timestamp: number | Date,
    functionReference: FunctionReference<"mutation" | "action", TArgs, TResult>,
    ...args: [...OptionalArgsTuple<TArgs>, misfirePolicy?: MisfirePolicy]
  ): Promise<string>;
  cancel(id: string): Promise<void>;
}

/**
 * Context available inside Syncore query handlers.
 */
export interface QueryCtx<TSchema extends AnySyncoreSchema = AnySyncoreSchema> {
  db: SyncoreDatabaseReader<TSchema>;
  storage: SyncoreStorageApi;
  capabilities?: Readonly<SyncoreCapabilities>;
  capabilityDescriptors?: ReadonlyArray<CapabilityDescriptor>;
  component?: {
    path: string;
    name: string;
    version: string;
    capabilities: readonly string[];
  };
  runQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
}

/**
 * Context available inside Syncore mutation handlers.
 */
export interface MutationCtx<
  TSchema extends AnySyncoreSchema = AnySyncoreSchema
> extends QueryCtx<TSchema> {
  db: SyncoreDatabaseWriter<TSchema>;
  scheduler: SchedulerApi;
  runMutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
  runAction<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
}

/**
 * Context available inside Syncore action handlers.
 */
export interface ActionCtx<
  TSchema extends AnySyncoreSchema = AnySyncoreSchema
> extends QueryCtx<TSchema> {
  scheduler: SchedulerApi;
  runMutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
  runAction<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
}

/**
 * Client API for invoking Syncore queries, mutations, actions, and watches.
 */
export interface SyncoreClient {
  query<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
  mutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
  action<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
  watchQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): SyncoreWatch<TResult>;
  watchRuntimeStatus(): SyncoreWatch<SyncoreRuntimeStatus>;
}

export interface SyncoreRuntimeAdmin<
  TSchema extends AnySyncoreSchema = AnySyncoreSchema
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
  cancelScheduledJob(id: string): Promise<boolean>;
  updateScheduledJob(options: UpdateScheduledJobOptions): Promise<boolean>;
}

type DevtoolsEventMeta = {
  origin?: SyncoreDevtoolsEventOrigin;
};

/**
 * Chainable query builder returned by `ctx.db.query(...)`.
 */
export interface QueryBuilder<TDocument> {
  withIndex(
    indexName: string,
    builder?: (range: IndexRangeBuilder) => IndexRangeBuilder
  ): this;
  withSearchIndex(
    indexName: string,
    builder: (search: SearchIndexBuilder) => SearchIndexBuilder
  ): this;
  order(order: "asc" | "desc"): this;
  filter(builder: (filter: FilterBuilder) => QueryExpression): this;
  collect(): Promise<TDocument[]>;
  take(count: number): Promise<TDocument[]>;
  first(): Promise<TDocument | null>;
  unique(): Promise<TDocument | null>;
  paginate(options: PaginationOptions): Promise<PaginationResult<TDocument>>;
}

/**
 * Local-first Syncore runtime that hosts your schema, functions, and storage.
 */
export class SyncoreRuntime<TSchema extends AnySyncoreSchema> {
  private readonly kernel: RuntimeKernel<TSchema>;

  constructor(private readonly options: SyncoreRuntimeOptions<TSchema>) {
    this.kernel = new RuntimeKernel(
      options,
      this as unknown as SyncoreRuntime<AnySyncoreSchema>
    );
  }

  async start(): Promise<void> {
    await this.kernel.start();
  }

  async prepareForDirectAccess(): Promise<void> {
    await this.kernel.prepareForDirectAccess();
  }

  async stop(): Promise<void> {
    await this.kernel.stop();
  }

  createClient(): SyncoreClient {
    return this.kernel.createClient();
  }

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
    argsValidator: Validator<unknown>;
    returnsValidator?: Validator<unknown>;
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
