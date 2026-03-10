import {
  useActiveRuntime,
  useDevtoolsStore,
  useSelectedRuntimeConnected
} from "@/lib/store";
import { useMemo } from "react";
import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";
import type {
  SyncoreActiveQueryInfo,
  SyncoreRuntimeSummary
} from "@syncore/devtools-protocol";
import {
  filterActivityEvents,
  summarizeActivityEvents
} from "@/lib/activity";

interface DevtoolsStateSnapshot {
  connected: boolean;
  runtimeConnected: boolean;
  isReady: boolean;
  includeDashboardActivity: boolean;
  events: SyncoreDevtoolsEvent[];
  summary: SyncoreRuntimeSummary | null;
  activeQueries: SyncoreActiveQueryInfo[];
  queryCount: number;
  mutationCount: number;
  actionCount: number;
  errorCount: number;
  clearEvents: (runtimeId?: string) => void;
  functionEvents: Array<Extract<SyncoreDevtoolsEvent, { functionName: string }>>;
  functionMetrics: Array<{
    functionName: string;
    type: string;
    invocations: number;
    totalDuration: number;
    errors: number;
    lastInvoked: number;
    avgDuration: number;
    errorRate: number;
  }>;
  eventSparkline: number[];
}

/**
 * Hook to access computed devtools metrics.
 * Provides derived data from the event stream for dashboard panels.
 */
export function useDevtools(): DevtoolsStateSnapshot {
  const activeRuntime = useActiveRuntime();
  const connected = useDevtoolsStore((s) => s.connected);
  const runtimeConnected = useSelectedRuntimeConnected();
  const includeDashboardActivity = useDevtoolsStore(
    (s) => s.includeDashboardActivity
  );
  const events = useMemo(
    () =>
      filterActivityEvents(
        activeRuntime?.events ?? [],
        includeDashboardActivity
      ),
    [activeRuntime, includeDashboardActivity]
  );
  const counts = useMemo(() => summarizeActivityEvents(events), [events]);
  const clearEvents = useDevtoolsStore((s) => s.clearEvents);

  const functionEvents = useMemo(() => {
    return events.filter(
      (e): e is Extract<SyncoreDevtoolsEvent, { functionName: string }> =>
        "functionName" in e
    );
  }, [events]);

  /**
   * Group function events by functionName, with count and avg duration.
   */
  const functionMetrics = useMemo(() => {
    const map = new Map<
      string,
      {
        functionName: string;
        type: string;
        invocations: number;
        totalDuration: number;
        errors: number;
        lastInvoked: number;
      }
    >();

    for (const event of functionEvents) {
      const existing = map.get(event.functionName);
      const durationMs = "durationMs" in event ? event.durationMs : 0;
      const hasError =
        event.type === "action.completed" && "error" in event && !!event.error;

      if (existing) {
        existing.invocations++;
        existing.totalDuration += durationMs;
        existing.errors += hasError ? 1 : 0;
        existing.lastInvoked = Math.max(existing.lastInvoked, event.timestamp);
      } else {
        map.set(event.functionName, {
          functionName: event.functionName,
          type: event.type,
          invocations: 1,
          totalDuration: durationMs,
          errors: hasError ? 1 : 0,
          lastInvoked: event.timestamp
        });
      }
    }

    return Array.from(map.values()).map((m) => ({
      ...m,
      avgDuration: m.invocations > 0 ? m.totalDuration / m.invocations : 0,
      errorRate: m.invocations > 0 ? m.errors / m.invocations : 0
    }));
  }, [functionEvents]);

  /**
   * Recent event counts bucketed into time windows (for sparklines).
   * Returns 20 buckets, each representing a ~15s window of the last 5 minutes.
   */
  const eventSparkline = useMemo(() => {
    const buckets = 20;
    const windowMs = 5 * 60 * 1000; // 5 minutes
    const bucketMs = windowMs / buckets;
    const now = Date.now();
    const counts = new Array<number>(buckets).fill(0);

    for (const event of events) {
      const age = now - event.timestamp;
      if (age > windowMs) break; // events are sorted newest-first
      const bucket = Math.min(buckets - 1, Math.floor(age / bucketMs));
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }

    return counts.reverse(); // oldest to newest for sparkline rendering
  }, [events]);

  return {
    connected,
    runtimeConnected,
    isReady: connected && runtimeConnected,
    includeDashboardActivity,
    events,
    summary: activeRuntime?.summary ?? null,
    activeQueries: activeRuntime?.activeQueries ?? [],
    queryCount: counts.queryCount,
    mutationCount: counts.mutationCount,
    actionCount: counts.actionCount,
    errorCount: counts.errorCount,
    clearEvents,
    functionEvents,
    functionMetrics,
    eventSparkline
  };
}
