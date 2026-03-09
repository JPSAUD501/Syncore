export type SyncoreDevtoolsEvent =
  | {
      type: "runtime.connected";
      runtimeId: string;
      platform: string;
      timestamp: number;
    }
  | {
      type: "runtime.disconnected";
      runtimeId: string;
      timestamp: number;
    }
  | {
      type: "query.executed";
      runtimeId: string;
      queryId: string;
      functionName: string;
      dependencies: string[];
      durationMs: number;
      timestamp: number;
    }
  | {
      type: "query.invalidated";
      runtimeId: string;
      queryId: string;
      reason: string;
      timestamp: number;
    }
  | {
      type: "mutation.committed";
      runtimeId: string;
      mutationId: string;
      functionName: string;
      changedTables: string[];
      durationMs: number;
      timestamp: number;
    }
  | {
      type: "action.completed";
      runtimeId: string;
      actionId: string;
      functionName: string;
      durationMs: number;
      timestamp: number;
      error?: string;
    }
  | {
      type: "scheduler.tick";
      runtimeId: string;
      executedJobIds: string[];
      timestamp: number;
    }
  | {
      type: "storage.updated";
      runtimeId: string;
      storageId: string;
      operation: "put" | "delete";
      timestamp: number;
    }
  | {
      type: "log";
      runtimeId: string;
      level: "info" | "warn" | "error";
      message: string;
      timestamp: number;
    };

export interface SyncoreDevtoolsSnapshot {
  runtimeId: string;
  platform: string;
  connectedAt: number;
  activeQueries: Array<{
    id: string;
    functionName: string;
    dependencyKeys: string[];
    lastRunAt: number;
  }>;
  pendingJobs: Array<{
    id: string;
    functionName: string;
    runAt: number;
    status: string;
  }>;
  recentEvents: SyncoreDevtoolsEvent[];
}

/* ------------------------------------------------------------------ */
/*  Runtime → Dashboard messages                                       */
/* ------------------------------------------------------------------ */

export type SyncoreDevtoolsMessage =
  | { type: "hello"; runtimeId: string; platform: string }
  | { type: "event"; event: SyncoreDevtoolsEvent }
  | { type: "snapshot"; snapshot: SyncoreDevtoolsSnapshot }
  | { type: "ping" }
  | { type: "pong" }
  /* Responses to dashboard requests */
  | { type: "response"; requestId: string; payload: SyncoreResponsePayload };

/* ------------------------------------------------------------------ */
/*  Dashboard → Runtime requests                                       */
/* ------------------------------------------------------------------ */

export interface SyncoreDevtoolsRequest {
  type: "request";
  requestId: string;
  payload: SyncoreRequestPayload;
}

export type SyncoreRequestPayload =
  /* Functions */
  | { kind: "fn.list" }
  | {
      kind: "fn.run";
      functionName: string;
      functionType: "query" | "mutation" | "action";
      args: Record<string, unknown>;
    }
  /* Data */
  | {
      kind: "data.query";
      table: string;
      filters?: DataFilter[];
      limit?: number;
      cursor?: string;
    }
  | { kind: "data.insert"; table: string; document: Record<string, unknown> }
  | {
      kind: "data.patch";
      table: string;
      id: string;
      fields: Record<string, unknown>;
    }
  | { kind: "data.delete"; table: string; id: string }
  /* Schema */
  | { kind: "schema.get" }
  /* SQL */
  | { kind: "sql.execute"; query: string }
  /* Scheduler */
  | { kind: "scheduler.list" }
  | { kind: "scheduler.cancel"; jobId: string };

export interface DataFilter {
  field: string;
  operator:
    | "eq"
    | "neq"
    | "gt"
    | "gte"
    | "lt"
    | "lte"
    | "contains"
    | "startsWith";
  value: unknown;
}

/* ------------------------------------------------------------------ */
/*  Response payloads                                                   */
/* ------------------------------------------------------------------ */

export type SyncoreResponsePayload =
  | { kind: "fn.list.result"; functions: FunctionDefinition[] }
  | {
      kind: "fn.run.result";
      result?: unknown;
      error?: string;
      durationMs: number;
    }
  | {
      kind: "data.result";
      rows: Record<string, unknown>[];
      totalCount: number;
      cursor?: string;
    }
  | {
      kind: "data.mutate.result";
      success: boolean;
      id?: string;
      error?: string;
    }
  | { kind: "schema.result"; tables: TableSchema[] }
  | {
      kind: "sql.result";
      columns: string[];
      rows: unknown[][];
      rowsAffected: number;
      error?: string;
    }
  | { kind: "scheduler.list.result"; jobs: SchedulerJob[] }
  | { kind: "scheduler.cancel.result"; success: boolean; error?: string }
  | { kind: "error"; message: string };

/* ------------------------------------------------------------------ */
/*  Shared data shapes                                                  */
/* ------------------------------------------------------------------ */

export interface FunctionDefinition {
  name: string;
  type: "query" | "mutation" | "action";
  file: string;
  /** Argument validator schema (JSON Schema-like), if available */
  args?: Record<string, unknown>;
  /** Return validator schema, if available */
  returns?: Record<string, unknown>;
}

export interface TableSchema {
  name: string;
  fields: TableField[];
  indexes: TableIndex[];
  documentCount: number;
}

export interface TableField {
  name: string;
  type: string;
  optional: boolean;
}

export interface TableIndex {
  name: string;
  fields: string[];
  unique: boolean;
}

export interface SchedulerJob {
  id: string;
  functionName: string;
  args: Record<string, unknown>;
  scheduledAt: number;
  runAt: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  completedAt?: number;
  result?: unknown;
  error?: string;
  durationMs?: number;
  /** If set, this is a recurring cron job */
  cronSchedule?: string;
}
