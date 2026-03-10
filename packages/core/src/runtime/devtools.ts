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
  AnySyncoreSchema,
  DevtoolsLiveQueryScope,
  SyncoreRuntimeOptions,
  SyncoreSqlDriver
} from "./runtime.js";
import { createFunctionReference } from "./runtime.js";
import type { SyncoreRuntime } from "./runtime.js";

export interface DevtoolsCommandHandlerDeps {
  driver: SyncoreSqlDriver;
  schema: AnySyncoreSchema;
  functions: SyncoreRuntimeOptions<AnySyncoreSchema>["functions"];
  runtime: SyncoreRuntime<AnySyncoreSchema>;
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
  const { driver, runtime, sql } = deps;

  return async (payload): Promise<SyncoreDevtoolsCommandResultPayload> => {
    await runtime.prepareForDirectAccess();
    switch (payload.kind) {
      case "fn.run": {
        const start = performance.now();
        try {
          let result: unknown;
          switch (payload.functionType) {
            case "query":
              result = await runtime.runQuery(
                createFunctionReference("query", payload.functionName),
                payload.args,
                { origin: "dashboard" }
              );
              break;
            case "mutation":
              result = await runtime.runMutation(
                createFunctionReference("mutation", payload.functionName),
                payload.args,
                { origin: "dashboard" }
              );
              break;
            case "action":
              result = await runtime.runAction(
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
          const id = await runDevtoolsMutation(runtime, async (ctx) =>
            ctx.db.insert(payload.table as never, payload.document as never)
          , { origin: "dashboard" });
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
          await runDevtoolsMutation(runtime, async (ctx) => {
            await ctx.db.patch(
              payload.table as never,
              payload.id,
              payload.fields as never
            );
            return null;
          }, { origin: "dashboard" });
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
          await runDevtoolsMutation(runtime, async (ctx) => {
            await ctx.db.delete(payload.table as never, payload.id);
            return null;
          }, { origin: "dashboard" });
          return { kind: "data.mutate.result", success: true };
        } catch (error) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "sql.read": {
        try {
          const sqlSupport = requireDevtoolsSqlSupport(sql);
          const databasePath = runtime.getDriverDatabasePath();
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
          runtime.notifyDevtoolsScopes(analysis.observedScopes);
          await runtime.forceRefreshDevtools(
            "SQL write executed from devtools dashboard.",
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

      case "scheduler.cancel": {
        try {
          const cancelled = await runtime.cancelScheduledJob(payload.jobId);
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
          const updated = await runtime.updateScheduledJob({
            id: payload.jobId,
            schedule: payload.schedule,
            args: payload.args,
            misfirePolicy: payload.misfirePolicy,
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
  const { driver, schema, functions, runtime } = deps;
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
        runtime,
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
        const client = runtime.createClient();
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

      const unsubscribeRuntime = runtime.subscribeToDevtoolsInvalidations(
        (scopes) => {
          void handleInvalidation(scopes);
        }
      );
      const unsubscribeEvents = runtime.subscribeToDevtoolsEvents((event) => {
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
  const { driver, schema, functions, runtime } = deps;
  await runtime.prepareForDirectAccess();

  switch (payload.kind) {
    case "runtime.summary":
      return {
        kind: "runtime.summary.result",
        summary: runtime.getRuntimeSummary()
      };
    case "runtime.activeQueries":
      return {
        kind: "runtime.activeQueries.result",
        activeQueries: runtime.getActiveQueryInfos()
      };
    case "fn.watch":
      throw new Error("Function watches are pushed incrementally and have no snapshot payload.");
    case "schema.tables": {
      const tables = await getSchemaTables(driver, schema);
      console.debug("[devtools] schema.tables", {
        runtimeId: runtime.getRuntimeId(),
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
        runtimeId: runtime.getRuntimeId(),
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
    case "sql.watch": {
      const sqlSupport = requireDevtoolsSqlSupport(deps.sql);
      const databasePath = runtime.getDriverDatabasePath();
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
  let sql = `SELECT _id, _creationTime, _json FROM "${table}"`;
  const params: unknown[] = [];

  if (filters && filters.length > 0) {
    sql += ` WHERE ${filters
      .map((filter) => {
        params.push(normalizeFilterValue(filter));
        return `json_extract(_json, '$.${filter.field}') ${filterOperatorToSql(filter.operator)} ?`;
      })
      .join(" AND ")}`;
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
    `SELECT COUNT(*) as count FROM "${table}"`
  );

  return {
    rows,
    totalCount: countRow?.count ?? 0
  };
}

async function getSchemaTables(
  driver: SyncoreSqlDriver,
  schema: AnySyncoreSchema
): Promise<TableSchema[]> {
  return Promise.all(
    schema.tableNames().map(async (name) => {
      const table = schema.getTable(name) as TableDefinition<
        Validator<unknown>
      >;
      const validatorDesc = describeValidator(table.validator);
      const fields =
        validatorDesc.kind === "object"
          ? Object.entries(validatorDesc.shape).map(
              ([fieldName, fieldDesc]) => {
                const desc = fieldDesc as {
                  kind: string;
                  inner?: { kind: string };
                };
                const optional = desc.kind === "optional";
                return {
                  name: fieldName,
                  type: optional ? (desc.inner?.kind ?? "any") : desc.kind,
                  optional
                };
              }
            )
          : [];

      fields.unshift(
        { name: "_id", type: "string", optional: false },
        { name: "_creationTime", type: "number", optional: false }
      );

      let documentCount = 0;
      try {
        const countRow = await driver.get<{ count: number }>(
          `SELECT COUNT(*) as count FROM "${name}"`
        );
        documentCount = countRow?.count ?? 0;
      } catch {
        documentCount = 0;
      }

      return {
        name,
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
      const schedule = safeReadSchedule(row.schedule_json);
      const scheduleLabel = schedule ? formatScheduleLabel(schedule) : undefined;
      return {
        id: row.id,
        functionName: row.function_name,
        args: JSON.parse(row.args_json) as Record<string, unknown>,
        scheduledAt: row.created_at,
        runAt: row.run_at,
        status: mapJobStatus(row.status),
        ...(row.status === "completed" || row.status === "failed"
          ? { completedAt: row.updated_at }
          : {}),
        ...(row.recurring_name ? { recurringName: row.recurring_name } : {}),
        ...(schedule ? { schedule } : {}),
        ...(scheduleLabel ? { scheduleLabel, cronSchedule: scheduleLabel } : {}),
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
  functions: SyncoreRuntimeOptions<AnySyncoreSchema>["functions"]
) {
  return Object.entries(functions)
    .filter(
      (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
        entry[1] !== undefined
    )
    .map(([name, fn]) => {
      const descriptor: {
        name: string;
        type: "query" | "mutation" | "action";
        file: string;
        args?: Record<string, unknown>;
      } = {
        name,
        type: fn.kind,
        file: inferFileFromFunctionName(name)
      };
      const argsDesc = describeValidator(fn.argsValidator);
      if (argsDesc.kind === "object") {
        descriptor.args = argsDesc.shape as Record<string, unknown>;
      }
      return descriptor;
    });
}

function inferFileFromFunctionName(name: string): string {
  const parts = name.split(":");
  if (parts.length > 1) {
    return `${parts[0]}.ts`;
  }
  return "unknown";
}

function normalizeFilterValue(filter: {
  operator: string;
  value: unknown;
}): unknown {
  switch (filter.operator) {
    case "contains":
      return `%${String(filter.value)}%`;
    case "startsWith":
      return `${String(filter.value)}%`;
    default:
      return filter.value;
  }
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

function safeReadSchedule(
  scheduleJson: string | null
): SchedulerRecurringSchedule | undefined {
  if (!scheduleJson) {
    return undefined;
  }
  try {
    return JSON.parse(scheduleJson) as SchedulerRecurringSchedule;
  } catch {
    return undefined;
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
  runtime: SyncoreRuntime<AnySyncoreSchema>,
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
    return runtime.runDevtoolsMutation(callback as never, meta);
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
    throw new Error("SQL devtools are only available in Node-hosted runtimes.");
  }
  return sql;
}
