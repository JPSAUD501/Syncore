import type {
  DataFilter,
  SchedulerJob,
  SyncoreRequestPayload,
  SyncoreResponsePayload
} from "@syncore/devtools-protocol";
import { describeValidator } from "@syncore/schema";
import type { TableDefinition, Validator } from "@syncore/schema";
import type {
  AnySyncoreSchema,
  SyncoreRuntimeOptions,
  SyncoreSqlDriver
} from "./runtime.js";
import { createFunctionReference } from "./runtime.js";
import type { SyncoreRuntime } from "./runtime.js";

export interface DevtoolsRequestHandlerDeps {
  driver: SyncoreSqlDriver;
  schema: AnySyncoreSchema;
  functions: SyncoreRuntimeOptions<AnySyncoreSchema>["functions"];
  runtime: SyncoreRuntime<AnySyncoreSchema>;
}

export type DevtoolsRequestHandler = (
  payload: SyncoreRequestPayload
) => Promise<SyncoreResponsePayload>;

export function createDevtoolsRequestHandler(
  deps: DevtoolsRequestHandlerDeps
): DevtoolsRequestHandler {
  const { driver, schema, functions, runtime } = deps;

  return async (payload): Promise<SyncoreResponsePayload> => {
    switch (payload.kind) {
      case "fn.list": {
        const defs = Object.entries(functions)
          .filter(
            (entry): entry is [string, NonNullable<(typeof entry)[1]>] =>
              entry[1] !== undefined
          )
          .map(([name, fn]) => {
            const def: {
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
              def.args = argsDesc.shape as Record<string, unknown>;
            }
            return def;
          });
        return { kind: "fn.list.result", functions: defs };
      }

      case "fn.run": {
        const start = performance.now();
        try {
          let result: unknown;
          switch (payload.functionType) {
            case "query": {
              const ref = createFunctionReference(
                "query",
                payload.functionName
              );
              result = await runtime.runQuery(ref, payload.args);
              break;
            }
            case "mutation": {
              const ref = createFunctionReference(
                "mutation",
                payload.functionName
              );
              result = await runtime.runMutation(ref, payload.args);
              break;
            }
            case "action": {
              const ref = createFunctionReference(
                "action",
                payload.functionName
              );
              result = await runtime.runAction(ref, payload.args);
              break;
            }
          }
          return {
            kind: "fn.run.result",
            result,
            durationMs: performance.now() - start
          };
        } catch (err) {
          return {
            kind: "fn.run.result",
            error: err instanceof Error ? err.message : String(err),
            durationMs: performance.now() - start
          };
        }
      }

      case "schema.get": {
        const tableNames = schema.tableNames();
        const tables = await Promise.all(
          tableNames.map(async (name) => {
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
                      const innerKind = optional
                        ? (desc.inner?.kind ?? "any")
                        : desc.kind;
                      return {
                        name: fieldName,
                        type: innerKind,
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
              if (countRow) {
                documentCount = countRow.count;
              }
            } catch {
              /* table may not exist yet */
            }

            return {
              name,
              fields,
              indexes: table.indexes.map(
                (idx: { name: string; fields: string[] }) => ({
                  name: idx.name,
                  fields: idx.fields,
                  unique: false
                })
              ),
              documentCount
            };
          })
        );
        return { kind: "schema.result", tables };
      }

      case "data.query": {
        try {
          let sql = `SELECT _id, _creationTime, _json FROM "${payload.table}"`;
          const params: unknown[] = [];

          if (payload.filters && payload.filters.length > 0) {
            const conditions = payload.filters.map((filter) => {
              const op = filterOperatorToSql(filter.operator);
              params.push(normalizeFilterValue(filter));
              return `json_extract(_json, '$.${filter.field}') ${op} ?`;
            });
            sql += ` WHERE ${conditions.join(" AND ")}`;
          }

          sql += " ORDER BY _creationTime DESC";
          if (payload.limit) {
            sql += ` LIMIT ${payload.limit}`;
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
            `SELECT COUNT(*) as count FROM "${payload.table}"`
          );

          return {
            kind: "data.result",
            rows,
            totalCount: countRow?.count ?? 0
          };
        } catch (err) {
          return {
            kind: "error",
            message: err instanceof Error ? err.message : String(err)
          };
        }
      }

      case "data.insert": {
        try {
          const id = generateId();
          const now = Date.now();
          await driver.run(
            `INSERT INTO "${payload.table}" (_id, _creationTime, _json) VALUES (?, ?, ?)`,
            [id, now, JSON.stringify(payload.document)]
          );
          return { kind: "data.mutate.result", success: true, id };
        } catch (err) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      case "data.patch": {
        try {
          const existing = await driver.get<{ _json: string }>(
            `SELECT _json FROM "${payload.table}" WHERE _id = ?`,
            [payload.id]
          );
          if (!existing) {
            return {
              kind: "data.mutate.result",
              success: false,
              error: `Document ${payload.id} not found`
            };
          }
          const doc = {
            ...(JSON.parse(existing._json) as Record<string, unknown>),
            ...payload.fields
          };
          await driver.run(
            `UPDATE "${payload.table}" SET _json = ? WHERE _id = ?`,
            [JSON.stringify(doc), payload.id]
          );
          return { kind: "data.mutate.result", success: true, id: payload.id };
        } catch (err) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      case "data.delete": {
        try {
          await driver.run(`DELETE FROM "${payload.table}" WHERE _id = ?`, [
            payload.id
          ]);
          return { kind: "data.mutate.result", success: true };
        } catch (err) {
          return {
            kind: "data.mutate.result",
            success: false,
            error: err instanceof Error ? err.message : String(err)
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
              rows: rows.map((row) => columns.map((col) => row[col])),
              rowsAffected: 0
            };
          }

          const result = await driver.run(payload.query);
          return {
            kind: "sql.result",
            columns: [],
            rows: [],
            rowsAffected: result.changes
          };
        } catch (err) {
          return {
            kind: "sql.result",
            columns: [],
            rows: [],
            rowsAffected: 0,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      case "scheduler.list": {
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
          }>(
            `SELECT * FROM "_scheduled_functions" ORDER BY run_at DESC LIMIT 200`
          );

          const jobs: SchedulerJob[] = rows.map((row) => {
            const job: SchedulerJob = {
              id: row.id,
              functionName: row.function_name,
              args: JSON.parse(row.args_json) as Record<string, unknown>,
              scheduledAt: row.created_at,
              runAt: row.run_at,
              status: mapJobStatus(row.status)
            };
            if (row.schedule_json) {
              try {
                const schedule = JSON.parse(row.schedule_json) as {
                  cron?: string;
                };
                if (schedule.cron) {
                  job.cronSchedule = schedule.cron;
                }
              } catch {
                /* ignore parse errors */
              }
            }
            if (row.status === "completed" || row.status === "failed") {
              job.completedAt = row.updated_at;
            }
            return job;
          });

          return { kind: "scheduler.list.result", jobs };
        } catch {
          return { kind: "scheduler.list.result", jobs: [] };
        }
      }

      case "scheduler.cancel": {
        try {
          await driver.run(
            `UPDATE "_scheduled_functions" SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'scheduled'`,
            [Date.now(), payload.jobId]
          );
          return { kind: "scheduler.cancel.result", success: true };
        } catch (err) {
          return {
            kind: "scheduler.cancel.result",
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      }

      default:
        return {
          kind: "error",
          message: `Unknown request kind: ${(payload as { kind: string }).kind}`
        };
    }
  };
}

function inferFileFromFunctionName(name: string): string {
  const parts = name.split(":");
  if (parts.length > 1) {
    return parts[0]! + ".ts";
  }
  return "unknown";
}

function normalizeFilterValue(filter: DataFilter): unknown {
  switch (filter.operator) {
    case "contains":
      return `%${String(filter.value)}%`;
    case "startsWith":
      return `${String(filter.value)}%`;
    default:
      return filter.value;
  }
}

function filterOperatorToSql(op: string): string {
  switch (op) {
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
      return "LIKE";
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

function generateId(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let id = "";
  for (let i = 0; i < 24; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}
