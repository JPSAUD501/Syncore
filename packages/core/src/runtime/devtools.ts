import type {
  SchedulerJob,
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
  type DevtoolsLiveQueryScope,
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
  const { driver, runtime } = deps;

  return async (payload): Promise<SyncoreDevtoolsCommandResultPayload> => {
    switch (payload.kind) {
      case "fn.run": {
        const start = performance.now();
        try {
          let result: unknown;
          switch (payload.functionType) {
            case "query":
              result = await runtime.runQuery(
                createFunctionReference("query", payload.functionName),
                payload.args
              );
              break;
            case "mutation":
              result = await runtime.runMutation(
                createFunctionReference("mutation", payload.functionName),
                payload.args
              );
              break;
            case "action":
              result = await runtime.runAction(
                createFunctionReference("action", payload.functionName),
                payload.args
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
          );
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
          });
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
          });
          return { kind: "data.mutate.result", success: true };
        } catch (error) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "sql.execute": {
        try {
          const trimmed = payload.query.trim().toUpperCase();
          if (
            trimmed.startsWith("SELECT") ||
            trimmed.startsWith("PRAGMA") ||
            trimmed.startsWith("EXPLAIN")
          ) {
            const rows = await driver.all<Record<string, unknown>>(
              payload.query
            );
            const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
            return {
              kind: "sql.result",
              columns,
              rows: rows.map((row) => columns.map((column) => row[column])),
              rowsAffected: 0
            };
          }

          const result = await driver.run(payload.query);
          await runtime.forceRefreshDevtools(
            "SQL write executed from devtools dashboard."
          );
          return {
            kind: "sql.result",
            columns: [],
            rows: [],
            rowsAffected: result.changes
          };
        } catch (error) {
          return {
            kind: "sql.result",
            columns: [],
            rows: [],
            rowsAffected: 0,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }

      case "scheduler.cancel": {
        try {
          await runDevtoolsMutation(runtime, async () => {
            await driver.run(
              `UPDATE "_scheduled_functions" SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'scheduled'`,
              [Date.now(), payload.jobId]
            );
            return null;
          });
          return { kind: "scheduler.cancel.result", success: true };
        } catch (error) {
          return {
            kind: "scheduler.cancel.result",
            success: false,
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
        runtime
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
        scopes: scopesForSubscription(payload)
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
    case "schema.tables":
      return {
        kind: "schema.tables.result",
        tables: await getSchemaTables(driver, schema)
      };
    case "data.table": {
      const result = await queryTable(
        driver,
        payload.table,
        payload.filters,
        payload.limit
      );
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
      schedule_json: string | null;
    }>(`SELECT * FROM "_scheduled_functions" ORDER BY run_at DESC LIMIT 200`);

    return rows.map((row) => ({
      id: row.id,
      functionName: row.function_name,
      args: JSON.parse(row.args_json) as Record<string, unknown>,
      scheduledAt: row.created_at,
      runAt: row.run_at,
      status: mapJobStatus(row.status),
      ...(row.status === "completed" || row.status === "failed"
        ? { completedAt: row.updated_at }
        : {}),
      ...(row.schedule_json && safeReadCron(row.schedule_json)
        ? { cronSchedule: safeReadCron(row.schedule_json)! }
        : {})
    }));
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

function safeReadCron(scheduleJson: string): string | undefined {
  try {
    const schedule = JSON.parse(scheduleJson) as { cron?: string };
    return schedule.cron;
  } catch {
    return undefined;
  }
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
  }) => Promise<TResult>
): Promise<TResult> {
  return runtime.runDevtoolsMutation(callback as never);
}

function scopesForSubscription(
  payload: SyncoreDevtoolsSubscriptionPayload
): Set<DevtoolsInvalidationScope> {
  switch (payload.kind) {
    case "runtime.summary":
      return new Set(["runtime.summary"]);
    case "runtime.activeQueries":
      return new Set(["runtime.activeQueries"]);
    case "schema.tables":
      return new Set(["schema.tables"]);
    case "data.table":
      return new Set([`table:${payload.table}`]);
    case "scheduler.jobs":
      return new Set(["scheduler.jobs"]);
    case "functions.catalog":
      return new Set(["all"]);
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
