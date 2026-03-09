import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type {
  SyncoreDevtoolsEvent,
  SyncoreDevtoolsSnapshot
} from "@syncore/devtools-protocol";
import {
  createSchemaSnapshot,
  diffSchemaSnapshots,
  type InferDocument,
  type InferTableInput,
  parseSchemaSnapshot,
  renderCreateSearchIndexStatement,
  renderMigrationSql,
  searchIndexTableName,
  type SyncoreSchema,
  type TableDefinition,
  type Validator
} from "@syncore/schema";
import {
  type FunctionArgsFromDefinition,
  type FunctionKindFromDefinition,
  type FunctionReference,
  type FunctionResultFromDefinition,
  type MisfirePolicy,
  type RecurringJobDefinition,
  type RecurringSchedule,
  type SyncoreFunctionKind,
  type SyncoreFunctionDefinition
} from "./functions.js";
import { generateId } from "./id.js";

const DEFAULT_MISFIRE_POLICY: MisfirePolicy = { type: "catch_up" };

export interface RegisteredSyncoreFunction {
  kind: SyncoreFunctionKind;
  argsValidator: Validator<unknown>;
  returnsValidator?: Validator<unknown>;
  handler: RegisteredSyncoreHandler;
}

export interface SyncoreFunctionRegistry {
  readonly [name: string]: RegisteredSyncoreFunction | undefined;
}
export type RegisteredSyncoreHandler = {
  bivarianceHack(ctx: unknown, args: unknown): unknown;
}["bivarianceHack"];

export type JsonObject = Record<string, unknown>;

type DatabaseRow = {
  _id: string;
  _creationTime: number;
  _json: string;
};

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

type DependencyKey = string;

type ActiveQueryRecord = {
  id: string;
  functionName: string;
  args: JsonObject;
  listeners: Set<() => void>;
  consumers: number;
  dependencyKeys: Set<DependencyKey>;
  lastResult: unknown;
  lastError: Error | undefined;
  lastRunAt: number;
};

type ScheduledJobRow = {
  id: string;
  function_name: string;
  function_kind: SyncoreFunctionKind;
  args_json: string;
  status: "scheduled" | "completed" | "failed" | "cancelled" | "skipped";
  run_at: number;
  created_at: number;
  updated_at: number;
  recurring_name: string | null;
  schedule_json: string | null;
  timezone: string | null;
  misfire_policy: string;
  last_run_at: number | null;
  window_ms: number | null;
};

type StorageMetadataRow = {
  _id: string;
  _creationTime: number;
  file_name: string | null;
  content_type: string | null;
  size: number;
  path: string;
};

type StoragePendingRow = {
  _id: string;
  _creationTime: number;
  file_name: string | null;
  content_type: string | null;
};

export interface RunResult {
  changes: number;
  lastInsertRowid?: number | string;
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

/**
 * The binary or text payload written through Syncore storage APIs.
 */
export interface StorageWriteInput {
  data: Uint8Array | ArrayBuffer | string;
  contentType?: string;
  fileName?: string;
}

/**
 * Metadata about an object stored through Syncore storage APIs.
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
}

export interface SchedulerOptions {
  pollIntervalMs?: number;
  recurringJobs?: RecurringJobDefinition[];
}

export interface SyncoreCapabilities {
  [name: string]: unknown;
}

export interface SyncoreExperimentalPluginContext<
  TSchema extends AnySyncoreSchema
> {
  runtimeId: string;
  platform: string;
  schema: TSchema;
  driver: SyncoreSqlDriver;
  storage: SyncoreStorageAdapter;
  scheduler?: SchedulerOptions;
  devtools?: DevtoolsSink;
  emitDevtools(event: SyncoreDevtoolsEvent): void;
}

export interface SyncoreExperimentalPlugin<TSchema extends AnySyncoreSchema> {
  name: string;
  capabilities?:
    | SyncoreCapabilities
    | ((
        context: SyncoreExperimentalPluginContext<TSchema>
      ) => SyncoreCapabilities | void);
  onStart?(
    context: SyncoreExperimentalPluginContext<TSchema>
  ): Promise<void> | void;
  onStop?(
    context: SyncoreExperimentalPluginContext<TSchema>
  ): Promise<void> | void;
}

export interface SyncoreRuntimeOptions<TSchema extends AnySyncoreSchema> {
  schema: TSchema;
  functions: SyncoreFunctionRegistry;
  driver: SyncoreSqlDriver;
  storage: SyncoreStorageAdapter;
  capabilities?: SyncoreCapabilities;
  experimentalPlugins?: Array<SyncoreExperimentalPlugin<TSchema>>;
  platform?: string;
  devtools?: DevtoolsSink;
  scheduler?: SchedulerOptions;
}

export interface PaginationOptions {
  cursor?: string | null;
  numItems: number;
}

export interface PaginationResult<TItem> {
  /** The current page of results. */
  page: TItem[];

  /** The cursor to pass to the next page request, or `null` when finished. */
  cursor: string | null;

  /** Whether there are no more pages to read. */
  isDone: boolean;
}

export interface SyncoreWatch<TValue> {
  /** Subscribe to updates for this query watch. */
  onUpdate(callback: () => void): () => void;

  /** Read the latest local query result, if one is available. */
  localQueryResult(): TValue | undefined;

  /** Read the latest local query error, if one is available. */
  localQueryError(): Error | undefined;

  /** Dispose the watch if the implementation exposes explicit cleanup. */
  dispose?(): void;
}

export interface FilterBuilder {
  /** Match documents whose field is exactly equal to a value. */
  eq(field: string, value: unknown): QueryExpression;

  /** Match documents whose field is greater than a value. */
  gt(field: string, value: unknown): QueryExpression;

  /** Match documents whose field is greater than or equal to a value. */
  gte(field: string, value: unknown): QueryExpression;

  /** Match documents whose field is less than a value. */
  lt(field: string, value: unknown): QueryExpression;

  /** Match documents whose field is less than or equal to a value. */
  lte(field: string, value: unknown): QueryExpression;

  /** Combine several filter expressions with logical AND. */
  and(...expressions: QueryExpression[]): QueryExpression;

  /** Combine several filter expressions with logical OR. */
  or(...expressions: QueryExpression[]): QueryExpression;
}

export interface IndexRangeBuilder {
  /** Constrain an indexed field to an exact value. */
  eq(field: string, value: unknown): IndexRangeBuilder;

  /** Constrain an indexed field to values greater than a value. */
  gt(field: string, value: unknown): IndexRangeBuilder;

  /** Constrain an indexed field to values greater than or equal to a value. */
  gte(field: string, value: unknown): IndexRangeBuilder;

  /** Constrain an indexed field to values less than a value. */
  lt(field: string, value: unknown): IndexRangeBuilder;

  /** Constrain an indexed field to values less than or equal to a value. */
  lte(field: string, value: unknown): IndexRangeBuilder;

  /** Finish building the index range. */
  build(): QueryCondition[];
}

export interface SearchIndexBuilder {
  /** Set the text field and text to search for. */
  search(field: string, value: string): SearchIndexBuilder;

  /** Add an equality filter alongside the text search. */
  eq(field: string, value: unknown): SearchIndexBuilder;

  /** Finish building the search query. */
  build(): SearchQuery;
}

// SyncoreSchema is not practically expressible here without losing assignability
// across concrete schema instances, so the public constraint stays intentionally broad.
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
  /** Read a single document by table name and id. */
  get<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string
  ): Promise<DocumentForTable<TSchema, TTableName> | null>;

  /** Start building a table query. */
  query<TTableName extends TableNames<TSchema>>(
    table: TTableName
  ): QueryBuilder<DocumentForTable<TSchema, TTableName>>;

  /** Run raw SQL against the local Syncore database. */
  raw<TValue = unknown>(sql: string, params?: unknown[]): Promise<TValue[]>;
}

