import type {
  SyncoreActiveQueryInfo,
  SyncoreDevtoolsEvent,
  SyncoreRuntimeSummary
} from "@syncore/devtools-protocol";
import type {
  ImpactScope,
  DevtoolsLiveQueryScope,
  DevtoolsLiveQuerySnapshot,
  DevtoolsSink
} from "../../runtime.js";
import { devtoolsScopesForEvent, type DevtoolsEventMeta } from "./shared.js";

type DevtoolsEngineDeps = {
  runtimeId: string;
  platform: string;
  sink?: DevtoolsSink;
  getActiveQueryInfos: () => SyncoreActiveQueryInfo[];
  getSchemaTables: () => Promise<DevtoolsLiveQuerySnapshot["schemaTables"]>;
};

export class DevtoolsEngine {
  private readonly recentEvents: SyncoreDevtoolsEvent[] = [];
  private readonly listeners = new Set<(event: SyncoreDevtoolsEvent) => void>();
  private readonly invalidationListeners = new Set<
    (scopes: Set<DevtoolsLiveQueryScope>) => void
  >();

  constructor(private readonly deps: DevtoolsEngineDeps) {}

  getRuntimeSummary(): SyncoreRuntimeSummary {
    return {
      runtimeId: this.deps.runtimeId,
      platform: this.deps.platform,
      connectedAt: Date.now(),
      activeQueryCount: this.deps.getActiveQueryInfos().length,
      recentEventCount: this.recentEvents.length
    };
  }

  getActiveQueryInfos(): SyncoreActiveQueryInfo[] {
    return this.deps.getActiveQueryInfos();
  }

  async getLiveSnapshot(): Promise<DevtoolsLiveQuerySnapshot> {
    return {
      summary: this.getRuntimeSummary(),
      activeQueries: this.getActiveQueryInfos(),
      schemaTables: await this.deps.getSchemaTables()
    };
  }

  subscribeEvents(listener: (event: SyncoreDevtoolsEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeInvalidations(
    listener: (scopes: Set<DevtoolsLiveQueryScope>) => void
  ): () => void {
    this.invalidationListeners.add(listener);
    return () => {
      this.invalidationListeners.delete(listener);
    };
  }

  notifyScopes(scopes: Iterable<DevtoolsLiveQueryScope>): void {
    const scopeSet = new Set(scopes);
    for (const listener of this.invalidationListeners) {
      listener(scopeSet);
    }
  }

  emit(event: SyncoreDevtoolsEvent): void {
    this.recentEvents.unshift(event);
    this.recentEvents.splice(24);
    this.deps.sink?.emit(event);
    this.notifyScopes(devtoolsScopesForEvent(event));
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async forceRefresh(
    reason: string,
    handlers: {
      refreshQueriesForScopes: (
        scopes: Set<ImpactScope>,
        reason: string
      ) => Promise<void>;
    },
    meta: DevtoolsEventMeta = {},
    scopes: Iterable<ImpactScope> = []
  ): Promise<void> {
    const scopeSet = new Set(scopes);
    if (scopeSet.size > 0) {
      await handlers.refreshQueriesForScopes(scopeSet, reason);
    }
    this.notifyScopes(
      scopeSet.size > 0 ? toDevtoolsScopes(scopeSet) : ["all"]
    );
    this.emit({
      type: "log",
      runtimeId: this.deps.runtimeId,
      level: "info",
      message: reason,
      timestamp: Date.now(),
      ...(meta.origin ? { origin: meta.origin } : {})
    });
  }
}

function toDevtoolsScopes(
  scopes: Iterable<ImpactScope>
): DevtoolsLiveQueryScope[] {
  const resolved: DevtoolsLiveQueryScope[] = [];
  for (const scope of scopes) {
    if (
      scope.startsWith("row:") ||
      !(scope.startsWith("table:") || scope.startsWith("storage:")) &&
        scope !== "runtime.summary" &&
        scope !== "runtime.activeQueries" &&
        scope !== "schema.tables" &&
        scope !== "scheduler.jobs"
    ) {
      continue;
    }
    resolved.push(scope as DevtoolsLiveQueryScope);
  }
  return resolved.length > 0 ? resolved : ["all"];
}
