import type {
  SchedulerMisfirePolicy,
  SchedulerJob,
  SchedulerRecurringSchedule,
  SyncoreDevtoolsCommandPayload,
  SyncoreDevtoolsCommandResultPayload,
  SyncoreDevtoolsSubscriptionPayload,
  SyncoreDevtoolsSubscriptionResultPayload,
  TableSchema
} from "@syncore/devtools-protocol";
import { describeValidator } from "@syncore/schema";
import type { TableDefinition, Validator } from "@syncore/schema";
import type {
  DevtoolsLiveQueryScope,
  ImpactScope,
  SyncoreDataModel,
  SyncoreRuntimeAdmin,
  SyncoreRuntimeOptions,
  SyncoreSqlDriver
} from "./runtime.js";
import { createFunctionReference } from "./runtime.js";
import {
  parseCanonicalComponentFunctionName,
  parseComponentScopedIdentifier,
  quoteIdentifier,
  safeReadRecurringSchedule
} from "./internal/engines/shared.js";

export interface DevtoolsCommandHandlerDeps {
  driver: SyncoreSqlDriver;
  schema: SyncoreDataModel;
  functions: SyncoreRuntimeOptions<SyncoreDataModel>["functions"];
  admin: SyncoreRuntimeAdmin<SyncoreDataModel>;
  sql?: DevtoolsSqlSupport;
}

export type DevtoolsSqlMode = "read" | "write" | "ddl";

export interface DevtoolsSqlAnalysis {
  mode: DevtoolsSqlMode;
  readTables: string[];
  writeTables: string[];
  schemaChanged: boolean;
  observedScopes: DevtoolsLiveQueryScope[];
}

export interface DevtoolsSqlReadResult {
  columns: string[];
  rows: unknown[][];
  observedTables: string[];
}

export interface DevtoolsSqlSupport {
  analyzeSqlStatement(query: string): DevtoolsSqlAnalysis;
  ensureSqlMode(
    analysis: DevtoolsSqlAnalysis,
    expected: DevtoolsSqlMode | "watch"
  ): void;
  runReadonlyQuery(databasePath: string, query: string): DevtoolsSqlReadResult;
}

export type DevtoolsCommandHandler = (
  payload: SyncoreDevtoolsCommandPayload
) => Promise<SyncoreDevtoolsCommandResultPayload>;

export type DevtoolsSubscriptionListener = (
  payload: SyncoreDevtoolsSubscriptionResultPayload
) => void;

export interface DevtoolsSubscriptionHost {
  subscribe(
    subscriptionId: string,
    payload: SyncoreDevtoolsSubscriptionPayload,
    listener: DevtoolsSubscriptionListener
  ): Promise<void>;
  unsubscribe(subscriptionId: string): void;
  dispose(): void;
}

type DevtoolsInvalidationScope = DevtoolsLiveQueryScope;

interface SubscriptionRecord {
  payload: SyncoreDevtoolsSubscriptionPayload;
  listener: DevtoolsSubscriptionListener;
  unsubscribeRuntime: () => void;
  scopes: Set<DevtoolsInvalidationScope>;
}

