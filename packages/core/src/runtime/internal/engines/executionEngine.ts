import type {
  FunctionArgsFromDefinition,
  FunctionKindFromDefinition,
  FunctionReference,
  FunctionResultFromDefinition,
  MisfirePolicy,
  SyncoreFunctionDefinition,
  SyncoreFunctionKind
} from "../../functions.js";
import type {
  ActionCtx,
  AnySyncoreSchema,
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
  PaginationOptions,
  PaginationResult,
  QueryBuilder,
  QueryCtx,
  QueryExpression,
  SchedulerApi,
  SearchIndexBuilder,
  SearchQuery,
  SyncoreCapabilities,
  SyncoreClient,
  SyncoreDatabaseReader,
  SyncoreDatabaseWriter,
  SyncoreFunctionRegistry,
  SyncoreSqlDriver,
  SyncoreWatch,
  TableNames
} from "../../runtime.js";
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

const DEFAULT_MISFIRE_POLICY: MisfirePolicy = { type: "catch_up" };

type OptionalArgsTuple<TArgs> =
  Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];

type ExecutionEngineDeps<TSchema extends AnySyncoreSchema> = {
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

class RuntimeIndexRangeBuilder implements IndexRangeBuilder {
  private readonly conditions: Array<{
    field: string;
    operator: "=" | ">" | ">=" | "<" | "<=";
    value: unknown;
  }> = [];

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

  build() {
    return [...this.conditions];
  }
}

class RuntimeSearchIndexBuilder implements SearchIndexBuilder {
  private searchField: string | undefined;
  private searchText: string | undefined;
  private readonly filters: Array<{
    field: string;
    operator: "=";
    value: unknown;
  }> = [];

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

export class ExecutionEngine<TSchema extends AnySyncoreSchema> {
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
        this.watchQuery(reference, normalizeOptionalArgs(args) as JsonObject)
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
      dependencyCollector
    });

    this.deps.devtools.emit({
      type: "query.executed",
      runtimeId: this.deps.runtimeId,
      queryId: reference.name,
      functionName: reference.name,
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
          storageChanges: transactionState.storageChanges
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
        storageChanges: state.storageChanges
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
      dependencyCollector
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
    const storage = this.deps.storage.createStorageApi(state);
    const scheduler = this.createSchedulerApi();

    return {
      db,
      storage,
      capabilities: this.deps.capabilities,
      capabilityDescriptors: this.deps.capabilityDescriptors,
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
          return this.deps.driver.withSavepoint(
            `sp_${generateId().replace(/-/g, "_")}`,
            () =>
              this.invokeFunction<TResult>(
                this.resolveFunction(reference, "mutation"),
                normalizedArgs as JsonObject,
                {
                  mutationDepth: state.mutationDepth + 1,
                  changedTables: state.changedTables,
                  storageChanges: state.storageChanges
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
        const row = await this.deps.driver.get<DatabaseRow>(
          `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(tableName)} WHERE _id = ?`,
          [id]
        );
        return row
          ? this.deps.schema.deserializeDocument<
              DocumentForTable<TSchema, TTableName>
            >(tableName, row)
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
        const validated = this.deps.schema.validateDocument(
          tableName,
          value as JsonObject
        );
        const id = generateId();
        const creationTime = Date.now();
        const json = stableStringify(validated);
        await this.deps.driver.run(
          `INSERT INTO ${quoteIdentifier(tableName)} (_id, _creationTime, _json) VALUES (?, ?, ?)`,
          [id, creationTime, json]
        );
        await this.deps.schema.syncSearchIndexes(tableName, {
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
        const validated = this.deps.schema.validateDocument(tableName, merged);
        await this.deps.driver.run(
          `UPDATE ${quoteIdentifier(tableName)} SET _json = ? WHERE _id = ?`,
          [stableStringify(validated), id]
        );
        const row = await this.deps.driver.get<DatabaseRow>(
          `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(tableName)} WHERE _id = ?`,
          [id]
        );
        if (row) {
          await this.deps.schema.syncSearchIndexes(tableName, row);
        }
        state.changedTables.add(tableName);
      },
      replace: async <TTableName extends TableNames<TSchema>>(
        tableName: TTableName,
        id: string,
        value: InsertValueForTable<TSchema, TTableName>
      ) => {
        const validated = this.deps.schema.validateDocument(
          tableName,
          value as JsonObject
        );
        await this.deps.driver.run(
          `UPDATE ${quoteIdentifier(tableName)} SET _json = ? WHERE _id = ?`,
          [stableStringify(validated), id]
        );
        const row = await this.deps.driver.get<DatabaseRow>(
          `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(tableName)} WHERE _id = ?`,
          [id]
        );
        if (!row) {
          throw new Error(`Document "${id}" does not exist in "${tableName}".`);
        }
        await this.deps.schema.syncSearchIndexes(tableName, row);
        state.changedTables.add(tableName);
      },
      delete: async <TTableName extends TableNames<TSchema>>(
        tableName: TTableName,
        id: string
      ) => {
        await this.deps.driver.run(
          `DELETE FROM ${quoteIdentifier(tableName)} WHERE _id = ?`,
          [id]
        );
        await this.deps.schema.removeSearchIndexes(tableName, id);
        state.changedTables.add(tableName);
      }
    };
  }

  private createSchedulerApi(): SchedulerApi {
    return {
      runAfter: async (delayMs, reference, ...args) => {
        const schedulerArgs = splitSchedulerArgs(args);
        const functionArgs = schedulerArgs[0];
        const misfirePolicy = schedulerArgs[1] ?? DEFAULT_MISFIRE_POLICY;
        return this.deps.scheduler.scheduleJob(
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
        return this.deps.scheduler.scheduleJob(
          value,
          reference,
          functionArgs,
          misfirePolicy
        );
      },
      cancel: async (id) => {
        await this.deps.scheduler.cancelScheduledJob(id);
      }
    };
  }

  private resolveFunction<TKind extends SyncoreFunctionKind>(
    reference: FunctionReference<TKind, unknown, unknown>,
    expectedKind: TKind
  ): SyncoreFunctionDefinition<TKind, unknown, unknown, unknown> {
    const definition = this.deps.functions[reference.name];
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
