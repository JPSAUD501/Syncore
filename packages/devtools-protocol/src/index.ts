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

export interface SyncoreActiveQueryInfo {
  id: string;
  functionName: string;
  dependencyKeys: string[];
  lastRunAt: number;
}

export interface SyncoreRuntimeSummary {
  runtimeId: string;
  platform: string;
  appName?: string;
  origin?: string;
  sessionLabel?: string;
  connectedAt: number;
  activeQueryCount: number;
  recentEventCount: number;
}

/* ------------------------------------------------------------------ */
/*  Runtime → Dashboard messages                                       */
/* ------------------------------------------------------------------ */

export type SyncoreDevtoolsMessage =
  | {
      type: "hello";
      runtimeId: string;
      platform: string;
      appName?: string;
      origin?: string;
      sessionLabel?: string;
    }
  | { type: "event"; event: SyncoreDevtoolsEvent }
  | { type: "ping" }
  | { type: "pong" }
  | {
      type: "command.result";
      commandId: string;
      runtimeId: string;
      payload: SyncoreDevtoolsCommandResultPayload;
    }
  | {
      type: "subscription.data";
      subscriptionId: string;
      runtimeId: string;
      payload: SyncoreDevtoolsSubscriptionResultPayload;
    }
  | {
      type: "subscription.error";
      subscriptionId: string;
      runtimeId: string;
      error: string;
    };

/* ------------------------------------------------------------------ */
/*  Dashboard → Runtime requests                                       */
/* ------------------------------------------------------------------ */

export interface SyncoreDevtoolsCommand {
  type: "command";
  commandId: string;
  targetRuntimeId: string;
  payload: SyncoreDevtoolsCommandPayload;
}

export interface SyncoreDevtoolsSubscribe {
  type: "subscribe";
  subscriptionId: string;
  targetRuntimeId: string;
  payload: SyncoreDevtoolsSubscriptionPayload;
}

export interface SyncoreDevtoolsUnsubscribe {
  type: "unsubscribe";
  subscriptionId: string;
  targetRuntimeId: string;
}

export type SyncoreDevtoolsClientMessage =
  | { type: "ping" }
  | SyncoreDevtoolsCommand
  | SyncoreDevtoolsSubscribe
  | SyncoreDevtoolsUnsubscribe;

export type SyncoreDevtoolsCommandPayload =
  /* Functions */
  | {
      kind: "fn.run";
      functionName: string;
      functionType: "query" | "mutation" | "action";
      args: Record<string, unknown>;
    }
  | { kind: "data.insert"; table: string; document: Record<string, unknown> }
  | {
      kind: "data.patch";
      table: string;
      id: string;
      fields: Record<string, unknown>;
    }
  | { kind: "data.delete"; table: string; id: string }
  /* SQL */
  | { kind: "sql.read"; query: string }
  | { kind: "sql.write"; query: string }
  /* Scheduler */
  | { kind: "scheduler.cancel"; jobId: string };

export type SyncoreDevtoolsSubscriptionPayload =
  | { kind: "runtime.summary" }
  | { kind: "runtime.activeQueries" }
  | { kind: "schema.tables" }
  | {
      kind: "data.table";
      table: string;
      filters?: DataFilter[];
      limit?: number;
      cursor?: string;
    }
  | { kind: "scheduler.jobs" }
  | { kind: "functions.catalog" }
  | { kind: "sql.watch"; query: string };

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

export type SyncoreDevtoolsCommandResultPayload =
  | {
      kind: "fn.run.result";
      result?: unknown;
      error?: string;
      durationMs: number;
    }
  | {
      kind: "data.mutate.result";
      success: boolean;
      id?: string;
      error?: string;
    }
  | {
      kind: "sql.read.result";
      columns: string[];
      rows: unknown[][];
      error?: string;
    }
  | {
      kind: "sql.write.result";
      rowsAffected: number;
      error?: string;
      invalidationScopes: string[];
    }
  | { kind: "scheduler.cancel.result"; success: boolean; error?: string }
  | { kind: "error"; message: string };

export type SyncoreDevtoolsSubscriptionResultPayload =
  | { kind: "runtime.summary.result"; summary: SyncoreRuntimeSummary }
  | {
      kind: "runtime.activeQueries.result";
      activeQueries: SyncoreActiveQueryInfo[];
    }
  | { kind: "schema.tables.result"; tables: TableSchema[] }
  | {
      kind: "data.table.result";
      rows: Record<string, unknown>[];
      totalCount: number;
      cursor?: string;
    }
  | { kind: "scheduler.jobs.result"; jobs: SchedulerJob[] }
  | { kind: "functions.catalog.result"; functions: FunctionDefinition[] }
  | {
      kind: "sql.watch.result";
      columns: string[];
      rows: unknown[][];
      observedTables: string[];
    };

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
