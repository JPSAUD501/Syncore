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

export type SyncoreDevtoolsMessage =
  | { type: "hello"; runtimeId: string; platform: string }
  | { type: "event"; event: SyncoreDevtoolsEvent }
  | { type: "snapshot"; snapshot: SyncoreDevtoolsSnapshot }
  | { type: "ping" }
  | { type: "pong" };
