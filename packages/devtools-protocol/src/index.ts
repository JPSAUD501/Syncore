export type SyncoreDevtoolsEventOrigin = "runtime" | "dashboard";

type SyncoreDevtoolsEventBase = {
  runtimeId: string;
  timestamp: number;
  origin?: SyncoreDevtoolsEventOrigin;
};

export type SyncoreDevtoolsEvent =
  | (SyncoreDevtoolsEventBase & {
      type: "runtime.connected";
      platform: string;
    })
  | (SyncoreDevtoolsEventBase & {
      type: "runtime.disconnected";
    })
  | (SyncoreDevtoolsEventBase & {
      type: "query.executed";
      queryId: string;
      functionName: string;
      dependencies: string[];
      durationMs: number;
    })
  | (SyncoreDevtoolsEventBase & {
      type: "query.invalidated";
      queryId: string;
      reason: string;
    })
  | (SyncoreDevtoolsEventBase & {
      type: "mutation.committed";
      mutationId: string;
      functionName: string;
      changedTables: string[];
      durationMs: number;
    })
  | (SyncoreDevtoolsEventBase & {
      type: "action.completed";
      actionId: string;
      functionName: string;
      durationMs: number;
      error?: string;
    })
  | (SyncoreDevtoolsEventBase & {
      type: "scheduler.tick";
      executedJobIds: string[];
    })
  | (SyncoreDevtoolsEventBase & {
      type: "storage.updated";
      storageId: string;
      operation: "put" | "delete";
    })
  | (SyncoreDevtoolsEventBase & {
      type: "log";
      level: "info" | "warn" | "error";
      message: string;
    });

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
  targetKind?: "client" | "project";
  storageProtocol?: string;
  databaseLabel?: string;
  storageIdentity?: string;
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
      targetKind?: "client" | "project";
      storageProtocol?: string;
      databaseLabel?: string;
      storageIdentity?: string;
    }
  | { type: "event"; event: SyncoreDevtoolsEvent }
  | {
      type: "event.batch";
      runtimeId: string;
      events: SyncoreDevtoolsEvent[];
    }
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
  | { kind: "scheduler.cancel"; jobId: string }
  | {
      kind: "scheduler.update";
      jobId: string;
      schedule: SchedulerRecurringSchedule;
      args: Record<string, unknown>;
      misfirePolicy: SchedulerMisfirePolicy;
      runAt?: number;
    };

export type SyncoreDevtoolsSubscriptionPayload =
  | { kind: "runtime.summary" }
  | { kind: "runtime.activeQueries" }
  | { kind: "schema.tables" }
  | {
      kind: "fn.watch";
      functionName: string;
      functionType: "query";
      args: Record<string, unknown>;
    }
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
  | {
      kind: "scheduler.cancel.result";
      success: boolean;
      cancelled: boolean;
      error?: string;
    }
  | {
      kind: "scheduler.update.result";
      success: boolean;
      updated: boolean;
      error?: string;
      job?: SchedulerJob;
    }
  | { kind: "error"; message: string };

export type SyncoreDevtoolsSubscriptionResultPayload =
  | { kind: "runtime.summary.result"; summary: SyncoreRuntimeSummary }
  | {
      kind: "runtime.activeQueries.result";
      activeQueries: SyncoreActiveQueryInfo[];
    }
  | {
      kind: "fn.watch.result";
      result?: unknown;
      error?: string;
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
  recurringName?: string;
  schedule?: SchedulerRecurringSchedule;
  scheduleLabel?: string;
  misfirePolicy?: SchedulerMisfirePolicy;
  timezone?: string;
  lastRunAt?: number;
  updatedAt?: number;
  /** Compatibility label for older UI code. */
  cronSchedule?: string;
}

export interface SchedulerRecurringIntervalSchedule {
  type: "interval";
  seconds?: number;
  minutes?: number;
  hours?: number;
}

export interface SchedulerRecurringDailySchedule {
  type: "daily";
  hour: number;
  minute: number;
  timezone?: string;
}

export interface SchedulerRecurringWeeklySchedule {
  type: "weekly";
  dayOfWeek:
    | "sunday"
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday";
  hour: number;
  minute: number;
  timezone?: string;
}

export type SchedulerRecurringSchedule =
  | SchedulerRecurringIntervalSchedule
  | SchedulerRecurringDailySchedule
  | SchedulerRecurringWeeklySchedule;

export type SchedulerMisfirePolicy =
  | { type: "catch_up" }
  | { type: "skip" }
  | { type: "run_once_if_missed" }
  | { type: "windowed"; windowMs: number };