export interface SyncoreDatabaseWriter<
  TSchema extends AnySyncoreSchema = AnySyncoreSchema
> extends SyncoreDatabaseReader<TSchema> {
  /** Insert a new document into a table and return its generated id. */
  insert<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    value: InsertValueForTable<TSchema, TTableName>
  ): Promise<string>;

  /** Apply a partial update to an existing document. */
  patch<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string,
    value: Partial<InsertValueForTable<TSchema, TTableName>>
  ): Promise<void>;

  /** Replace an existing document with a full new value. */
  replace<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string,
    value: InsertValueForTable<TSchema, TTableName>
  ): Promise<void>;

  /** Delete a document from a table. */
  delete<TTableName extends TableNames<TSchema>>(
    table: TTableName,
    id: string
  ): Promise<void>;
}

/**
 * The storage API exposed inside Syncore runtime contexts.
 */
export interface SyncoreStorageApi {
  /** Store a file-like payload locally and return its generated id. */
  put(input: StorageWriteInput): Promise<string>;

  /** Read metadata for a stored object. */
  get(id: string): Promise<StorageObject | null>;

  /** Read the stored bytes for an object. */
  read(id: string): Promise<Uint8Array | null>;

  /** Delete a stored object. */
  delete(id: string): Promise<void>;
}

export interface SchedulerApi {
  /** Schedule a mutation or action to run after a delay. */
  runAfter<TArgs, TResult>(
    delayMs: number,
    functionReference: FunctionReference<"mutation" | "action", TArgs, TResult>,
    ...args: [...OptionalArgsTuple<TArgs>, misfirePolicy?: MisfirePolicy]
  ): Promise<string>;

  /** Schedule a mutation or action to run at a specific time. */
  runAt<TArgs, TResult>(
    timestamp: number | Date,
    functionReference: FunctionReference<"mutation" | "action", TArgs, TResult>,
    ...args: [...OptionalArgsTuple<TArgs>, misfirePolicy?: MisfirePolicy]
  ): Promise<string>;

  /** Cancel a previously scheduled job. */
  cancel(id: string): Promise<void>;
}

/**
 * The context object available inside Syncore queries.
 */
export interface QueryCtx<TSchema extends AnySyncoreSchema = AnySyncoreSchema> {
  /** Read-only database access for this query. */
  db: SyncoreDatabaseReader<TSchema>;

  /** Local file/blob storage for this runtime. */
  storage: SyncoreStorageApi;

  /** Optional adapter or plugin capabilities exposed by the runtime. */
  capabilities?: Readonly<SyncoreCapabilities>;

  /** Call another Syncore query from inside this query. */
  runQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
}

/**
 * The context object available inside Syncore mutations.
 */
export interface MutationCtx<
  TSchema extends AnySyncoreSchema = AnySyncoreSchema
> extends QueryCtx<TSchema> {
  db: SyncoreDatabaseWriter<TSchema>;

  /** Schedule future work from this mutation. */
  scheduler: SchedulerApi;

  /** Call another mutation from inside this mutation. */
  runMutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;

  /** Call an action from this mutation. */
  runAction<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
}

/**
 * The context object available inside Syncore actions.
 */
export interface ActionCtx<
  TSchema extends AnySyncoreSchema = AnySyncoreSchema
> extends QueryCtx<TSchema> {
  /** Schedule future work from this action. */
  scheduler: SchedulerApi;

  /** Call a mutation from this action. */
  runMutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;

  /** Call another action from this action. */
  runAction<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;
}

/**
 * The typed client API exposed by a Syncore runtime.
 */
export interface SyncoreClient {
  /** Fetch a query result once. */
  query<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;

  /** Execute a mutation. */
  mutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;

  /** Execute an action. */
  action<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult>;

  /** Subscribe to a query and receive reactive updates. */
  watchQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): SyncoreWatch<TResult>;
}

class RuntimeFilterBuilder implements FilterBuilder {
  eq(field: string, value: unknown): QueryExpression {
    return { type: "condition", condition: { field, operator: "=", value } };
  }

  gt(field: string, value: unknown): QueryExpression {
    return { type: "condition", condition: { field, operator: ">", value } };
  }

  gte(field: string, value: unknown): QueryExpression {
    return { type: "condition", condition: { field, operator: ">=", value } };
  }

  lt(field: string, value: unknown): QueryExpression {
    return { type: "condition", condition: { field, operator: "<", value } };
  }

  lte(field: string, value: unknown): QueryExpression {
    return { type: "condition", condition: { field, operator: "<=", value } };
  }

  and(...expressions: QueryExpression[]): QueryExpression {
    return { type: "and", expressions };
  }

  or(...expressions: QueryExpression[]): QueryExpression {
    return { type: "or", expressions };
  }
}

class RuntimeIndexRangeBuilder implements IndexRangeBuilder {
  private readonly conditions: QueryCondition[] = [];

  eq(field: string, value: unknown): IndexRangeBuilder {
    this.conditions.push({ field, operator: "=", value });
    return this;
  }

  gt(field: string, value: unknown): IndexRangeBuilder {
    this.conditions.push({ field, operator: ">", value });
    return this;
  }

  gte(field: string, value: unknown): IndexRangeBuilder {
    this.conditions.push({ field, operator: ">=", value });
    return this;
  }

  lt(field: string, value: unknown): IndexRangeBuilder {
    this.conditions.push({ field, operator: "<", value });
    return this;
  }

  lte(field: string, value: unknown): IndexRangeBuilder {
    this.conditions.push({ field, operator: "<=", value });
    return this;
  }

  build(): QueryCondition[] {
    return [...this.conditions];
  }
}

class RuntimeSearchIndexBuilder implements SearchIndexBuilder {
  private searchField: string | undefined;
  private searchText: string | undefined;
  private readonly filters: QueryCondition[] = [];

  search(field: string, value: string): SearchIndexBuilder {
    this.searchField = field;
    this.searchText = value;
    return this;
  }

  eq(field: string, value: unknown): SearchIndexBuilder {
    this.filters.push({ field, operator: "=", value });
    return this;
  }

  build(): SearchQuery {
    if (!this.searchField || !this.searchText) {
      throw new Error("Search queries require a search field and search text.");
    }
    return {
      searchField: this.searchField,
      searchText: this.searchText,
      filters: [...this.filters]
    };
  }
}

type QuerySource =
  | { type: "table" }
  | { type: "index"; name: string; range: QueryCondition[] }
  | { type: "search"; name: string; query: SearchQuery };

type ExecuteQueryBuilderOptions = {
  tableName: string;
  source: QuerySource;
  filterExpression: QueryExpression | undefined;
  orderDirection: "asc" | "desc";
  dependencyCollector?: Set<DependencyKey>;
  limit?: number;
  offset?: number;
};

type RuntimeExecutionState = {
  mutationDepth: number;
  changedTables: Set<string>;
  dependencyCollector?: Set<DependencyKey>;
};

/**
 * A composable builder for Syncore table queries.
 */
export interface QueryBuilder<TDocument> {
  /** Query through a named index instead of scanning the whole table. */
  withIndex(
    indexName: string,
    builder?: (range: IndexRangeBuilder) => IndexRangeBuilder
  ): this;

  /** Query through a named search index for text search. */
  withSearchIndex(
    indexName: string,
    builder: (search: SearchIndexBuilder) => SearchIndexBuilder
  ): this;

  /** Set the result ordering. */
  order(order: "asc" | "desc"): this;

  /** Add a filter expression to the query. */
  filter(builder: (filter: FilterBuilder) => QueryExpression): this;

