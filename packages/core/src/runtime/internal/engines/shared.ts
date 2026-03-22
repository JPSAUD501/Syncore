import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type {
  SyncoreDevtoolsEvent,
  SyncoreDevtoolsEventOrigin
} from "@syncore/devtools-protocol";
import { searchIndexTableName, type TableDefinition, type Validator } from "@syncore/schema";
import type {
  MisfirePolicy,
  RecurringSchedule,
  SyncoreFunctionKind
} from "../../functions.js";
import type { SyncoreComponentFunctionMetadata } from "../../components.js";
import type {
  AnySyncoreSchema,
  DevtoolsLiveQueryScope,
  JsonObject,
  QueryCondition,
  QueryExpression,
  SearchQuery,
  SyncoreExternalChangeReason
} from "../../runtime.js";

export type DatabaseRow = {
  _id: string;
  _creationTime: number;
  _json: string;
};

export type DependencyKey = string;

export type ActiveQueryRecord = {
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

export type DevtoolsEventMeta = {
  origin?: SyncoreDevtoolsEventOrigin;
};

export type ScheduledJobRow = {
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

export type StorageMetadataRow = {
  _id: string;
  _creationTime: number;
  file_name: string | null;
  content_type: string | null;
  size: number;
  path: string;
};

export type StoragePendingRow = {
  _id: string;
  _creationTime: number;
  file_name: string | null;
  content_type: string | null;
};

export type QuerySource =
  | { type: "table" }
  | { type: "index"; name: string; range: QueryCondition[] }
  | { type: "search"; name: string; query: SearchQuery };

export type ExecuteQueryBuilderOptions = {
  tableName: string;
  source: QuerySource;
  filterExpression: QueryExpression | undefined;
  orderDirection: "asc" | "desc";
  dependencyCollector?: Set<DependencyKey>;
  limit?: number;
  offset?: number;
};

export type RuntimeExecutionState = {
  mutationDepth: number;
  changedTables: Set<string>;
  storageChanges: Array<{
    storageId: string;
    reason: Extract<
      SyncoreExternalChangeReason,
      "storage-put" | "storage-delete"
    >;
  }>;
  dependencyCollector?: Set<DependencyKey>;
  componentMetadata?: SyncoreComponentFunctionMetadata | undefined;
};

export function fieldExpression(tableAlias: string, field: string): string {
  const prefix = tableAlias ? `${tableAlias}.` : "";
  return `json_extract(${prefix}_json, '$.${field}')`;
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sortValue(value: unknown): unknown {
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

export function omitSystemFields<TDocument extends object>(
  document: TDocument
): JsonObject {
  const clone = { ...(document as Record<string, unknown>) };
  delete clone._id;
  delete clone._creationTime;
  return clone;
}

export function toSearchValue(value: unknown): string {
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

export function parseMisfirePolicy(
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

export function shouldRunMissedJob(
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

export function computeNextRun(
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

export function safeReadRecurringSchedule(
  scheduleJson: string | null
): RecurringSchedule | undefined {
  if (!scheduleJson) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(scheduleJson) as unknown;
    return isRecurringSchedule(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeOptionalArgs<TArgs>(
  args: [] | [TArgs] | readonly unknown[]
): TArgs {
  return (args[0] ?? {}) as TArgs;
}

export function splitSchedulerArgs(
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

export function inferDriverDatabasePath(driver: {
  filename?: string;
  databasePath?: string;
}): string | undefined {
  return driver.databasePath ?? driver.filename;
}

export function parseCanonicalComponentFunctionName(functionName: string):
  | {
      componentPath: string;
      visibility: "public" | "internal";
      localName: string;
    }
  | undefined {
  const match = /^components\/(.+)\/(public|internal)\/(.+)$/.exec(functionName);
  if (!match) {
    return undefined;
  }
  return {
    componentPath: match[1] ?? "",
    visibility: (match[2] as "public" | "internal") ?? "public",
    localName: match[3] ?? ""
  };
}

export function parseComponentScopedIdentifier(
  value: string
): { componentPath: string; localId: string } | undefined {
  const match = /^component:([^:]+):(.+)$/.exec(value);
  if (!match) {
    return undefined;
  }
  return {
    componentPath: match[1] ?? "",
    localId: match[2] ?? ""
  };
}

export function devtoolsScopesForEvent(
  event: SyncoreDevtoolsEvent
): Set<DevtoolsLiveQueryScope> {
  switch (event.type) {
    case "runtime.connected":
    case "runtime.disconnected":
      return new Set(["runtime.summary", "runtime.activeQueries"]);
    case "query.executed":
    case "query.invalidated":
      return new Set(["runtime.summary", "runtime.activeQueries"]);
    case "mutation.committed":
      return new Set([
        "runtime.summary",
        ...event.changedTables.map((table) => `table:${table}` as const)
      ]);
    case "scheduler.tick":
      return new Set(["scheduler.jobs", "runtime.summary"]);
    case "storage.updated":
      return new Set(["runtime.summary"]);
    case "action.completed":
    case "log":
      return new Set(["runtime.summary"]);
  }
}

export function getTableDefinition<TSchema extends AnySyncoreSchema>(
  schema: TSchema,
  tableName: string
): TableDefinition<Validator<unknown>> {
  return schema.getTable(tableName as never) as TableDefinition<
    Validator<unknown>
  >;
}

export function searchIndexKey(tableName: string, indexName: string): string {
  return `${tableName}:${indexName}`;
}

export function resolveSearchIndexTableName(
  tableName: string,
  indexName: string
): string {
  return searchIndexTableName(tableName, indexName);
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

function isRecurringSchedule(value: unknown): value is RecurringSchedule {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  switch (value.type) {
    case "interval":
      return (
        isOptionalNumber(value.seconds) &&
        isOptionalNumber(value.minutes) &&
        isOptionalNumber(value.hours)
      );
    case "daily":
      return (
        typeof value.hour === "number" &&
        typeof value.minute === "number" &&
        isOptionalString(value.timezone)
      );
    case "weekly":
      return (
        isDayOfWeek(value.dayOfWeek) &&
        typeof value.hour === "number" &&
        typeof value.minute === "number" &&
        isOptionalString(value.timezone)
      );
    default:
      return false;
  }
}

function isMisfirePolicy(value: unknown): value is MisfirePolicy {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === "number";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isDayOfWeek(
  value: unknown
): value is Extract<RecurringSchedule, { type: "weekly" }>["dayOfWeek"] {
  return (
    value === "sunday" ||
    value === "monday" ||
    value === "tuesday" ||
    value === "wednesday" ||
    value === "thursday" ||
    value === "friday" ||
    value === "saturday"
  );
}