export function createDevtoolsCommandHandler(
  deps: DevtoolsCommandHandlerDeps
): DevtoolsCommandHandler {
  const { driver, admin, sql } = deps;

  return async (payload): Promise<SyncoreDevtoolsCommandResultPayload> => {
    await admin.prepareForDirectAccess();
    switch (payload.kind) {
      case "fn.run": {
        const start = performance.now();
        try {
          let result: unknown;
          switch (payload.functionType) {
            case "query":
              result = await admin.runQuery(
                createFunctionReference("query", payload.functionName),
                payload.args,
                { origin: "dashboard" }
              );
              break;
            case "mutation":
              result = await admin.runMutation(
                createFunctionReference("mutation", payload.functionName),
                payload.args,
                { origin: "dashboard" }
              );
              break;
            case "action":
              result = await admin.runAction(
                createFunctionReference("action", payload.functionName),
                payload.args,
                { origin: "dashboard" }
              );
              break;
          }
          return {
            kind: "fn.run.result",
            result,
            durationMs: performance.now() - start
          };
        } catch (error) {
          return {
            kind: "fn.run.result",
            error: error instanceof Error ? error.message : String(error),
            durationMs: performance.now() - start
          };
        }
      }

      case "data.insert": {
        try {
          const id = await runDevtoolsMutation(
            admin,
            async (ctx) =>
              ctx.db.insert(payload.table as never, payload.document as never),
            { origin: "dashboard" }
          );
          notifyDataMutationScopes(admin, payload.table);
          return { kind: "data.mutate.result", success: true, id };
        } catch (error) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "data.patch": {
        try {
          await runDevtoolsMutation(
            admin,
            async (ctx) => {
              await ctx.db.patch(
                payload.table as never,
                payload.id,
                payload.fields as never
              );
              return null;
            },
            { origin: "dashboard" }
          );
          notifyDataMutationScopes(admin, payload.table);
          return {
            kind: "data.mutate.result",
            success: true,
            id: payload.id
          };
        } catch (error) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "data.delete": {
        try {
          await runDevtoolsMutation(
            admin,
            async (ctx) => {
              await ctx.db.delete(payload.table as never, payload.id);
              return null;
            },
            { origin: "dashboard" }
          );
          notifyDataMutationScopes(admin, payload.table);
          return { kind: "data.mutate.result", success: true };
        } catch (error) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "data.export": {
        try {
          const requestedTables =
            payload.tables && payload.tables.length > 0
              ? payload.tables
              : deps.schema.tableNames();
          const tables = await Promise.all(
            requestedTables.map(async (name) => {
              const result = await queryTable(driver, name);
              return {
                name,
                rows: result.rows,
                totalCount: result.totalCount
              };
            })
          );
          return {
            kind: "data.export.result",
            tables
          };
        } catch (error) {
          return {
            kind: "data.export.result",
            tables: [],
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "data.referenceOptions": {
        const limit = Math.min(Math.max(payload.limit ?? 100, 1), 200);
        const offset = Math.max(payload.offset ?? 0, 0);
        try {
          const result = await queryReferenceOptions(
            driver,
            payload.table,
            payload.search,
            limit,
            offset
          );
          return {
            kind: "data.referenceOptions.result",
            table: payload.table,
            rows: result.rows,
            totalCount: result.totalCount,
            offset,
            hasMore: offset + result.rows.length < result.totalCount
          };
        } catch (error) {
          return {
            kind: "data.referenceOptions.result",
            table: payload.table,
            rows: [],
            totalCount: 0,
            offset,
            hasMore: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "sql.read": {
        try {
          const sqlSupport = requireDevtoolsSqlSupport(sql);
          const databasePath = admin.getDriverDatabasePath();
          if (!databasePath) {
            throw new Error("SQL Read requires a file-backed database path.");
          }
          const { columns, rows } = sqlSupport.runReadonlyQuery(
            databasePath,
            payload.query
          );
          return {
            kind: "sql.read.result",
            columns,
            rows
          };
        } catch (error) {
          return {
            kind: "sql.read.result",
            columns: [],
            rows: [],
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "sql.write": {
        try {
          const sqlSupport = requireDevtoolsSqlSupport(sql);
          const analysis = sqlSupport.analyzeSqlStatement(payload.query);
          if (analysis.mode === "read") {
            throw new Error(
              "Use SQL Read or SQL Live for read-only statements."
            );
          }
          const result = await driver.run(payload.query);
          admin.notifyDevtoolsScopes(analysis.observedScopes);
          await admin.forceRefreshDevtools(
            "SQL write executed from devtools dashboard.",
            analysis.observedScopes.flatMap((scope) =>
              scope === "all" ? [] : ([scope] as ImpactScope[])
            ),
            { origin: "dashboard" }
          );
          return {
            kind: "sql.write.result",
            rowsAffected: result.changes,
            invalidationScopes: [...analysis.observedScopes]
          };
        } catch (error) {
          return {
            kind: "sql.write.result",
            rowsAffected: 0,
            invalidationScopes: [],
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "storage.list": {
        const limit = normalizeStorageLimit(payload.limit);
        const offset = Math.max(payload.offset ?? 0, 0);
        try {
          const result = await admin.listStorageObjects({
            limit,
            offset,
            ...(payload.search ? { search: payload.search } : {})
          });
          return {
            kind: "storage.list.result",
            entries: result.entries,
            totalCount: result.totalCount,
            offset,
            hasMore: offset + result.entries.length < result.totalCount
          };
        } catch (error) {
          return {
            kind: "storage.list.result",
            entries: [],
            totalCount: 0,
            offset,
            hasMore: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "storage.access.create": {
        try {
          const object = await admin.getStorageObjectAccessInfo(payload.id);
          if (!object) {
            return {
              kind: "storage.access.create.result",
              error: `Storage object ${JSON.stringify(payload.id)} was not found.`
            };
          }
          return {
            kind: "storage.access.create.result",
            entry: object.entry,
            supportsRange: object.supportsRange,
            error:
              "Storage access URLs must be created by the Syncore devtools hub."
          };
        } catch (error) {
          return {
            kind: "storage.access.create.result",
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "storage.readRange": {
        try {
          const object = await admin.readStorageObjectRange(
            payload.id,
            payload.offset,
            payload.length
          );
          if (!object) {
            return {
              kind: "storage.readRange.result",
              offset: payload.offset,
              bytesRead: 0,
              done: true,
              supportsRange: false,
              error: `Storage object ${JSON.stringify(payload.id)} was not found.`
            };
          }
          return {
            kind: "storage.readRange.result",
            entry: object.entry,
            offset: object.offset,
            bytesRead: object.bytesRead,
            done: object.done,
            supportsRange: object.supportsRange,
            base64: bytesToBase64(object.bytes)
          };
        } catch (error) {
          return {
            kind: "storage.readRange.result",
            offset: payload.offset,
            bytesRead: 0,
            done: true,
            supportsRange: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "storage.delete": {
        try {
          const deleted = await admin.deleteStorageObject(payload.id, {
            origin: "dashboard"
          });
          return {
            kind: "storage.delete.result",
            success: true,
            deleted
          };
        } catch (error) {
          return {
            kind: "storage.delete.result",
            success: false,
            deleted: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "scheduler.cancel": {
        try {
          const cancelled = await admin.cancelScheduledJob(payload.jobId);
          return {
            kind: "scheduler.cancel.result",
            success: true,
            cancelled
          };
        } catch (error) {
          return {
            kind: "scheduler.cancel.result",
            success: false,
            cancelled: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "scheduler.update": {
        try {
          const updated = await admin.updateScheduledJob({
            id: payload.jobId,
            args: payload.args,
            ...(payload.schedule ? { schedule: payload.schedule } : {}),
            ...(payload.misfirePolicy
              ? { misfirePolicy: payload.misfirePolicy }
              : {}),
            ...(payload.runAt !== undefined ? { runAt: payload.runAt } : {})
          });
          const jobs = updated ? await listSchedulerJobs(driver) : [];
          const updatedJob = jobs.find((job) => job.id === payload.jobId);
          return {
            kind: "scheduler.update.result",
            success: true,
            updated,
            ...(updated && updatedJob ? { job: updatedJob } : {})
          };
        } catch (error) {
          return {
            kind: "scheduler.update.result",
            success: false,
            updated: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      default:
        return {
          kind: "error",
          message: `Unknown devtools command: ${(payload as { kind: string }).kind}`
        };
    }
  };
}

export function createDevtoolsSubscriptionHost(
  deps: DevtoolsCommandHandlerDeps
): DevtoolsSubscriptionHost {
  const { driver, schema, functions, admin } = deps;
  const subscriptions = new Map<string, SubscriptionRecord>();

  const emit = async (
    payload: SyncoreDevtoolsSubscriptionPayload,
    listener: DevtoolsSubscriptionListener
  ) => {
    listener(
      await resolveSubscriptionPayload(payload, {
        driver,
        schema,
        functions,
        admin,
        ...(deps.sql ? { sql: deps.sql } : {})
      })
    );
  };

  const handleInvalidation = async (scopes: Set<DevtoolsInvalidationScope>) => {
    for (const record of subscriptions.values()) {
      if (!intersects(scopes, record.scopes)) {
        continue;
      }
      await emit(record.payload, record.listener);
    }
  };

  return {
    async subscribe(subscriptionId, payload, listener) {
      if (payload.kind === "fn.watch") {
        const definition = functions[payload.functionName];
        if (!definition || definition.kind !== "query") {
          listener({
            kind: "fn.watch.result",
            error: `Unknown query function: ${payload.functionName}`
          });
          return;
        }
        const client = admin.createClient();
        const watch = client.watchQuery(
          createFunctionReference("query", payload.functionName),
          payload.args
        );
        const emitWatchResult = () => {
          const error = watch.localQueryError();
          listener({
            kind: "fn.watch.result",
            ...(error
              ? {
                  error: error.message
                }
              : {
                  result: watch.localQueryResult()
                })
          });
        };
        const unsubscribeUpdates = watch.onUpdate(emitWatchResult);
        subscriptions.set(subscriptionId, {
          payload,
          listener,
          unsubscribeRuntime: () => {
            unsubscribeUpdates();
            watch.dispose?.();
          },
          scopes: new Set<DevtoolsInvalidationScope>(["all"])
        });
        emitWatchResult();
        return;
      }

      const unsubscribeRuntime = admin.subscribeToDevtoolsInvalidations(
        (scopes) => {
          void handleInvalidation(scopes);
        }
      );
      const unsubscribeEvents = admin.subscribeToDevtoolsEvents((event) => {
        if (event.type === "runtime.disconnected") {
          void emit(payload, listener);
        }
      });
      subscriptions.set(subscriptionId, {
        payload,
        listener,
        unsubscribeRuntime: () => {
          unsubscribeRuntime();
          unsubscribeEvents();
        },
        scopes: scopesForSubscription(payload, deps.sql)
      });
      await emit(payload, listener);
    },
    unsubscribe(subscriptionId) {
      const record = subscriptions.get(subscriptionId);
      if (!record) {
        return;
      }
      record.unsubscribeRuntime();
      subscriptions.delete(subscriptionId);
    },
    dispose() {
      for (const [subscriptionId, record] of subscriptions) {
        record.unsubscribeRuntime();
        subscriptions.delete(subscriptionId);
      }
    }
  };
}

async function resolveSubscriptionPayload(
  payload: SyncoreDevtoolsSubscriptionPayload,
  deps: DevtoolsCommandHandlerDeps
): Promise<SyncoreDevtoolsSubscriptionResultPayload> {
  const { driver, schema, functions, admin } = deps;
  await admin.prepareForDirectAccess();

  switch (payload.kind) {
    case "runtime.summary":
      return {
        kind: "runtime.summary.result",
        summary: admin.getRuntimeSummary()
      };
    case "runtime.activeQueries":
      return {
        kind: "runtime.activeQueries.result",
        activeQueries: admin.getActiveQueryInfos()
      };
    case "fn.watch":
      throw new Error(
        "Function watches are pushed incrementally and have no snapshot payload."
      );
    case "schema.tables": {
      const tables = await getSchemaTables(driver, schema);
      console.debug("[devtools] schema.tables", {
        runtimeId: admin.getRuntimeId(),
        tables: tables.map((table) => ({
          name: table.name,
          documentCount: table.documentCount
        }))
      });
      return {
        kind: "schema.tables.result",
        tables
      };
    }
    case "data.table": {
      const result = await queryTable(
        driver,
        payload.table,
        payload.filters,
        payload.limit
      );
      console.debug("[devtools] data.table", {
        runtimeId: admin.getRuntimeId(),
        table: payload.table,
        filters: payload.filters ?? [],
        limit: payload.limit,
        totalCount: result.totalCount,
        rowCount: result.rows.length,
        firstRow: result.rows[0] ?? null
      });
      return {
        kind: "data.table.result",
        rows: result.rows,
        totalCount: result.totalCount,
        ...(result.cursor ? { cursor: result.cursor } : {})
      };
    }
    case "scheduler.jobs":
      return {
        kind: "scheduler.jobs.result",
        jobs: await listSchedulerJobs(driver)
      };
    case "functions.catalog":
      return {
        kind: "functions.catalog.result",
        functions: listFunctions(functions)
      };
    case "storage.list": {
      const limit = normalizeStorageLimit(payload.limit);
      const offset = Math.max(payload.offset ?? 0, 0);
      try {
        const result = await admin.listStorageObjects({
          limit,
          offset,
          ...(payload.search ? { search: payload.search } : {})
        });
        return {
          kind: "storage.list.result",
          entries: result.entries,
          totalCount: result.totalCount,
          offset,
          hasMore: offset + result.entries.length < result.totalCount
        };
      } catch (error) {
        return {
          kind: "storage.list.result",
          entries: [],
          totalCount: 0,
          offset,
          hasMore: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
    case "sql.watch": {
      const sqlSupport = requireDevtoolsSqlSupport(deps.sql);
      const databasePath = admin.getDriverDatabasePath();
      if (!databasePath) {
        throw new Error("SQL Live requires a file-backed database path.");
      }
      const { columns, rows, observedTables } = sqlSupport.runReadonlyQuery(
        databasePath,
        payload.query
      );
      return {
        kind: "sql.watch.result",
        columns,
        rows,
        observedTables
      };
    }
  }
}

async function queryTable(
  driver: SyncoreSqlDriver,
  table: string,
  filters?: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>,
  limit?: number
): Promise<{
  rows: Record<string, unknown>[];
  totalCount: number;
  cursor?: string;
}> {
  let sql = `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(table)}`;
  const params: unknown[] = [];
  const whereClauses: string[] = [];

  if (filters && filters.length > 0) {
    for (const filter of filters) {
      whereClauses.push(filterToSql(filter));
      params.push(normalizeFilterValue(filter));
    }
    sql += ` WHERE ${whereClauses.join(" AND ")}`;
  }

  sql += " ORDER BY _creationTime DESC";
  if (limit) {
    sql += ` LIMIT ${limit}`;
  }

  const rawRows = await driver.all<{
    _id: string;
    _creationTime: number;
    _json: string;
  }>(sql, params);
  const rows = rawRows.map((row) => ({
    _id: row._id,
    _creationTime: row._creationTime,
    ...(JSON.parse(row._json) as Record<string, unknown>)
  }));
  const countRow = await driver.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${quoteIdentifier(table)}${
      whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : ""
    }`,
    params
  );

  return {
    rows,
    totalCount: countRow?.count ?? 0
  };
}

async function queryReferenceOptions(
  driver: SyncoreSqlDriver,
  table: string,
  search: string | undefined,
  limit: number,
  offset: number
): Promise<{
  rows: Record<string, unknown>[];
  totalCount: number;
}> {
  let sql = `SELECT _id, _creationTime, _json FROM ${quoteIdentifier(table)}`;
  const params: unknown[] = [];
  const trimmedSearch = search?.trim();
  const whereClause = trimmedSearch ? " WHERE _id LIKE ? OR _json LIKE ?" : "";
  if (trimmedSearch) {
    const like = `%${trimmedSearch}%`;
    params.push(like, like);
  }

  sql += `${whereClause} ORDER BY _creationTime DESC LIMIT ? OFFSET ?`;
  const rawRows = await driver.all<{
    _id: string;
    _creationTime: number;
    _json: string;
  }>(sql, [...params, limit, offset]);
  const rows = rawRows.map((row) => ({
    _id: row._id,
    _creationTime: row._creationTime,
    ...(JSON.parse(row._json) as Record<string, unknown>)
  }));
  const countRow = await driver.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM ${quoteIdentifier(table)}${whereClause}`,
    params
  );
  return {
    rows,
    totalCount: countRow?.count ?? 0
  };
}

async function getSchemaTables(
  driver: SyncoreSqlDriver,
  schema: SyncoreDataModel
): Promise<TableSchema[]> {
  return Promise.all(
    schema.tableNames().map(async (name) => {
      const table = schema.getTable(name) as TableDefinition<
        Validator<Record<string, unknown>, Record<string, unknown>, string>
      >;
      const validatorDesc = describeValidator(table.validator);
      const fields =
        validatorDesc.kind === "object"
          ? Object.entries(validatorDesc.shape).map(
              ([fieldName, fieldDesc]) => {
                const field = fieldDesc as {
                  validator: { kind: string; tableName?: string };
                  optional: boolean;
                };
                return {
                  name: fieldName,
                  type: field.validator.kind,
                  optional: field.optional,
                  ...(field.validator.kind === "id" && field.validator.tableName
                    ? { referenceTable: field.validator.tableName }
                    : {})
                };
              }
            )
          : [];

      fields.unshift(
        { name: "_id", type: "string", optional: false },
        { name: "_creationTime", type: "number", optional: false }
      );

      const documentCount = await driver
        .get<{ count: number }>(`SELECT COUNT(*) as count FROM "${name}"`)
        .then((countRow) => countRow?.count ?? 0)
        .catch(() => 0);

      return {
        name,
        ...(table.options.tableName
          ? { displayName: table.options.tableName }
          : {}),
        owner: table.options.componentPath
          ? ("component" as const)
          : ("root" as const),
        ...(table.options.componentPath
          ? { componentPath: table.options.componentPath }
          : {}),
        ...(table.options.componentName
          ? { componentName: table.options.componentName }
          : {}),
        fields,
        indexes: table.indexes.map((index) => ({
          name: index.name,
          fields: index.fields,
          unique: false
        })),
        documentCount
      };
    })
  );
}

async function listSchedulerJobs(
  driver: SyncoreSqlDriver
): Promise<SchedulerJob[]> {
  try {
    const rows = await driver.all<{
      id: string;
      function_name: string;
      args_json: string;
      status: string;
      run_at: number;
      created_at: number;
      updated_at: number;
      recurring_name: string | null;
      schedule_json: string | null;
      timezone: string | null;
      misfire_policy: string;
      last_run_at: number | null;
      window_ms: number | null;
    }>(`SELECT * FROM "_scheduled_functions" ORDER BY run_at DESC LIMIT 200`);

    return rows.map((row) => {
      const schedule = safeReadRecurringSchedule(row.schedule_json);
      const scheduleLabel = schedule
        ? formatScheduleLabel(schedule)
        : undefined;
      const functionComponent = parseCanonicalComponentFunctionName(
        row.function_name
      );
      const idComponent = parseComponentScopedIdentifier(row.id);
      return {
        id: row.id,
        functionName: row.function_name,
        owner:
          functionComponent || idComponent
            ? ("component" as const)
            : ("root" as const),
        ...(functionComponent
          ? {
              componentPath: functionComponent.componentPath
            }
          : idComponent
            ? {
                componentPath: idComponent.componentPath
              }
            : {}),
        args: JSON.parse(row.args_json) as Record<string, unknown>,
        scheduledAt: row.created_at,
        runAt: row.run_at,
        status: mapJobStatus(row.status),
        ...(row.status === "completed" || row.status === "failed"
          ? { completedAt: row.updated_at }
          : {}),
        ...(row.recurring_name ? { recurringName: row.recurring_name } : {}),
        ...(schedule ? { schedule } : {}),
        ...(scheduleLabel
          ? { scheduleLabel, cronSchedule: scheduleLabel }
          : {}),
        ...(row.timezone ? { timezone: row.timezone } : {}),
        ...(row.last_run_at !== null ? { lastRunAt: row.last_run_at } : {}),
        ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
        misfirePolicy: readMisfirePolicy(row.misfire_policy, row.window_ms)
      };
    });
  } catch {
    return [];
  }
}

function listFunctions(
  functions: SyncoreRuntimeOptions<SyncoreDataModel>["functions"]
) {
  return Object.entries(functions)
    .filter(
      (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
        entry[1] !== undefined
    )
    .map(([name, fn]) => {
      const componentFunction = parseCanonicalComponentFunctionName(name);
      const descriptor: {
        name: string;
        type: "query" | "mutation" | "action";
        file?: string;
        modulePath?: string;
        namespace?: string;
        metadataAvailable?: boolean;
        owner?: "root" | "component";
        componentPath?: string;
        visibility?: "public" | "internal";
        localName?: string;
        args?: Record<string, unknown>;
      } = {
        name,
        type: fn.kind,
        owner: componentFunction ? "component" : "root",
        namespace: inferFunctionNamespace(name),
        metadataAvailable: componentFunction !== null || name.includes(":"),
        ...(componentFunction
          ? {
              file: `components/${componentFunction.componentPath}`,
              modulePath: componentFunction.componentPath,
              componentPath: componentFunction.componentPath,
              visibility: componentFunction.visibility,
              localName: componentFunction.localName
            }
          : inferFileFromFunctionName(name)
            ? {
                file: inferFileFromFunctionName(name),
                modulePath: inferFunctionNamespace(name)
              }
            : {})
      };
      const argsDesc = describeValidator(fn.argsValidator);
      if (argsDesc.kind === "object") {
        descriptor.args = argsDesc.shape as Record<string, unknown>;
      }
      return descriptor;
    });
}

function inferFileFromFunctionName(name: string): string {
  const componentFunction = parseCanonicalComponentFunctionName(name);
  if (componentFunction) {
    return `components/${componentFunction.componentPath}`;
  }
  const parts = name.split(":");
  if (parts.length > 1) {
    return `${parts[0]}.ts`;
  }
  return "";
}

function inferFunctionNamespace(name: string): string {
  const componentFunction = parseCanonicalComponentFunctionName(name);
  if (componentFunction) {
    return componentFunction.componentPath;
  }
  if (name.includes(":")) {
    return name.split(":")[0] ?? "root";
  }
  if (name.includes("/")) {
    return name.split("/")[0] ?? "root";
  }
  return "root";
}

function normalizeFilterValue(filter: {
  operator: string;
  value: unknown;
}): unknown {
  const value = coerceFilterValue(filter.value);
  switch (filter.operator) {
    case "contains":
      return `%${String(value)}%`;
    case "startsWith":
      return `${String(value)}%`;
    default:
      return value;
  }
}

function filterToSql(filter: { field: string; operator: string }): string {
  const operator = filterOperatorToSql(filter.operator);
  if (filter.field === "_id") {
    return `_id ${operator} ?`;
  }
  if (filter.field === "_creationTime") {
    return `_creationTime ${operator} ?`;
  }
  return `json_extract(_json, ${JSON.stringify(`$.${filter.field}`)}) ${operator} ?`;
}

function coerceFilterValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const numberValue = Number(trimmed);
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }
  return value;
}

function filterOperatorToSql(operator: string): string {
  switch (operator) {
    case "eq":
      return "=";
    case "neq":
      return "!=";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    case "contains":
    case "startsWith":
      return "LIKE";
    default:
      return "=";
  }
}

function mapJobStatus(
  status: string
): "pending" | "running" | "completed" | "failed" | "cancelled" {
  switch (status) {
    case "scheduled":
      return "pending";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
    case "skipped":
      return "cancelled";
    default:
      return "pending";
  }
}

function formatScheduleLabel(schedule: SchedulerRecurringSchedule): string {
  switch (schedule.type) {
    case "interval": {
      const parts: string[] = [];
      if (schedule.hours) {
        parts.push(`${schedule.hours}h`);
      }
      if (schedule.minutes) {
        parts.push(`${schedule.minutes}m`);
      }
      if (schedule.seconds) {
        parts.push(`${schedule.seconds}s`);
      }
      return parts.length > 0 ? `Every ${parts.join(" ")}` : "Recurring";
    }
    case "daily":
      return `Daily ${padNumber(schedule.hour)}:${padNumber(schedule.minute)}${schedule.timezone ? ` ${schedule.timezone}` : ""}`;
    case "weekly":
      return `Weekly ${capitalize(schedule.dayOfWeek)} ${padNumber(schedule.hour)}:${padNumber(schedule.minute)}${schedule.timezone ? ` ${schedule.timezone}` : ""}`;
    default:
      return "Recurring";
  }
}

function readMisfirePolicy(
  type: string,
  windowMs: number | null
): SchedulerMisfirePolicy {
  if (type === "windowed") {
    return {
      type,
      windowMs: windowMs ?? 0
    };
  }
  if (type === "skip" || type === "run_once_if_missed") {
    return { type };
  }
  return { type: "catch_up" };
}

function padNumber(value: number): string {
  return String(value).padStart(2, "0");
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

async function runDevtoolsMutation<TResult>(
  admin: SyncoreRuntimeAdmin<SyncoreDataModel>,
  callback: (ctx: {
    db: {
      insert(
        tableName: string,
        value: Record<string, unknown>
      ): Promise<string>;
      patch(
        tableName: string,
        id: string,
        value: Record<string, unknown>
      ): Promise<void>;
      delete(tableName: string, id: string): Promise<void>;
    };
  }) => Promise<TResult>,
  meta?: { origin?: "dashboard" }
): Promise<TResult> {
  return admin.runDevtoolsMutation(callback as never, meta);
}

function notifyDataMutationScopes(
  admin: SyncoreRuntimeAdmin<SyncoreDataModel>,
  tableName: string
): void {
  admin.notifyDevtoolsScopes(["schema.tables", `table:${tableName}`]);
}

function normalizeStorageLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 100, 1), 500);
}

function bytesToBase64(bytes: Uint8Array): string {
  const binaryChunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += binaryChunkSize) {
    const chunk = bytes.slice(offset, offset + binaryChunkSize);
    binary += String.fromCharCode(...chunk);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  const buffer = globalThis as typeof globalThis & {
    Buffer?: {
      from(input: Uint8Array): { toString(encoding: "base64"): string };
    };
  };
  if (buffer.Buffer) {
    return buffer.Buffer.from(bytes).toString("base64");
  }
  throw new Error("Base64 encoding is not available in this environment.");
}

function scopesForSubscription(
  payload: SyncoreDevtoolsSubscriptionPayload,
  sql?: DevtoolsSqlSupport
): Set<DevtoolsInvalidationScope> {
  switch (payload.kind) {
    case "runtime.summary":
      return new Set(["runtime.summary"]);
    case "runtime.activeQueries":
      return new Set(["runtime.activeQueries"]);
    case "fn.watch":
      return new Set(["all"]);
    case "schema.tables":
      return new Set(["schema.tables"]);
    case "data.table":
      return new Set<DevtoolsInvalidationScope>([`table:${payload.table}`]);
    case "scheduler.jobs":
      return new Set(["scheduler.jobs"]);
    case "functions.catalog":
      return new Set(["all"]);
    case "storage.list":
      return new Set(["storage.objects"]);
    case "sql.watch": {
      try {
        const sqlSupport = requireDevtoolsSqlSupport(sql);
        const analysis = sqlSupport.analyzeSqlStatement(payload.query);
        sqlSupport.ensureSqlMode(analysis, "watch");
        return new Set<DevtoolsInvalidationScope>(analysis.observedScopes);
      } catch {
        return new Set<DevtoolsInvalidationScope>(["all"]);
      }
    }
    default:
      return new Set<DevtoolsInvalidationScope>(["all"]);
  }
}

function intersects(
  a: Set<DevtoolsInvalidationScope>,
  b: Set<DevtoolsInvalidationScope>
): boolean {
  if (a.has("all") || b.has("all")) {
    return true;
  }
  for (const value of a) {
    if (b.has(value)) {
      return true;
    }
  }
  return false;
}

function requireDevtoolsSqlSupport(
  sql?: DevtoolsSqlSupport
): DevtoolsSqlSupport {
  if (!sql) {
    throw new Error("SQL Console is not available for this runtime.");
  }
  return sql;
}