  /** Collect all matching documents. */
  collect(): Promise<TDocument[]>;

  /** Collect up to a fixed number of matching documents. */
  take(count: number): Promise<TDocument[]>;

  /** Return the first matching document, or `null` if none exist. */
  first(): Promise<TDocument | null>;

  /** Return one matching document and throw if multiple rows match. */
  unique(): Promise<TDocument | null>;

  /** Read a paginated slice of documents using a cursor. */
  paginate(options: PaginationOptions): Promise<PaginationResult<TDocument>>;
}

class RuntimeQueryBuilder<TDocument> implements QueryBuilder<TDocument> {
  private orderDirection: "asc" | "desc" = "asc";
  private source: QuerySource = { type: "table" };
  private filterExpression: QueryExpression | undefined;

  constructor(
    private readonly executeQuery: (
      options: ExecuteQueryBuilderOptions
    ) => Promise<TDocument[]>,
    private readonly tableName: string,
    private readonly dependencyCollector?: Set<DependencyKey>
  ) {}

  withIndex(
    indexName: string,
    builder?: (range: IndexRangeBuilder) => IndexRangeBuilder
  ): this {
    const indexRange = builder?.(new RuntimeIndexRangeBuilder()).build() ?? [];
    this.source = { type: "index", name: indexName, range: indexRange };
    return this;
  }

  withSearchIndex(
    indexName: string,
    builder: (search: SearchIndexBuilder) => SearchIndexBuilder
  ): this {
    this.source = {
      type: "search",
      name: indexName,
      query: builder(new RuntimeSearchIndexBuilder()).build()
    };
    return this;
  }

  order(order: "asc" | "desc"): this {
    this.orderDirection = order;
    return this;
  }

  filter(builder: (filter: FilterBuilder) => QueryExpression): this {
    this.filterExpression = builder(new RuntimeFilterBuilder());
    return this;
  }

  async collect(): Promise<TDocument[]> {
    return this.execute();
  }

  async take(count: number): Promise<TDocument[]> {
    return this.execute({ limit: count });
  }

  async first(): Promise<TDocument | null> {
    const results = await this.execute({ limit: 1 });
    return results[0] ?? null;
  }

  async unique(): Promise<TDocument | null> {
    const results = await this.execute({ limit: 2 });
    if (results.length > 1) {
      throw new Error("Expected a unique result but found multiple rows.");
    }
    return results[0] ?? null;
  }

  async paginate(
    options: PaginationOptions
  ): Promise<PaginationResult<TDocument>> {
    const offset = options.cursor ? Number.parseInt(options.cursor, 10) : 0;
    const page = await this.execute({ limit: options.numItems, offset });
    const nextCursor =
      page.length < options.numItems ? null : String(offset + page.length);
    return {
      page,
      cursor: nextCursor,
      isDone: nextCursor === null
    };
  }

  private async execute(options?: {
    limit?: number;
    offset?: number;
  }): Promise<TDocument[]> {
    this.dependencyCollector?.add(`table:${this.tableName}`);
    const queryOptions: ExecuteQueryBuilderOptions = {
      tableName: this.tableName,
      source: this.source,
      filterExpression: this.filterExpression,
      orderDirection: this.orderDirection
    };
    if (this.dependencyCollector) {
      queryOptions.dependencyCollector = this.dependencyCollector;
    }
    if (options?.limit !== undefined) {
      queryOptions.limit = options.limit;
    }
    if (options?.offset !== undefined) {
      queryOptions.offset = options.offset;
    }
    return this.executeQuery(queryOptions);
  }
}

/**
 * The local Syncore runtime that owns the database, storage, scheduler, and function execution.
 */
export class SyncoreRuntime<TSchema extends AnySyncoreSchema> {
  private readonly runtimeId = generateId();
  private readonly platform: string;
  private readonly capabilities: Readonly<SyncoreCapabilities>;
  private readonly experimentalPlugins: Array<
    SyncoreExperimentalPlugin<TSchema>
  >;
  private readonly activeQueries = new Map<string, ActiveQueryRecord>();
  private readonly disabledSearchIndexes = new Set<string>();
  private readonly recentEvents: SyncoreDevtoolsEvent[] = [];
  private schedulerTimer: ReturnType<typeof setInterval> | undefined;
  private readonly recurringJobs: RecurringJobDefinition[];
  private readonly schedulerPollIntervalMs: number;
  private started = false;

  constructor(private readonly options: SyncoreRuntimeOptions<TSchema>) {
    this.platform = options.platform ?? "node";
    this.experimentalPlugins = options.experimentalPlugins ?? [];
    this.recurringJobs = options.scheduler?.recurringJobs ?? [];
    this.schedulerPollIntervalMs = options.scheduler?.pollIntervalMs ?? 1000;
    this.capabilities = Object.freeze(this.buildCapabilities());
  }

