import { useDevtoolsStore } from "@/lib/store";
import { useMemo } from "react";
import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";

/**
 * Hook to access computed devtools metrics.
 * Provides derived data from the event stream for dashboard panels.
 */
export function useDevtools() {
  const events = useDevtoolsStore((s) => s.events);
  const connected = useDevtoolsStore((s) => s.connected);
  const snapshot = useDevtoolsStore((s) => s.snapshot);
  const queryCount = useDevtoolsStore((s) => s.queryCount);
  const mutationCount = useDevtoolsStore((s) => s.mutationCount);
  const actionCount = useDevtoolsStore((s) => s.actionCount);
  const errorCount = useDevtoolsStore((s) => s.errorCount);
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
    events,
    snapshot,
    queryCount,
    mutationCount,
    actionCount,
    errorCount,
    clearEvents,
    functionEvents,
    functionMetrics,
    eventSparkline
  };
}
