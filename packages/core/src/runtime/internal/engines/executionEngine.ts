import type {
  FunctionArgsFromDefinition,
  FunctionKindFromDefinition,
  FunctionReference,
  FunctionResultFromDefinition,
  MisfirePolicy,
  SyncoreFunctionKind
} from "../../functions.js";
import {
  toCanonicalComponentFunctionName,
  type SyncoreComponentFunctionMetadata
} from "../../components.js";
import type {
  ActionCtx,
  CapabilityDescriptor,
  DevtoolsLiveQueryScope,
  DocumentForTable,
  ExecutionResult,
  FilterBuilder,
  ImpactScope,
  IndexRangeBuilder,
  InsertValueForTable,
  JsonObject,
  MutationCtx,
  PatchValueForTable,
  PaginationOptions,
  PaginationResult,
  QueryBuilder,
  QueryCtx,
  QueryExpression,
  RegisteredSyncoreFunction,
  SchedulerApi,
  SearchIndexBuilder,
  SearchQuery,
  SyncoreCapabilities,
  SyncoreClient,
  SyncoreDataModel,
  SyncoreDatabaseReader,
  SyncoreDatabaseWriter,
  SyncoreFunctionRegistry,
  SyncoreSqlDriver,
  SyncoreWatch,
  TableNames
} from "../../runtime.js";
import type {
  AnyTableDefinition as SchemaAnyTableDefinition,
  TableIndexFields,
  TableIndexNames,
  TableSearchIndexConfig,
  TableSearchIndexNames
} from "@syncore/schema";
import { DevtoolsEngine } from "./devtoolsEngine.js";
import { SchemaEngine } from "./schemaEngine.js";
import { StorageEngine } from "./storageEngine.js";
import { SchedulerEngine } from "./schedulerEngine.js";
import { ReactivityEngine } from "./reactivityEngine.js";
import {
  fieldExpression,
  normalizeOptionalArgs,
  omitSystemFields,
  quoteIdentifier,
  resolveSearchIndexTableName,
  splitSchedulerArgs,
  stableStringify,
  type DatabaseRow,
  type DependencyKey,
  type DevtoolsEventMeta,
  type ExecuteQueryBuilderOptions,
  type QuerySource,
  type RuntimeExecutionState
} from "./shared.js";
import { generateId } from "../../id.js";
import type { Validator } from "@syncore/schema";
import {
  TransactionCoordinator,
  createEmptyExecutionResult
} from "../transactionCoordinator.js";
import type { RuntimeStatusController } from "../runtimeStatus.js";

const DEFAULT_MISFIRE_POLICY: MisfirePolicy = { type: "catch_up" };

type OptionalArgsTuple<TArgs> =
  Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];

type ExecutionEngineDeps<TSchema extends SyncoreDataModel> = {
  runtimeId: string;
  functions: SyncoreFunctionRegistry;
  driver: SyncoreSqlDriver;
  capabilities: Readonly<SyncoreCapabilities>;
  capabilityDescriptors: ReadonlyArray<CapabilityDescriptor>;
  schema: SchemaEngine<TSchema>;
  storage: StorageEngine;
  scheduler: SchedulerEngine;
  reactivity: ReactivityEngine;
  devtools: DevtoolsEngine;
  transactionCoordinator: TransactionCoordinator;
  runtimeStatus: RuntimeStatusController;
};

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

class RuntimeIndexRangeBuilder<
  TFieldName extends string = string