  /**
   * Start the local Syncore runtime.
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    await this.ensureSystemTables();
    await this.reconcileStorageState();
    await this.applySchema();
    await this.syncRecurringJobs();
    await this.runPluginHook("onStart");
    this.schedulerTimer = setInterval(() => {
      void this.processDueJobs();
    }, this.schedulerPollIntervalMs);
    this.started = true;
    this.emitDevtools({
      type: "runtime.connected",
      runtimeId: this.runtimeId,
      platform: this.platform,
      timestamp: Date.now()
    });
  }

  /**
   * Stop the local Syncore runtime and release any open resources.
   */
  async stop(): Promise<void> {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = undefined;
    }
    if (this.started) {
      await this.runPluginHook("onStop");
    }
    await this.options.driver.close?.();
    if (this.started) {
      this.emitDevtools({
        type: "runtime.disconnected",
        runtimeId: this.runtimeId,
        timestamp: Date.now()
      });
    }
    this.started = false;
  }

  /**
   * Create a typed client for calling this runtime from the same process.
   */
  createClient(): SyncoreClient {
    return {
      query: (reference, ...args) =>
        this.runQuery(reference, normalizeOptionalArgs(args) as JsonObject),
      mutation: (reference, ...args) =>
        this.runMutation(reference, normalizeOptionalArgs(args) as JsonObject),
      action: (reference, ...args) =>
        this.runAction(reference, normalizeOptionalArgs(args) as JsonObject),
      watchQuery: (reference, ...args) =>
        this.watchQuery(reference, normalizeOptionalArgs(args) as JsonObject)
    };
  }

  getDevtoolsSnapshot(): SyncoreDevtoolsSnapshot {
    return {
      runtimeId: this.runtimeId,
      platform: this.platform,
      connectedAt: Date.now(),
      activeQueries: [...this.activeQueries.values()].map((query) => ({
        id: query.id,
        functionName: query.functionName,
        dependencyKeys: [...query.dependencyKeys],
        lastRunAt: query.lastRunAt
      })),
      pendingJobs: [],
      recentEvents: [...this.recentEvents]
    };
  }

  getRuntimeId(): string {
    return this.runtimeId;
  }

  async runQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    args: JsonObject = {}
  ): Promise<TResult> {
    const definition = this.resolveFunction(reference, "query");
    const dependencyCollector = new Set<DependencyKey>();
    const startedAt = Date.now();
    const result = await this.invokeFunction<TResult>(definition, args, {
      mutationDepth: 0,
      changedTables: new Set<string>(),
      dependencyCollector
    });

    this.emitDevtools({
      type: "query.executed",
      runtimeId: this.runtimeId,
      queryId: reference.name,
      functionName: reference.name,
      dependencies: [...dependencyCollector],
      durationMs: Date.now() - startedAt,
      timestamp: Date.now()
    });

    return result;
  }

  async runMutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    args: JsonObject = {}
  ): Promise<TResult> {
    const definition = this.resolveFunction(reference, "mutation");
    const mutationId = generateId();
    const startedAt = Date.now();
    const changedTables = new Set<string>();

    const result = await this.options.driver.withTransaction(async () =>
      this.invokeFunction<TResult>(definition, args, {
        mutationDepth: 1,
        changedTables
      })
    );

    await this.refreshInvalidatedQueries(changedTables, mutationId);

    this.emitDevtools({
      type: "mutation.committed",
      runtimeId: this.runtimeId,
      mutationId,
      functionName: reference.name,
      changedTables: [...changedTables],
      durationMs: Date.now() - startedAt,
      timestamp: Date.now()
    });

    return result;
  }

  async runAction<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    args: JsonObject = {}
  ): Promise<TResult> {
    const definition = this.resolveFunction(reference, "action");
    const actionId = generateId();
    const startedAt = Date.now();

    try {
      const result = await this.invokeFunction<TResult>(definition, args, {
        mutationDepth: 0,
        changedTables: new Set<string>()
      });
      this.emitDevtools({
        type: "action.completed",
        runtimeId: this.runtimeId,
        actionId,
        functionName: reference.name,
        durationMs: Date.now() - startedAt,
        timestamp: Date.now()
      });
      return result;
    } catch (error) {
      this.emitDevtools({
        type: "action.completed",
        runtimeId: this.runtimeId,
        actionId,
        functionName: reference.name,
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  watchQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    args: JsonObject = {}
  ): SyncoreWatch<TResult> {
    const key = this.createActiveQueryKey(reference.name, args);
    let record = this.activeQueries.get(key);

    if (!record) {
      record = {
        id: key,
        functionName: reference.name,
        args,
        listeners: new Set<() => void>(),
        consumers: 0,
        dependencyKeys: new Set<DependencyKey>(),
        lastResult: undefined,
        lastError: undefined,
        lastRunAt: 0
      };
      this.activeQueries.set(key, record);
      void this.rerunActiveQuery(record);
    }

    const activeRecord = record;
    activeRecord.consumers += 1;
    let disposed = false;
    const ownedListeners = new Set<() => void>();

    return {
      onUpdate: (callback) => {
        activeRecord.listeners.add(callback);
        ownedListeners.add(callback);
        queueMicrotask(callback);
        return () => {
          activeRecord.listeners.delete(callback);
          ownedListeners.delete(callback);
        };
      },
      localQueryResult: () => activeRecord.lastResult as TResult | undefined,
      localQueryError: () => activeRecord.lastError,
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        for (const callback of ownedListeners) {
          activeRecord.listeners.delete(callback);
        }
        ownedListeners.clear();
        activeRecord.consumers = Math.max(0, activeRecord.consumers - 1);
        if (activeRecord.consumers === 0) {
          this.activeQueries.delete(key);
        }
      }
    };
  }

  private async executeQueryBuilder<TDocument>(
    options: ExecuteQueryBuilderOptions
  ): Promise<TDocument[]> {
    const table = this.options.schema.getTable(
      options.tableName
    ) as TableDefinition<Validator<unknown>>;
    const params: unknown[] = [];
    const whereClauses: string[] = [];
    const orderClauses: string[] = [];
    let joinClause = "";
    const source = options.source;

    if (source.type === "index") {
      const index = table.indexes.find(
        (candidate) => candidate.name === source.name
      );
      if (!index) {
        throw new Error(
          `Unknown index "${source.name}" on table "${options.tableName}".`
        );
      }
      for (const condition of source.range) {
        whereClauses.push(this.renderCondition("t", condition, params));
      }
      const primaryField = index.fields[0];
      if (primaryField) {
        orderClauses.push(
          `${fieldExpression("t", primaryField)} ${options.orderDirection.toUpperCase()}`
        );
      }
    }

    if (source.type === "search") {
      const searchIndex = table.searchIndexes.find(
        (candidate) => candidate.name === source.name
      );
      if (!searchIndex) {
        throw new Error(
          `Unknown search index "${source.name}" on table "${options.tableName}".`
        );
      }
      if (searchIndex.searchField !== source.query.searchField) {
        throw new Error(
          `Search index "${searchIndex.name}" expects field "${searchIndex.searchField}".`
        );
      }
      const searchIndexKey = `${options.tableName}:${searchIndex.name}`;
      if (this.disabledSearchIndexes.has(searchIndexKey)) {
        whereClauses.push(
          `${fieldExpression("t", searchIndex.searchField)} LIKE ?`
        );
        params.push(`%${source.query.searchText}%`);
      } else {
        const searchTableName = searchIndexTableName(
          options.tableName,
          searchIndex.name
        );
        joinClause = `JOIN ${quoteIdentifier(searchTableName)} s ON s._id = t._id`;
        whereClauses.push(`s.search_value MATCH ?`);
        params.push(source.query.searchText);
      }
      for (const condition of source.query.filters) {
        whereClauses.push(this.renderCondition("t", condition, params));
      }
    }

    if (options.filterExpression) {
      whereClauses.push(
        this.renderExpression("t", options.filterExpression, params)
      );
    }

    if (orderClauses.length === 0) {
      orderClauses.push(
        `t._creationTime ${options.orderDirection.toUpperCase()}`
      );
    }
    orderClauses.push(`t._id ${options.orderDirection.toUpperCase()}`);

    const sql = [
      `SELECT t._id, t._creationTime, t._json FROM ${quoteIdentifier(options.tableName)} t`,
      joinClause,
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "",
      `ORDER BY ${orderClauses.join(", ")}`,
      options.limit !== undefined ? `LIMIT ${options.limit}` : "",
      options.offset !== undefined ? `OFFSET ${options.offset}` : ""
    ]
      .filter(Boolean)
      .join(" ");

    const rows = await this.options.driver.all<DatabaseRow>(sql, params);
    return rows.map((row) =>
      this.deserializeDocument<TDocument>(options.tableName, row)
    );
  }

  private async invokeFunction<TResult>(
    definition: SyncoreFunctionDefinition<
      SyncoreFunctionKind,
      unknown,
      unknown,
      unknown
    >,
    rawArgs: JsonObject,
    state: RuntimeExecutionState
  ): Promise<TResult> {
    const args = definition.argsValidator.parse(rawArgs) as JsonObject;
    const ctx = this.createContext(definition.kind, state);
    const result = (await definition.handler(ctx, args)) as TResult;
    if (definition.returnsValidator) {
      return definition.returnsValidator.parse(result) as TResult;
    }
    return result;
  }

  private createContext(
    kind: SyncoreFunctionKind,
    state: RuntimeExecutionState
  ): QueryCtx<TSchema> | MutationCtx<TSchema> | ActionCtx<TSchema> {
    const db =
      kind === "mutation"
        ? this.createDatabaseWriter(state)
        : this.createDatabaseReader(state);
    const storage = this.createStorageApi();
    const scheduler = this.createSchedulerApi();

    return {
      db,
      storage,
      capabilities: this.capabilities,
      scheduler,
      runQuery: <TArgs, TResult>(
        reference: FunctionReference<"query", TArgs, TResult>,
        ...args: OptionalArgsTuple<TArgs>
      ) => this.runQuery(reference, normalizeOptionalArgs(args) as JsonObject),
      runMutation: <TArgs, TResult>(
        reference: FunctionReference<"mutation", TArgs, TResult>,
        ...args: OptionalArgsTuple<TArgs>
      ) => {
        const normalizedArgs = normalizeOptionalArgs(args);
        if (kind === "mutation") {
          return this.options.driver.withSavepoint(
            `sp_${generateId().replace(/-/g, "_")}`,
            () =>
              this.invokeFunction<TResult>(
                this.resolveFunction(reference, "mutation"),
                normalizedArgs as JsonObject,
                {
                  mutationDepth: state.mutationDepth + 1,
                  changedTables: state.changedTables
                }
              )
          );
        }
        return this.runMutation(reference, normalizedArgs as JsonObject);
      },
      runAction: <TArgs, TResult>(
        reference: FunctionReference<"action", TArgs, TResult>,
        ...args: OptionalArgsTuple<TArgs>
      ) => this.runAction(reference, normalizeOptionalArgs(args) as JsonObject)
    } as QueryCtx<TSchema> | MutationCtx<TSchema> | ActionCtx<TSchema>;
  }

  private createDatabaseReader(
    state: RuntimeExecutionState
  ): SyncoreDatabaseReader<TSchema> {
    return {
      get: async <TTableName extends TableNames<TSchema>>(
        tableName: TTableName,
        id: string
      ) => {
        state.dependencyCollector?.add(`table:${tableName}`);
        state.dependencyCollector?.add(`row:${tableName}:${id}`);
        const row = await this.options.driver.get<DatabaseRow>(
          `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(tableName)} WHERE _id = ?`,
          [id]
        );
        return row
          ? this.deserializeDocument<DocumentForTable<TSchema, TTableName>>(
              tableName,
              row
            )
          : null;
      },
      query: <TTableName extends TableNames<TSchema>>(tableName: TTableName) =>
        new RuntimeQueryBuilder<DocumentForTable<TSchema, TTableName>>(
          (options) =>
            this.executeQueryBuilder<DocumentForTable<TSchema, TTableName>>(
              options
            ),
          tableName,
          state.dependencyCollector
        ),
      raw: <TValue>(sql: string, params?: unknown[]) =>
        this.options.driver.all<TValue>(sql, params)
    };
  }

  private createDatabaseWriter(
    state: RuntimeExecutionState
  ): SyncoreDatabaseWriter<TSchema> {
    const reader = this.createDatabaseReader(state);

    return {
      ...reader,
      insert: async <TTableName extends TableNames<TSchema>>(
        tableName: TTableName,
        value: InsertValueForTable<TSchema, TTableName>
      ) => {
        const validated = this.validateDocument(tableName, value as JsonObject);
        const id = generateId();
        const creationTime = Date.now();
        const json = stableStringify(validated);
        await this.options.driver.run(
          `INSERT INTO ${quoteIdentifier(tableName)} (_id, _creationTime, _json) VALUES (?, ?, ?)`,
          [id, creationTime, json]
        );
        await this.syncSearchIndexes(tableName, {
          _id: id,
          _creationTime: creationTime,
          _json: json
        });
        state.changedTables.add(tableName);
        return id;
      },
      patch: async <TTableName extends TableNames<TSchema>>(
        tableName: TTableName,
        id: string,
        value: Partial<InsertValueForTable<TSchema, TTableName>>
      ) => {
        const current = await reader.get(tableName, id);
        if (!current) {
          throw new Error(`Document "${id}" does not exist in "${tableName}".`);
        }
        const merged: JsonObject = { ...omitSystemFields(current), ...value };
        for (const key of Object.keys(merged)) {
          if (merged[key] === undefined) {
            delete merged[key];
          }
        }
        const validated = this.validateDocument(tableName, merged);
        await this.options.driver.run(
          `UPDATE ${quoteIdentifier(tableName)} SET _json = ? WHERE _id = ?`,
          [stableStringify(validated), id]
        );
        const row = await this.options.driver.get<DatabaseRow>(
          `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(tableName)} WHERE _id = ?`,
          [id]
        );
        if (row) {
          await this.syncSearchIndexes(tableName, row);
        }
        state.changedTables.add(tableName);
      },
      replace: async <TTableName extends TableNames<TSchema>>(
        tableName: TTableName,
        id: string,
        value: InsertValueForTable<TSchema, TTableName>
      ) => {
        const validated = this.validateDocument(tableName, value as JsonObject);
        await this.options.driver.run(
          `UPDATE ${quoteIdentifier(tableName)} SET _json = ? WHERE _id = ?`,
          [stableStringify(validated), id]
        );
        const row = await this.options.driver.get<DatabaseRow>(
          `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(tableName)} WHERE _id = ?`,
          [id]
        );
        if (!row) {
          throw new Error(`Document "${id}" does not exist in "${tableName}".`);
        }
        await this.syncSearchIndexes(tableName, row);
        state.changedTables.add(tableName);
      },
      delete: async <TTableName extends TableNames<TSchema>>(
        tableName: TTableName,
        id: string
      ) => {
        await this.options.driver.run(
          `DELETE FROM ${quoteIdentifier(tableName)} WHERE _id = ?`,
          [id]
        );
        await this.removeSearchIndexes(tableName, id);
        state.changedTables.add(tableName);
      }
    };
  }

  private createStorageApi(): SyncoreStorageApi {
    return {
      put: async (input) => {
        const id = generateId();
        const createdAt = Date.now();
        await this.options.driver.run(
          `INSERT OR REPLACE INTO "_storage_pending" (_id, _creationTime, file_name, content_type) VALUES (?, ?, ?, ?)`,
          [id, createdAt, input.fileName ?? null, input.contentType ?? null]
        );
        const object = await this.options.storage.put(id, input);
        await this.options.driver.withTransaction(async () => {
          await this.options.driver.run(
            `INSERT OR REPLACE INTO "_storage" (_id, _creationTime, file_name, content_type, size, path) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              id,
              createdAt,
              input.fileName ?? null,
              object.contentType,
              object.size,
              object.path
            ]
          );
          await this.options.driver.run(
            `DELETE FROM "_storage_pending" WHERE _id = ?`,
            [id]
          );
        });
        this.emitDevtools({
          type: "storage.updated",
          runtimeId: this.runtimeId,
          storageId: id,
          operation: "put",
          timestamp: Date.now()
        });
        return id;
      },
      get: async (id) => {
        const row = await this.options.driver.get<StorageMetadataRow>(
          `SELECT _id, _creationTime, file_name, content_type, size, path FROM "_storage" WHERE _id = ?`,
          [id]
        );
        if (!row) {
          return null;
        }
        return {
          id: row._id,
          path: row.path,
          size: row.size,
          contentType: row.content_type
        };
      },
      read: async (id) => {
        const row = await this.options.driver.get<
          Pick<StorageMetadataRow, "_id">
        >(`SELECT _id FROM "_storage" WHERE _id = ?`, [id]);
        if (!row) {
          return null;
        }
        return this.options.storage.read(id);
      },
      delete: async (id) => {
        await this.options.storage.delete(id);
        await this.options.driver.withTransaction(async () => {
          await this.options.driver.run(
            `DELETE FROM "_storage" WHERE _id = ?`,
            [id]
          );
          await this.options.driver.run(
            `DELETE FROM "_storage_pending" WHERE _id = ?`,
            [id]
          );
        });
        this.emitDevtools({
          type: "storage.updated",
          runtimeId: this.runtimeId,
          storageId: id,
          operation: "delete",
          timestamp: Date.now()
        });
      }
    };
  }

  private createSchedulerApi(): SchedulerApi {
    return {
      runAfter: async (delayMs, reference, ...args) => {
        const schedulerArgs = splitSchedulerArgs(args);
        const functionArgs = schedulerArgs[0];
        const misfirePolicy = schedulerArgs[1] ?? DEFAULT_MISFIRE_POLICY;
        return this.scheduleJob(
          Date.now() + delayMs,
          reference,
          functionArgs,
          misfirePolicy
        );
      },
      runAt: async (timestamp, reference, ...args) => {
        const schedulerArgs = splitSchedulerArgs(args);
        const functionArgs = schedulerArgs[0];
        const misfirePolicy = schedulerArgs[1] ?? DEFAULT_MISFIRE_POLICY;
        const value =
          timestamp instanceof Date ? timestamp.getTime() : timestamp;
        return this.scheduleJob(value, reference, functionArgs, misfirePolicy);
      },
      cancel: async (id) => {
        await this.options.driver.run(
          `UPDATE "_scheduled_functions" SET status = 'cancelled', updated_at = ? WHERE id = ?`,
          [Date.now(), id]
        );
      }
    };
  }

  private async ensureSystemTables(): Promise<void> {
    await this.options.driver.exec(`
      CREATE TABLE IF NOT EXISTS "_syncore_migrations" (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        sql TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "_syncore_schema_state" (
        id TEXT PRIMARY KEY,
        schema_hash TEXT NOT NULL,
        schema_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "_storage" (
        _id TEXT PRIMARY KEY,
        _creationTime INTEGER NOT NULL,
        file_name TEXT,
        content_type TEXT,
        size INTEGER NOT NULL,
        path TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "_storage_pending" (
        _id TEXT PRIMARY KEY,
        _creationTime INTEGER NOT NULL,
        file_name TEXT,
        content_type TEXT
      );
      CREATE TABLE IF NOT EXISTS "_scheduled_functions" (
        id TEXT PRIMARY KEY,
        function_name TEXT NOT NULL,
        function_kind TEXT NOT NULL,
        args_json TEXT NOT NULL,
        status TEXT NOT NULL,
        run_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        recurring_name TEXT,
        schedule_json TEXT,
        timezone TEXT,
        misfire_policy TEXT NOT NULL,
        last_run_at INTEGER,
        window_ms INTEGER
      );
    `);
    try {
      await this.options.driver.exec(
        `ALTER TABLE "_syncore_schema_state" ADD COLUMN schema_json TEXT NOT NULL DEFAULT '{}'`
      );
    } catch {
      // Column already exists.
    }
  }

  private async reconcileStorageState(): Promise<void> {
    const pendingRows = await this.options.driver.all<StoragePendingRow>(
      `SELECT _id, _creationTime, file_name, content_type FROM "_storage_pending"`
    );

    for (const pendingRow of pendingRows) {
      const committed = await this.options.driver.get<
        Pick<StorageMetadataRow, "_id">
      >(`SELECT _id FROM "_storage" WHERE _id = ?`, [pendingRow._id]);
      if (!committed) {
        await this.options.storage.delete(pendingRow._id);
        this.emitDevtools({
          type: "log",
          runtimeId: this.runtimeId,
          level: "warn",
          message: `Recovered interrupted storage write ${pendingRow._id}.`,
          timestamp: Date.now()
        });
      }
      await this.options.driver.run(
        `DELETE FROM "_storage_pending" WHERE _id = ?`,
        [pendingRow._id]
      );
    }

    if (!this.options.storage.list) {
      return;
    }

    const storedRows = await this.options.driver.all<
      Pick<StorageMetadataRow, "_id">
    >(`SELECT _id FROM "_storage"`);
    const knownIds = new Set(storedRows.map((row) => row._id));
    const physicalObjects = await this.options.storage.list();
    for (const object of physicalObjects) {
      if (knownIds.has(object.id)) {
        continue;
      }
      await this.options.storage.delete(object.id);
      this.emitDevtools({
        type: "log",
        runtimeId: this.runtimeId,
        level: "warn",
        message: `Removed orphaned storage object ${object.id}.`,
        timestamp: Date.now()
      });
    }
  }

  private async applySchema(): Promise<void> {
    const nextSnapshot = createSchemaSnapshot(this.options.schema);
    const stateRow = await this.options.driver.get<{
      schema_hash: string;
      schema_json: string;
    }>(
      `SELECT schema_hash, schema_json FROM "_syncore_schema_state" WHERE id = 'current'`
    );
    let previousSnapshot = null;
    if (stateRow?.schema_json && stateRow.schema_json !== "{}") {
      try {
        previousSnapshot = parseSchemaSnapshot(stateRow.schema_json);
      } catch {
        previousSnapshot = null;
      }
    }
    const plan = diffSchemaSnapshots(previousSnapshot, nextSnapshot);

    if (plan.destructiveChanges.length > 0) {
      throw new Error(
        `Syncore detected destructive schema changes that require a manual migration:\n${plan.destructiveChanges.join(
          "\n"
        )}`
      );
    }

    for (const warning of plan.warnings) {
      this.emitDevtools({
        type: "log",
        runtimeId: this.runtimeId,
        level: "warn",
        message: warning,
        timestamp: Date.now()
      });
    }

    for (const statement of plan.statements) {
      const searchKey = this.findSearchIndexKeyForStatement(statement);
      try {
        await this.options.driver.exec(statement);
      } catch (error) {
        if (searchKey) {
          this.disabledSearchIndexes.add(searchKey);
          this.emitDevtools({
            type: "log",
            runtimeId: this.runtimeId,
            level: "warn",
            message: `FTS5 unavailable for ${searchKey}; falling back to LIKE search.`,
            timestamp: Date.now()
          });
          continue;
        }
        throw error;
      }
    }

    if (plan.statements.length > 0 || plan.warnings.length > 0) {
      const migrationSql = renderMigrationSql(plan, {
        title: "Syncore automatic schema reconciliation"
      });
      await this.options.driver.run(
        `INSERT OR REPLACE INTO "_syncore_migrations" (id, applied_at, sql) VALUES (?, ?, ?)`,
        [nextSnapshot.hash, Date.now(), migrationSql]
      );
    }

    await this.options.driver.run(
      `INSERT INTO "_syncore_schema_state" (id, schema_hash, schema_json, updated_at)
       VALUES ('current', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET schema_hash = excluded.schema_hash, schema_json = excluded.schema_json, updated_at = excluded.updated_at`,
      [nextSnapshot.hash, stableStringify(nextSnapshot), Date.now()]
    );

    for (const tableName of this.options.schema.tableNames()) {
      const table = this.getTableDefinition(tableName);
      for (const searchIndex of table.searchIndexes) {
        const searchKey = `${tableName}:${searchIndex.name}`;
        try {
          await this.options.driver.exec(
            renderCreateSearchIndexStatement(tableName, searchIndex)
          );
          this.disabledSearchIndexes.delete(searchKey);
        } catch {
          const alreadyDisabled = this.disabledSearchIndexes.has(searchKey);
          this.disabledSearchIndexes.add(searchKey);
          if (!alreadyDisabled) {
            this.emitDevtools({
              type: "log",
              runtimeId: this.runtimeId,
              level: "warn",
              message: `FTS5 unavailable for ${searchKey}; falling back to LIKE search.`,
              timestamp: Date.now()
            });
          }
        }
      }
    }
  }

  private async scheduleJob(
    runAt: number,
    reference: FunctionReference<"mutation" | "action", unknown, unknown>,
    args: JsonObject,
    misfirePolicy: MisfirePolicy
  ): Promise<string> {
    const id = generateId();
    const now = Date.now();
    await this.options.driver.run(
      `INSERT INTO "_scheduled_functions"
        (id, function_name, function_kind, args_json, status, run_at, created_at, updated_at, recurring_name, schedule_json, timezone, misfire_policy, last_run_at, window_ms)
       VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?)`,
      [
        id,
        reference.name,
        reference.kind,
        stableStringify(args),
        runAt,
        now,
        now,
        misfirePolicy.type,
        misfirePolicy.type === "windowed" ? misfirePolicy.windowMs : null
      ]
    );
    return id;
  }

  private async syncRecurringJobs(): Promise<void> {
    for (const job of this.recurringJobs) {
      const id = `recurring:${job.name}`;
      const existing = await this.options.driver.get<ScheduledJobRow>(
        `SELECT * FROM "_scheduled_functions" WHERE id = ?`,
        [id]
      );
      if (existing) {
        continue;
      }
      const nextRunAt = computeNextRun(job.schedule, Date.now());
      await this.options.driver.run(
        `INSERT INTO "_scheduled_functions"
         (id, function_name, function_kind, args_json, status, run_at, created_at, updated_at, recurring_name, schedule_json, timezone, misfire_policy, last_run_at, window_ms)
         VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [
          id,
          job.function.name,
          job.function.kind,
          stableStringify(job.args),
          nextRunAt,
          Date.now(),
          Date.now(),
          job.name,
          stableStringify(job.schedule),
          "timezone" in job.schedule ? (job.schedule.timezone ?? null) : null,
          job.misfirePolicy.type,
          job.misfirePolicy.type === "windowed"
            ? job.misfirePolicy.windowMs
            : null
        ]
      );
    }
  }

  private async processDueJobs(): Promise<void> {
    const now = Date.now();
    const dueJobs = await this.options.driver.all<ScheduledJobRow>(
      `SELECT * FROM "_scheduled_functions" WHERE status = 'scheduled' AND run_at <= ? ORDER BY run_at ASC`,
      [now]
    );
    const executedJobIds: string[] = [];

    for (const job of dueJobs) {
      const misfirePolicy = parseMisfirePolicy(
        job.misfire_policy,
        job.window_ms
      );
      if (!shouldRunMissedJob(job.run_at, now, misfirePolicy)) {
        await this.advanceOrFinalizeJob(job, "skipped", now);
        continue;
      }

      try {
        if (job.function_kind === "mutation") {
          await this.runMutation(
            { kind: "mutation", name: job.function_name },
            JSON.parse(job.args_json) as JsonObject
          );
        } else {
          await this.runAction(
            { kind: "action", name: job.function_name },
            JSON.parse(job.args_json) as JsonObject
          );
        }
        executedJobIds.push(job.id);
        await this.advanceOrFinalizeJob(job, "completed", now);
      } catch (error) {
        await this.options.driver.run(
          `UPDATE "_scheduled_functions" SET status = 'failed', updated_at = ? WHERE id = ?`,
          [Date.now(), job.id]
        );
        this.emitDevtools({
          type: "log",
          runtimeId: this.runtimeId,
          level: "error",
          message: `Scheduled job ${job.id} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          timestamp: Date.now()
        });
      }
    }

    if (executedJobIds.length > 0) {
      this.emitDevtools({
        type: "scheduler.tick",
        runtimeId: this.runtimeId,
        executedJobIds,
        timestamp: Date.now()
      });
    }
  }

  private async advanceOrFinalizeJob(
    job: ScheduledJobRow,
    terminalStatus: ScheduledJobRow["status"],
    executedAt: number
  ): Promise<void> {
    if (!job.recurring_name || !job.schedule_json) {
      await this.options.driver.run(
        `UPDATE "_scheduled_functions" SET status = ?, updated_at = ?, last_run_at = ? WHERE id = ?`,
        [terminalStatus, executedAt, executedAt, job.id]
      );
      return;
    }

    const schedule = JSON.parse(job.schedule_json) as RecurringSchedule;
    const nextRunAt = computeNextRun(schedule, executedAt + 1);
    await this.options.driver.run(
      `UPDATE "_scheduled_functions"
       SET status = 'scheduled', run_at = ?, updated_at = ?, last_run_at = ?
       WHERE id = ?`,
      [nextRunAt, executedAt, executedAt, job.id]
    );
  }

  private async refreshInvalidatedQueries(
    changedTables: Set<string>,
    mutationId: string
  ): Promise<void> {
    for (const query of this.activeQueries.values()) {
      const needsRefresh = [...changedTables].some((tableName) =>
        query.dependencyKeys.has(`table:${tableName}`)
      );
      if (!needsRefresh) {
        continue;
      }
      this.emitDevtools({
        type: "query.invalidated",
        runtimeId: this.runtimeId,
        queryId: query.id,
        reason: `Mutation ${mutationId} changed ${[...changedTables].join(", ")}`,
        timestamp: Date.now()
      });
      await this.rerunActiveQuery(query);
    }
  }

  private async rerunActiveQuery(record: ActiveQueryRecord): Promise<void> {
    record.dependencyKeys.clear();
    try {
      const result = await this.runQuery(
        { kind: "query", name: record.functionName },
        record.args
      );
      record.lastResult = result;
      record.lastError = undefined;
      record.lastRunAt = Date.now();
      const dependencies = await this.collectQueryDependencies(
        record.functionName,
        record.args
      );
      record.dependencyKeys = dependencies;
    } catch (error) {
      record.lastError = error as Error;
    }
    for (const listener of record.listeners) {
      listener();
    }
  }

  private async collectQueryDependencies(
    functionName: string,
    args: JsonObject
  ): Promise<Set<DependencyKey>> {
    const definition = this.resolveFunction(
      { kind: "query", name: functionName },
      "query"
    );
    const dependencyCollector = new Set<DependencyKey>();
    await this.invokeFunction(definition, args, {
      mutationDepth: 0,
      changedTables: new Set<string>(),
      dependencyCollector
    });
    return dependencyCollector;
  }

  private resolveFunction<TKind extends SyncoreFunctionKind>(
    reference: FunctionReference<TKind, unknown, unknown>,
    expectedKind: TKind
  ): SyncoreFunctionDefinition<TKind, unknown, unknown, unknown> {
    const definition = this.options.functions[reference.name];
    if (!definition) {
      throw new Error(`Unknown function "${reference.name}".`);
    }
    if (definition.kind !== expectedKind) {
      throw new Error(
        `Function "${reference.name}" is a ${definition.kind}, expected ${expectedKind}.`
      );
    }
    return definition as SyncoreFunctionDefinition<
      TKind,
      unknown,
      unknown,
      unknown
    >;
  }

  private validateDocument(tableName: string, value: JsonObject): JsonObject {
    const validator = this.getTableDefinition(tableName).validator;
    return validator.parse(value) as JsonObject;
  }

  private deserializeDocument<TDocument>(
    tableName: string,
    row: DatabaseRow
  ): TDocument {
    const payload = JSON.parse(row._json) as JsonObject;
    const document = {
      ...payload,
      _id: row._id,
      _creationTime: row._creationTime
    };
    this.getTableDefinition(tableName).validator.parse(payload);
    return document as TDocument;
  }

  private async syncSearchIndexes(
    tableName: string,
    row: DatabaseRow
  ): Promise<void> {
    const table = this.getTableDefinition(tableName);
    if (table.searchIndexes.length === 0) {
      return;
    }
    const payload = JSON.parse(row._json) as JsonObject;
    for (const searchIndex of table.searchIndexes) {
      if (this.disabledSearchIndexes.has(`${tableName}:${searchIndex.name}`)) {
        continue;
      }
      await this.options.driver.run(
        `DELETE FROM ${quoteIdentifier(searchIndexTableName(tableName, searchIndex.name))} WHERE _id = ?`,
        [row._id]
      );
      await this.options.driver.run(
        `INSERT INTO ${quoteIdentifier(
          searchIndexTableName(tableName, searchIndex.name)
        )} (_id, search_value) VALUES (?, ?)`,
        [row._id, toSearchValue(payload[searchIndex.searchField])]
      );
    }
  }

  private async removeSearchIndexes(
    tableName: string,
    id: string
  ): Promise<void> {
    const table = this.getTableDefinition(tableName);
    for (const searchIndex of table.searchIndexes) {
      if (this.disabledSearchIndexes.has(`${tableName}:${searchIndex.name}`)) {
        continue;
      }
      await this.options.driver.run(
        `DELETE FROM ${quoteIdentifier(searchIndexTableName(tableName, searchIndex.name))} WHERE _id = ?`,
        [id]
      );
    }
  }

  private renderExpression(
    tableAlias: string,
    expression: QueryExpression,
    params: unknown[]
  ): string {
    if (expression.type === "condition") {
      return this.renderCondition(tableAlias, expression.condition, params);
    }
    const separator = expression.type === "and" ? " AND " : " OR ";
    return `(${expression.expressions
      .map((child) => this.renderExpression(tableAlias, child, params))
      .join(separator)})`;
  }

  private renderCondition(
    tableAlias: string,
    condition: QueryCondition,
    params: unknown[]
  ): string {
    params.push(condition.value);
    return `${fieldExpression(tableAlias, condition.field)} ${condition.operator} ?`;
  }

  private createActiveQueryKey(name: string, args: JsonObject): string {
    return `${name}:${stableStringify(args)}`;
  }

  private emitDevtools(event: SyncoreDevtoolsEvent): void {
    this.recentEvents.unshift(event);
    this.recentEvents.splice(24);
    this.options.devtools?.emit(event);
  }

  private createPluginContext(): SyncoreExperimentalPluginContext<TSchema> {
    return {
      runtimeId: this.runtimeId,
      platform: this.platform,
      schema: this.options.schema,
      driver: this.options.driver,
      storage: this.options.storage,
      ...(this.options.scheduler ? { scheduler: this.options.scheduler } : {}),
      ...(this.options.devtools ? { devtools: this.options.devtools } : {}),
      emitDevtools: (event) => {
        this.emitDevtools(event);
      }
    };
  }

  private buildCapabilities(): SyncoreCapabilities {
    const capabilities: SyncoreCapabilities = {
      ...(this.options.capabilities ?? {})
    };

    for (const plugin of this.experimentalPlugins) {
      if (!plugin.capabilities) {
        continue;
      }
      const contributed =
        typeof plugin.capabilities === "function"
          ? plugin.capabilities(this.createPluginContext())
          : plugin.capabilities;
      if (!contributed) {
        continue;
      }
      Object.assign(capabilities, contributed);
    }

    return capabilities;
  }

  private async runPluginHook(hook: "onStart" | "onStop"): Promise<void> {
    const context = this.createPluginContext();
    for (const plugin of this.experimentalPlugins) {
      const handler = plugin[hook];
      if (!handler) {
        continue;
      }
      await handler(context);
    }
  }

  private findSearchIndexKeyForStatement(statement: string): string | null {
    for (const tableName of this.options.schema.tableNames()) {
      const table = this.getTableDefinition(tableName);
      for (const searchIndex of table.searchIndexes) {
        if (
          statement === renderCreateSearchIndexStatement(tableName, searchIndex)
        ) {
          return `${tableName}:${searchIndex.name}`;
        }
      }
    }
    return null;
  }

  private getTableDefinition(
    tableName: string
  ): TableDefinition<Validator<unknown>> {
    return this.options.schema.getTable(
      tableName as TableNames<TSchema>
    ) as TableDefinition<Validator<unknown>>;
  }
}

function fieldExpression(tableAlias: string, field: string): string {
  const prefix = tableAlias ? `${tableAlias}.` : "";
  return `json_extract(${prefix}_json, '$.${field}')`;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)])
    );
  }
  return value;
}

function omitSystemFields<TDocument extends object>(
  document: TDocument
): JsonObject {
  const clone = { ...(document as Record<string, unknown>) };
  delete clone._id;
  delete clone._creationTime;
  return clone;
}

function toSearchValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return stableStringify(value);
}

function parseMisfirePolicy(
  type: string,
  windowMs: number | null
): MisfirePolicy {
  if (type === "windowed") {
    return { type, windowMs: windowMs ?? 0 };
  }
  if (type === "skip" || type === "run_once_if_missed") {
    return { type };
  }
  return { type: "catch_up" };
}

function shouldRunMissedJob(
  scheduledAt: number,
  now: number,
  policy: MisfirePolicy
): boolean {
  if (scheduledAt >= now) {
    return true;
  }
  switch (policy.type) {
    case "catch_up":
      return true;
    case "run_once_if_missed":
      return true;
    case "skip":
      return false;
    case "windowed":
      return now - scheduledAt <= policy.windowMs;
  }
}

function computeNextRun(
  schedule: RecurringSchedule,
  fromTimestamp: number
): number {
  switch (schedule.type) {
    case "interval":
      return fromTimestamp + intervalToMs(schedule);
    case "daily":
      return nextDailyOccurrence(fromTimestamp, schedule);
    case "weekly":
      return nextWeeklyOccurrence(fromTimestamp, schedule);
  }
}

function intervalToMs(schedule: {
  seconds?: number;
  minutes?: number;
  hours?: number;
}): number {
  if (schedule.seconds) {
    return schedule.seconds * 1000;
  }
  if (schedule.minutes) {
    return schedule.minutes * 60 * 1000;
  }
  return (schedule.hours ?? 1) * 60 * 60 * 1000;
}

function nextDailyOccurrence(
  fromTimestamp: number,
  schedule: Extract<RecurringSchedule, { type: "daily" }>
): number {
  const timezone = schedule.timezone ?? "UTC";
  const now = new Date(fromTimestamp);
  const zonedNow = toZonedTime(now, timezone);
  const zoned = new Date(zonedNow.getTime());
  zoned.setHours(schedule.hour, schedule.minute, 0, 0);
  if (zoned.getTime() <= zonedNow.getTime()) {
    zoned.setDate(zoned.getDate() + 1);
  }
  return fromZonedTime(zoned, timezone).getTime();
}

function nextWeeklyOccurrence(
  fromTimestamp: number,
  schedule: Extract<RecurringSchedule, { type: "weekly" }>
): number {
  const timezone = schedule.timezone ?? "UTC";
  const now = new Date(fromTimestamp);
  const zonedNow = toZonedTime(now, timezone);
  const targetDay = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
  ].indexOf(schedule.dayOfWeek);
  const zoned = new Date(zonedNow.getTime());
  const delta = (targetDay - zonedNow.getDay() + 7) % 7;
  zoned.setDate(zoned.getDate() + delta);
  zoned.setHours(schedule.hour, schedule.minute, 0, 0);
  if (zoned.getTime() <= zonedNow.getTime()) {
    zoned.setDate(zoned.getDate() + 7);
  }
  return fromZonedTime(zoned, timezone).getTime();
}

export function createFunctionReference<
  TKind extends SyncoreFunctionKind,
  TArgs = Record<never, never>,
  TResult = unknown
>(kind: TKind, name: string): FunctionReference<TKind, TArgs, TResult> {
  return { kind, name };
}

/**
 * Create a typed function reference from a concrete Syncore function definition.
 *
 * Generated code uses this helper to preserve function arg and result inference.
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

function normalizeOptionalArgs<TArgs>(
  args: [] | [TArgs] | readonly unknown[]
): TArgs {
  return (args[0] ?? {}) as TArgs;
}

function splitSchedulerArgs(
  args: readonly unknown[]
): [JsonObject, MisfirePolicy | undefined] {
  if (args.length === 0) {
    return [{}, undefined];
  }
  if (args.length === 1) {
    const [first] = args;
    if (isMisfirePolicy(first)) {
      return [{}, first];
    }
    return [(first ?? {}) as JsonObject, undefined];
  }
  return [(args[0] ?? {}) as JsonObject, args[1] as MisfirePolicy | undefined];
}

function isMisfirePolicy(value: unknown): value is MisfirePolicy {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "string"
  );
}