> implements IndexRangeBuilder<TFieldName> {
  private readonly conditions: Array<{
    field: string;
    operator: "=" | ">" | ">=" | "<" | "<=";
    value: unknown;
  }> = [];

  eq(field: TFieldName, value: unknown): IndexRangeBuilder<TFieldName> {
    this.conditions.push({ field, operator: "=", value });
    return this;
  }

  gt(field: TFieldName, value: unknown): IndexRangeBuilder<TFieldName> {
    this.conditions.push({ field, operator: ">", value });
    return this;
  }

  gte(field: TFieldName, value: unknown): IndexRangeBuilder<TFieldName> {
    this.conditions.push({ field, operator: ">=", value });
    return this;
  }

  lt(field: TFieldName, value: unknown): IndexRangeBuilder<TFieldName> {
    this.conditions.push({ field, operator: "<", value });
    return this;
  }

  lte(field: TFieldName, value: unknown): IndexRangeBuilder<TFieldName> {
    this.conditions.push({ field, operator: "<=", value });
    return this;
  }

  build() {
    return [...this.conditions];
  }
}

class RuntimeSearchIndexBuilder<
  TSearchField extends string = string,
  TFilterField extends string = string
> implements SearchIndexBuilder<TSearchField, TFilterField> {
  private searchField: string | undefined;
  private searchText: string | undefined;
  private readonly filters: Array<{
    field: string;
    operator: "=";
    value: unknown;
  }> = [];

  search(
    field: TSearchField,
    value: string
  ): SearchIndexBuilder<TSearchField, TFilterField> {
    this.searchField = field;
    this.searchText = value;
    return this;
  }

  eq(
    field: TFilterField,
    value: unknown
  ): SearchIndexBuilder<TSearchField, TFilterField> {
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

class RuntimeQueryBuilder<
  TTable extends SchemaAnyTableDefinition,
  TDocument
> implements QueryBuilder<TTable, TDocument> {
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

  withIndex<TIndexName extends TableIndexNames<TTable>>(
    indexName: TIndexName,
    builder?: (
      range: IndexRangeBuilder<TableIndexFields<TTable, TIndexName>[number]>
    ) => IndexRangeBuilder<TableIndexFields<TTable, TIndexName>[number]>
  ): this {
    const indexRange = builder?.(new RuntimeIndexRangeBuilder()).build() ?? [];
    this.source = { type: "index", name: indexName, range: indexRange };
    return this;
  }

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

export class ExecutionEngine<
  TSchema extends SyncoreDataModel
> {
  constructor(private readonly deps: ExecutionEngineDeps<TSchema>) {}

  createClient(): SyncoreClient {
    return {
      query: (reference, ...args) =>
        this.runQuery(reference, normalizeOptionalArgs(args) as JsonObject),
      mutation: (reference, ...args) =>
        this.runMutation(reference, normalizeOptionalArgs(args) as JsonObject),
      action: (reference, ...args) =>
        this.runAction(reference, normalizeOptionalArgs(args) as JsonObject),
      watchQuery: (reference, ...args) =>
        this.watchQuery(reference, normalizeOptionalArgs(args) as JsonObject),
      watchRuntimeStatus: () => this.deps.runtimeStatus.watch()
    };
  }

  watchQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    args: JsonObject = {}
  ): SyncoreWatch<TResult> {
    return this.deps.reactivity.watchQuery(reference, args);
  }

  async runQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    args: JsonObject = {},
    meta: DevtoolsEventMeta = {}
  ): Promise<TResult> {
    const definition = this.resolveFunction(reference, "query");
    const dependencyCollector = new Set<DependencyKey>();
    const startedAt = Date.now();
    const result = await this.invokeFunction<TResult>(definition, args, {
      mutationDepth: 0,
      changedTables: new Set<string>(),
      storageChanges: [],
      dependencyCollector,
      componentMetadata: definition.__syncoreComponent
    });

    this.deps.devtools.emit({
      type: "query.executed",
      runtimeId: this.deps.runtimeId,
      queryId: reference.name,
      functionName: reference.name,
      ...(definition.__syncoreComponent
        ? {
            componentPath: definition.__syncoreComponent.componentPath,
            componentName: definition.__syncoreComponent.componentName
          }
        : {}),
      dependencies: [...dependencyCollector],
      durationMs: Date.now() - startedAt,
      timestamp: Date.now(),
      ...(meta.origin ? { origin: meta.origin } : {})
    });

    return result;
  }

  async runMutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    args: JsonObject = {},
    meta: DevtoolsEventMeta = {}
  ): Promise<TResult> {
    const definition = this.resolveFunction(reference, "mutation");
    const mutationId = generateId();
    const startedAt = Date.now();
    const execution = await this.deps.transactionCoordinator.runInTransaction(
      async (transactionState) =>
        this.invokeFunction<TResult>(definition, args, {
          mutationDepth: 1,
          changedTables: transactionState.changedTables,
          storageChanges: transactionState.storageChanges,
          componentMetadata: definition.__syncoreComponent
        })
    );

    await this.finalizeStatefulExecution(
      mutationId,
      execution,
      Date.now() - startedAt
    );

    this.deps.devtools.emit({
      type: "mutation.committed",
      runtimeId: this.deps.runtimeId,
      mutationId,
      functionName: reference.name,
      ...(definition.__syncoreComponent
        ? {
            componentPath: definition.__syncoreComponent.componentPath,
            componentName: definition.__syncoreComponent.componentName
          }
        : {}),
      changedTables: [...execution.changedTables],
      durationMs: Date.now() - startedAt,
      timestamp: Date.now(),
      ...(meta.origin ? { origin: meta.origin } : {})
    });

    return execution.result;
  }

  async runAction<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    args: JsonObject = {},
    meta: DevtoolsEventMeta = {}
  ): Promise<TResult> {
    const definition = this.resolveFunction(reference, "action");
    const actionId = generateId();
    const startedAt = Date.now();
    const state = this.deps.transactionCoordinator.createState();

    try {
      const result = await this.invokeFunction<TResult>(definition, args, {
        mutationDepth: 0,
        changedTables: state.changedTables,
        storageChanges: state.storageChanges,
        componentMetadata: definition.__syncoreComponent
      });
      await this.finalizeStatefulExecution(
        actionId,
        createEmptyExecutionResult(result, state),
        Date.now() - startedAt
      );
      this.deps.devtools.emit({
        type: "action.completed",
        runtimeId: this.deps.runtimeId,
        actionId,
        functionName: reference.name,
        ...(definition.__syncoreComponent
          ? {
              componentPath: definition.__syncoreComponent.componentPath,
              componentName: definition.__syncoreComponent.componentName
            }
          : {}),
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        ...(meta.origin ? { origin: meta.origin } : {})
      });
      return result;
    } catch (error) {
      this.deps.devtools.emit({
        type: "action.completed",
        runtimeId: this.deps.runtimeId,
        actionId,
        functionName: reference.name,
        ...(definition.__syncoreComponent
          ? {
              componentPath: definition.__syncoreComponent.componentPath,
              componentName: definition.__syncoreComponent.componentName
            }
          : {}),
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
        ...(meta.origin ? { origin: meta.origin } : {}),
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async runDevtoolsMutation<TResult>(
    callback: (ctx: { db: SyncoreDatabaseWriter<TSchema> }) => Promise<TResult>,
    meta: DevtoolsEventMeta = {}
  ): Promise<TResult> {
    const mutationId = generateId();
    const startedAt = Date.now();
    const execution = await this.deps.transactionCoordinator.runInTransaction(
      async (transactionState) =>
        callback({
          db: this.createDatabaseWriter({
            mutationDepth: 1,
            changedTables: transactionState.changedTables,
            storageChanges: transactionState.storageChanges
          })
        })
    );

    await this.finalizeStatefulExecution(
      mutationId,
      execution,
      Date.now() - startedAt
    );

    this.deps.devtools.emit({
      type: "mutation.committed",
      runtimeId: this.deps.runtimeId,
      mutationId,
      functionName: "__devtools__/mutation",
      changedTables: [...execution.changedTables],
      durationMs: Date.now() - startedAt,
      timestamp: Date.now(),
      ...(meta.origin ? { origin: meta.origin } : {})
    });
    return execution.result;
  }

  private async finalizeStatefulExecution<TResult>(
    executionId: string,
    execution: ExecutionResult<TResult>,
    durationMs: number
  ): Promise<void> {
    const changedScopes = collectChangedScopes(
      execution.changedTables,
      execution.storageChanges
    );
    if (changedScopes.size > 0) {
      await this.deps.reactivity.refreshQueriesForScopes(
        changedScopes,
        `Execution ${executionId} touched ${[...changedScopes].join(", ")}`
      );
    }
    if (execution.changedTables.size > 0) {
      await this.deps.reactivity.publishExternalChange({
        scope: "database",
        reason: "commit",
        changedScopes: [...changedScopes].filter((scope) =>
          scope.startsWith("table:")
        ),
        changedTables: [...execution.changedTables]
      });
    }
    await this.deps.reactivity.publishStorageChanges(execution.storageChanges);
  }

  async collectQueryDependencies(
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
      storageChanges: [],
      dependencyCollector,
      componentMetadata: definition.__syncoreComponent
    });
    return dependencyCollector;
  }

  private async executeQueryBuilder<TDocument>(
    options: ExecuteQueryBuilderOptions
  ): Promise<TDocument[]> {
    const table = this.deps.schema.getTableDefinition(options.tableName);
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
      if (this.deps.schema.isSearchIndexDisabled(options.tableName, searchIndex.name)) {
        whereClauses.push(
          `${fieldExpression("t", searchIndex.searchField)} LIKE ?`
        );
        params.push(`%${source.query.searchText}%`);
      } else {
        const searchTableName = resolveSearchIndexTableName(
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

    const rows = await this.deps.driver.all<DatabaseRow>(sql, params);
    return rows.map((row) =>
      this.deps.schema.deserializeDocument<TDocument>(options.tableName, row)
    );
  }

  private async invokeFunction<TResult>(
    definition: RegisteredSyncoreFunction,
    rawArgs: JsonObject,
    state: RuntimeExecutionState
  ): Promise<TResult> {
    const args = definition.argsValidator.parse(rawArgs) as JsonObject;
    const ctx = this.createContext(definition.kind, {
      ...state,
      componentMetadata:
        definition.__syncoreComponent ?? state.componentMetadata
    });
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
    const storage = this.deps.storage.createStorageApi(state);
    const scheduler = this.createSchedulerApi(state.componentMetadata);
    const callerMetadata = state.componentMetadata;

    return {
      db,
      storage,
      capabilities: this.deps.capabilities,
      capabilityDescriptors: this.deps.capabilityDescriptors,
      ...(callerMetadata
        ? {
            component: {
              path: callerMetadata.componentPath,
              name: callerMetadata.componentName,
              version: callerMetadata.version,
              capabilities: callerMetadata.grantedCapabilities
            }
          }
        : {}),
      scheduler,
      runQuery: <TArgs, TResult>(
        reference: FunctionReference<"query", TArgs, TResult>,
        ...args: OptionalArgsTuple<TArgs>
      ) =>
        this.runQuery(
          this.resolveReferenceForCaller(reference, "query", callerMetadata),
          normalizeOptionalArgs(args) as JsonObject
        ),
      runMutation: <TArgs, TResult>(
        reference: FunctionReference<"mutation", TArgs, TResult>,
        ...args: OptionalArgsTuple<TArgs>
      ) => {
        const resolvedReference = this.resolveReferenceForCaller(
          reference,
          "mutation",
          callerMetadata
        );
        const normalizedArgs = normalizeOptionalArgs(args);
        if (kind === "mutation") {
          return this.deps.driver.withSavepoint(
            `sp_${generateId().replace(/-/g, "_")}`,
            () =>
              this.invokeFunction<TResult>(
                this.resolveFunction(
                  resolvedReference,
                  "mutation",
                  callerMetadata
                ),
                normalizedArgs as JsonObject,
                {
                  mutationDepth: state.mutationDepth + 1,
                  changedTables: state.changedTables,
                  storageChanges: state.storageChanges,
                  componentMetadata: callerMetadata
                }
              )
          );
        }
        return this.runMutation(resolvedReference, normalizedArgs as JsonObject);
      },
      runAction: <TArgs, TResult>(
        reference: FunctionReference<"action", TArgs, TResult>,
        ...args: OptionalArgsTuple<TArgs>
      ) =>
        this.runAction(
          this.resolveReferenceForCaller(reference, "action", callerMetadata),
          normalizeOptionalArgs(args) as JsonObject
        )
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
        const scopedTableName = this.resolveTableName(
          tableName,
          state.componentMetadata
        );
        state.dependencyCollector?.add(`table:${scopedTableName}`);
        state.dependencyCollector?.add(`row:${scopedTableName}:${id}`);
        const row = await this.deps.driver.get<DatabaseRow>(
          `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(scopedTableName)} WHERE _id = ?`,
          [id]
        );
        return row
          ? this.deps.schema.deserializeDocument<
              DocumentForTable<TSchema, TTableName>
            >(scopedTableName, row)
          : null;
      },
      query: <TTableName extends TableNames<TSchema>>(tableName: TTableName) =>
        new RuntimeQueryBuilder<
          TSchema["tables"][TTableName],
          DocumentForTable<TSchema, TTableName>
        >(
          (options) =>
            this.executeQueryBuilder<DocumentForTable<TSchema, TTableName>>(
              {
                ...options,
                tableName: this.resolveTableName(
                  tableName,
                  state.componentMetadata
                )
              }
            ),
          this.resolveTableName(tableName, state.componentMetadata),
          state.dependencyCollector
        ),
      raw: <TValue>(sql: string, params?: unknown[]) =>
        this.deps.driver.all<TValue>(sql, params)
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
        const scopedTableName = this.resolveTableName(
          tableName,
          state.componentMetadata
        );
        const validated = this.deps.schema.validateDocument(
          scopedTableName,
          value as JsonObject
        );
        const id = generateId();
        const creationTime = Date.now();
        const json = stableStringify(validated);
        await this.deps.driver.run(
          `INSERT INTO ${quoteIdentifier(scopedTableName)} (_id, _creationTime, _json) VALUES (?, ?, ?)`,
          [id, creationTime, json]
        );
        await this.deps.schema.syncSearchIndexes(scopedTableName, {
          _id: id,
          _creationTime: creationTime,
          _json: json
        });
        state.changedTables.add(scopedTableName);
        return id;
      },
      patch: async <TTableName extends TableNames<TSchema>>(
        tableName: TTableName,
        id: string,
        value: PatchValueForTable<TSchema, TTableName>
      ) => {
        const scopedTableName = this.resolveTableName(
          tableName,
          state.componentMetadata
        );
        const current = await reader.get(tableName, id);
        if (!current) {
          throw new Error(`Document "${id}" does not exist in "${scopedTableName}".`);
        }
        const merged: JsonObject = { ...omitSystemFields(current), ...value };
        for (const key of Object.keys(merged)) {
          if (merged[key] === undefined) {
            delete merged[key];
          }
        }
        const validated = this.deps.schema.validateDocument(
          scopedTableName,
          merged
        );
        await this.deps.driver.run(
          `UPDATE ${quoteIdentifier(scopedTableName)} SET _json = ? WHERE _id = ?`,
          [stableStringify(validated), id]
        );
        const row = await this.deps.driver.get<DatabaseRow>(
          `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(scopedTableName)} WHERE _id = ?`,
          [id]
        );
        if (row) {
          await this.deps.schema.syncSearchIndexes(scopedTableName, row);
        }
        state.changedTables.add(scopedTableName);
      },
      replace: async <TTableName extends TableNames<TSchema>>(
        tableName: TTableName,
        id: string,
        value: InsertValueForTable<TSchema, TTableName>
      ) => {
        const scopedTableName = this.resolveTableName(
          tableName,
          state.componentMetadata
        );
        const validated = this.deps.schema.validateDocument(
          scopedTableName,
          value as JsonObject
        );
        await this.deps.driver.run(
          `UPDATE ${quoteIdentifier(scopedTableName)} SET _json = ? WHERE _id = ?`,
          [stableStringify(validated), id]
        );
        const row = await this.deps.driver.get<DatabaseRow>(
          `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(scopedTableName)} WHERE _id = ?`,
          [id]
        );
        if (!row) {
          throw new Error(`Document "${id}" does not exist in "${scopedTableName}".`);
        }
        await this.deps.schema.syncSearchIndexes(scopedTableName, row);
        state.changedTables.add(scopedTableName);
      },
      delete: async <TTableName extends TableNames<TSchema>>(
        tableName: TTableName,
        id: string
      ) => {
        const scopedTableName = this.resolveTableName(
          tableName,
          state.componentMetadata
        );
        await this.deps.driver.run(
          `DELETE FROM ${quoteIdentifier(scopedTableName)} WHERE _id = ?`,
          [id]
        );
        await this.deps.schema.removeSearchIndexes(scopedTableName, id);
        state.changedTables.add(scopedTableName);
      }
    };
  }

  private createSchedulerApi(
    componentMetadata?: SyncoreComponentFunctionMetadata
  ): SchedulerApi {
    return {
      runAfter: async (delayMs, reference, ...args) => {
        if (
          componentMetadata &&
          !componentMetadata.grantedCapabilities.includes("scheduler")
        ) {
          throw new Error(
            `Component ${JSON.stringify(componentMetadata.componentPath)} does not have scheduler capability.`
          );
        }
        const schedulerArgs = splitSchedulerArgs(args);
        const functionArgs = schedulerArgs[0];
        const misfirePolicy = schedulerArgs[1] ?? DEFAULT_MISFIRE_POLICY;
        const resolvedReference = this.resolveReferenceForCaller(
          reference,
          reference.kind,
          componentMetadata
        );
        return this.deps.scheduler.scheduleJob(
          Date.now() + delayMs,
          resolvedReference,
          functionArgs,
          misfirePolicy,
          componentMetadata
            ? `component:${componentMetadata.componentPath}:`
            : undefined
        );
      },
      runAt: async (timestamp, reference, ...args) => {
        if (
          componentMetadata &&
          !componentMetadata.grantedCapabilities.includes("scheduler")
        ) {
          throw new Error(
            `Component ${JSON.stringify(componentMetadata.componentPath)} does not have scheduler capability.`
          );
        }
        const schedulerArgs = splitSchedulerArgs(args);
        const functionArgs = schedulerArgs[0];
        const misfirePolicy = schedulerArgs[1] ?? DEFAULT_MISFIRE_POLICY;
        const value =
          timestamp instanceof Date ? timestamp.getTime() : timestamp;
        const resolvedReference = this.resolveReferenceForCaller(
          reference,
          reference.kind,
          componentMetadata
        );
        return this.deps.scheduler.scheduleJob(
          value,
          resolvedReference,
          functionArgs,
          misfirePolicy,
          componentMetadata
            ? `component:${componentMetadata.componentPath}:`
            : undefined
        );
      },
      cancel: async (id) => {
        await this.deps.scheduler.cancelScheduledJob(id);
      }
    };
  }

  private resolveFunction<TKind extends SyncoreFunctionKind>(
    reference: FunctionReference<TKind, unknown, unknown>,
    expectedKind: TKind,
    callerMetadata?: SyncoreComponentFunctionMetadata
  ): RegisteredSyncoreFunction & {
    kind: TKind;
  } {
    const resolvedReference = this.resolveReferenceForCaller(
      reference,
      expectedKind,
      callerMetadata
    );
    const definition = this.deps.functions[resolvedReference.name];
    if (!definition) {
      throw new Error(`Unknown function "${resolvedReference.name}".`);
    }
    if (definition.kind !== expectedKind) {
      throw new Error(
        `Function "${resolvedReference.name}" is a ${definition.kind}, expected ${expectedKind}.`
      );
    }
    const metadata = definition.__syncoreComponent;
    if (metadata?.visibility === "internal") {
      if (!callerMetadata) {
        throw new Error(
          `Function "${resolvedReference.name}" is internal to component "${metadata.componentPath}".`
        );
      }
      if (callerMetadata.componentPath !== metadata.componentPath) {
        throw new Error(
          `Function "${resolvedReference.name}" is internal to component "${metadata.componentPath}" and cannot be called from "${callerMetadata.componentPath}".`
        );
      }
    }
    return definition as RegisteredSyncoreFunction & {
      kind: TKind;
    };
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
    condition: {
      field: string;
      operator: "=" | ">" | ">=" | "<" | "<=";
      value: unknown;
    },
    params: unknown[]
  ): string {
    params.push(condition.value);
    return `${fieldExpression(tableAlias, condition.field)} ${condition.operator} ?`;
  }

  private resolveReferenceForCaller<TKind extends SyncoreFunctionKind>(
    reference: FunctionReference<TKind, unknown, unknown>,
    expectedKind: TKind,
    callerMetadata?: SyncoreComponentFunctionMetadata
  ): FunctionReference<TKind, unknown, unknown> {
    if (!callerMetadata) {
      return reference;
    }

    if (reference.name.startsWith("components/")) {
      return reference;
    }

    const bindingMatch = /^binding:([^/]+)\/(.+)$/.exec(reference.name);
    if (bindingMatch) {
      const bindingName = bindingMatch[1]!;
      const localName = bindingMatch[2]!;
      const targetComponentPath = callerMetadata.bindings[bindingName];
      if (!targetComponentPath) {
        throw new Error(
          `Component ${JSON.stringify(callerMetadata.componentPath)} does not define binding ${JSON.stringify(bindingName)}.`
        );
      }
      const canonicalName = toCanonicalComponentFunctionName(
        targetComponentPath,
        "public",
        localName
      );
      return {
        kind: expectedKind,
        name: canonicalName
      };
    }

    const internalName = toCanonicalComponentFunctionName(
      callerMetadata.componentPath,
      "internal",
      reference.name
    );
    if (this.deps.functions[internalName]) {
      return {
        kind: expectedKind,
        name: internalName
      };
    }

    const publicName = toCanonicalComponentFunctionName(
      callerMetadata.componentPath,
      "public",
      reference.name
    );
    if (this.deps.functions[publicName]) {
      return {
        kind: expectedKind,
        name: publicName
      };
    }

    return reference;
  }

  private resolveTableName<TTableName extends string>(
    tableName: TTableName,
    componentMetadata?: SyncoreComponentFunctionMetadata
  ): TTableName {
    if (!componentMetadata) {
      return tableName;
    }

    const scopedTableName = componentMetadata.localTables[tableName];
    if (!scopedTableName) {
      throw new Error(
        `Table ${JSON.stringify(tableName)} is not available inside component ${JSON.stringify(componentMetadata.componentPath)}.`
      );
    }

    return scopedTableName as TTableName;
  }
}

function collectChangedScopes(
  changedTables: Set<string>,
  storageChanges: Array<{
    storageId: string;
    reason: "storage-put" | "storage-delete";
  }>
): Set<ImpactScope> {
  return new Set<ImpactScope>([
    ...[...changedTables].map((tableName) => `table:${tableName}` as ImpactScope),
    ...storageChanges.map(
      (change) => `storage:${change.storageId}` as ImpactScope
    )
  ]);
}
