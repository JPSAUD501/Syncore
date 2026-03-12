import { createFileRoute } from "@tanstack/react-router";
import {
  getPublicRuntimeId,
  getRuntimeLabel,
  useActiveRuntime,
  useConnectedRuntimeCount,
  useRuntimeList,
  useDevtoolsStore
} from "@/lib/store";
import {
  formatTime,
  formatDuration,
  formatRelativeTime,
  cn
} from "@/lib/utils";
import {
  Activity,
  Database,
  Zap,
  AlertTriangle,
  Circle,
  Search,
  Clock,
  HardDrive,
  Trash2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useDevtoolsSubscription,
  useDidJustChange,
  useRefreshTimer,
  useConnection,
  useDevtools
} from "@/hooks";
import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";
import { useMemo, useRef, useEffect } from "react";
import { getActivityOriginLabel } from "@/lib/activity";

export const Route = createFileRoute("/")({
  component: OverviewPage
});

function getRuntimeTag(
  event: SyncoreDevtoolsEvent,
  runtimeMap: Map<string, { label: string; publicId: string }>
): string {
  if (event.origin === "dashboard") {
    return "dashboard";
  }
  const runtime = runtimeMap.get(event.runtimeId);
  if (!runtime) {
    return getPublicRuntimeId(event.runtimeId, runtimeMap.keys());
  }
  return runtime.label;
}

function formatInvalidatedQueryId(queryId: string): string {
  const separatorIndex = queryId.indexOf(":");
  return separatorIndex === -1 ? queryId : queryId.slice(0, separatorIndex);
}

/* ------------------------------------------------------------------ */
/*  Stat card with highlight animation                                 */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtitle
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  subtitle?: string;
}) {
  const { didChange, pulse } = useDidJustChange(value);

  return (
    <div
      className={cn(
        "group flex min-h-28 flex-col gap-1.5 rounded-md border border-border bg-bg-surface p-4 transition-colors hover:border-border-hover",
        didChange &&
          (pulse % 2 === 0 ? "animate-highlight-a" : "animate-highlight-b")
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-text-secondary">
          {label}
        </span>
        <div
          className={cn(
            "rounded-md border border-border bg-bg-base p-1.5 transition-colors group-hover:border-border-hover",
            color
          )}
        >
          <Icon size={13} />
        </div>
      </div>
      <span className="text-[30px] font-semibold text-text-primary tabular-nums leading-none">
        {value}
      </span>
      {subtitle && (
        <span className="text-[11px] text-text-tertiary">{subtitle}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Event type config                                                  */
/* ------------------------------------------------------------------ */

const EVENT_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    badgeVariant:
      | "success"
      | "info"
      | "warning"
      | "destructive"
      | "secondary"
      | "default";
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }
> = {
  "query.executed": {
    label: "Query",
    color: "text-fn-query",
    badgeVariant: "success",
    icon: Search
  },
  "query.invalidated": {
    label: "Invalidated",
    color: "text-fn-query",
    badgeVariant: "success",
    icon: Search
  },
  "mutation.committed": {
    label: "Mutation",
    color: "text-fn-mutation",
    badgeVariant: "info",
    icon: Database
  },
  "action.completed": {
    label: "Action",
    color: "text-fn-action",
    badgeVariant: "default",
    icon: Zap
  },
  "scheduler.tick": {
    label: "Scheduler",
    color: "text-fn-cron",
    badgeVariant: "warning",
    icon: Clock
  },
  "storage.updated": {
    label: "Storage",
    color: "text-info",
    badgeVariant: "info",
    icon: HardDrive
  },
  "runtime.connected": {
    label: "Connected",
    color: "text-success",
    badgeVariant: "success",
    icon: Circle
  },
  "runtime.disconnected": {
    label: "Disconnected",
    color: "text-error",
    badgeVariant: "destructive",
    icon: Circle
  },
  log: {
    label: "Log",
    color: "text-text-secondary",
    badgeVariant: "secondary",
    icon: Activity
  }
};

function getEventConfig(type: string) {
  return (
    EVENT_CONFIG[type] ?? {
      label: type,
      color: "text-text-secondary",
      badgeVariant: "secondary" as const,
      icon: Activity
    }
  );
}

function getEventDetail(event: SyncoreDevtoolsEvent): string {
  switch (event.type) {
    case "query.executed":
      return `${event.functionName} (${formatDuration(event.durationMs)})`;
    case "query.invalidated":
      return `${formatInvalidatedQueryId(event.queryId)} - ${event.reason}`;
    case "mutation.committed":
      return `${event.functionName} (${formatDuration(event.durationMs)})`;
    case "action.completed":
      return event.error
        ? `${event.functionName} — ERROR`
        : `${event.functionName} (${formatDuration(event.durationMs)})`;
    case "scheduler.tick":
      return `${event.executedJobIds.length} job(s) executed`;
    case "storage.updated":
      return `${event.operation} ${event.storageId}`;
    case "runtime.connected":
      return `${event.platform} connected`;
    case "runtime.disconnected":
      return "Runtime disconnected";
    case "log":
      return `[${event.level}] ${event.message}`;
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Active queries panel                                               */
/* ------------------------------------------------------------------ */

function ActiveQueries() {
  const { runtimeConnected } = useConnection();
  const activeRuntime = useActiveRuntime();
  const runtimeId = activeRuntime?.runtimeId ?? null;
  const activeQueriesSubscription = useDevtoolsSubscription(
    runtimeConnected && runtimeId ? { kind: "runtime.activeQueries" } : null,
    { enabled: runtimeConnected && !!runtimeId }
  );
  const queries =
    activeQueriesSubscription.data?.kind === "runtime.activeQueries.result"
      ? activeQueriesSubscription.data.activeQueries
      : (activeRuntime?.activeQueries ?? []);

  // Keep relative timestamps ticking
  useRefreshTimer(1000);

  if (runtimeConnected && activeQueriesSubscription.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-text-tertiary">
        <Activity size={13} className="animate-pulse" />
        Waiting for live query data.
      </div>
    );
  }

  if (queries.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 text-[12px] text-text-tertiary">
        No active query subscriptions.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {queries.map((q) => (
        <div
          key={q.id}
          className="flex items-center justify-between px-3 py-2 rounded-md bg-bg-base text-[12px] border border-border hover:border-border-hover transition-colors animate-fade-in"
        >
          <span className="font-mono text-fn-query truncate mr-3">
            {q.functionName}
          </span>
          <span className="text-text-tertiary shrink-0 tabular-nums">
            {formatRelativeTime(q.lastRunAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function OverviewPage() {
  const connected = useDevtoolsStore((s) => s.connected);
  const activeRuntime = useActiveRuntime();
  const { runtimeConnected } = useConnection();
  const {
    events,
    queryCount,
    mutationCount,
    actionCount,
    errorCount,
    includeDashboardActivity
  } = useDevtools();
  const connectedRuntimeCount = useConnectedRuntimeCount();
  const runtimes = useRuntimeList();
  const runtimeId = activeRuntime?.runtimeId ?? null;
  const platform = activeRuntime?.platform ?? null;
  const clearEvents = useDevtoolsStore((s) => s.clearEvents);
  const runtimeMap = useMemo(
    () => {
      const runtimeIds = runtimes.map((runtime) => runtime.runtimeId);
      return new Map(
        runtimes.map((runtime) => [
          runtime.runtimeId,
          {
            label: getRuntimeLabel(runtime),
            publicId: getPublicRuntimeId(runtime.runtimeId, runtimeIds)
          }
        ])
      );
    },
    [runtimes]
  );

  const summarySubscription = useDevtoolsSubscription(
    runtimeConnected && runtimeId ? { kind: "runtime.summary" } : null,
    { enabled: runtimeConnected && !!runtimeId }
  );
  const activeQueriesSubscription = useDevtoolsSubscription(
    runtimeConnected && runtimeId ? { kind: "runtime.activeQueries" } : null,
    { enabled: runtimeConnected && !!runtimeId }
  );
  const summary =
    summarySubscription.data?.kind === "runtime.summary.result"
      ? summarySubscription.data.summary
      : (activeRuntime?.summary ?? null);
  const activeQueries =
    activeQueriesSubscription.data?.kind === "runtime.activeQueries.result"
      ? activeQueriesSubscription.data.activeQueries
      : (activeRuntime?.activeQueries ?? []);
  const runtimeDataLoading =
    runtimeConnected &&
    (summarySubscription.loading || activeQueriesSubscription.loading);
  const runtimeSnapshotPending = Boolean(runtimeId) && runtimeDataLoading;
  const statValue = (value: number) =>
    runtimeSnapshotPending ? "..." : value;
  const statSubtitle = (defaultText: string) => {
    if (runtimeSnapshotPending) {
      return "Waiting for runtime data";
    }
    if (runtimeId && !runtimeConnected) {
      return "Captured before disconnect";
    }
    return defaultText;
  };

  // Only animate events that arrive after the first batch for a runtime.
  const previousRuntimeIdRef = useRef<string | null>(runtimeId);
  const previousEventCountRef = useRef(events.length);
  const hasHydratedInitialEventsRef = useRef(events.length > 0);
  let newEventCount = 0;
  if (previousRuntimeIdRef.current !== runtimeId) {
    previousRuntimeIdRef.current = runtimeId;
    previousEventCountRef.current = events.length;
    hasHydratedInitialEventsRef.current = events.length > 0;
  } else if (!hasHydratedInitialEventsRef.current) {
    if (events.length > 0) {
      hasHydratedInitialEventsRef.current = true;
    }
    previousEventCountRef.current = events.length;
  } else if (events.length > previousEventCountRef.current) {
    newEventCount = events.length - previousEventCountRef.current;
  }

  useEffect(() => {
    if (previousRuntimeIdRef.current !== runtimeId) {
      previousRuntimeIdRef.current = runtimeId;
      hasHydratedInitialEventsRef.current = events.length > 0;
    }
    previousEventCountRef.current = events.length;
  }, [events.length, runtimeId]);

  return (
    <div className="space-y-4">
      {/* Connection banner */}
      {!connected && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-warning/5 border border-warning/20 text-warning text-[13px] animate-fade-in">
          <AlertTriangle size={15} />
          <span>
            Waiting for runtime connection on{" "}
            <code className="font-mono text-[12px] bg-warning/10 px-1.5 py-0.5 rounded">
              ws://localhost:4311
            </code>
            . Start your app with{" "}
            <code className="font-mono text-[12px] bg-warning/10 px-1.5 py-0.5 rounded">
              syncorejs dev
            </code>
            .
          </span>
        </div>
      )}

      {connected && connectedRuntimeCount === 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-info/5 border border-info/20 text-info text-[13px] animate-fade-in">
          <Activity size={15} />
          <span>
            Dashboard connected to the devtools hub. Start a Syncore runtime in
            development mode to see it here.
          </span>
        </div>
      )}

      {/* Runtime info strip */}
      {connected && runtimeId && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg-surface px-4 py-3 text-[12px] text-text-secondary">
          <Badge
            variant={activeRuntime?.connected ? "success" : "destructive"}
            className="gap-1.5"
          >
            {activeRuntime?.connected ? "Connected" : "Inactive"}
          </Badge>
          <div>
            <span className="text-text-tertiary">ID: </span>
            <span className="font-mono text-text-secondary">
              {runtimeId.slice(0, 16)}
            </span>
          </div>
          {platform && (
            <Badge variant="secondary" className="font-mono">
              {platform}
            </Badge>
          )}
          {runtimeConnected && summary && (
            <div className="flex items-center gap-1">
              <span className="text-text-tertiary">Watching</span>
              <span className="font-mono text-fn-query">
                {activeQueries.length} queries
              </span>
            </div>
          )}
          {runtimeConnected && summary && (
            <div className="flex items-center gap-1">
              <span className="text-text-tertiary">Recent</span>
              <span className="font-mono text-text-primary">
                {events.length} events
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stats grid — responsive */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Queries"
          value={statValue(queryCount)}
          icon={Search}
          color="text-fn-query"
          subtitle={statSubtitle("Total executed")}
        />
        <StatCard
          label="Mutations"
          value={statValue(mutationCount)}
          icon={Database}
          color="text-fn-mutation"
          subtitle={statSubtitle("Total committed")}
        />
        <StatCard
          label="Actions"
          value={statValue(actionCount)}
          icon={Zap}
          color="text-fn-action"
          subtitle={statSubtitle("Total completed")}
        />
        <StatCard
          label="Errors"
          value={statValue(errorCount)}
          icon={AlertTriangle}
          color="text-error"
          subtitle={statSubtitle("Total errors")}
        />
      </div>

      {/* Two column: activity + active queries — responsive */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.9fr)]">
        {/* Recent Activity */}
        <div className="flex flex-col overflow-hidden rounded-md border border-border bg-bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-semibold text-text-primary">
              Recent Activity
            </h2>
            <div className="flex items-center gap-2">
              {!includeDashboardActivity && (
                <Badge variant="outline" className="text-[10px]">
                  App only
                </Badge>
              )}
              <span className="text-[11px] text-text-tertiary tabular-nums">
                {events.length} events
              </span>
              {events.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => clearEvents()}
                  className="text-text-tertiary hover:text-error"
                  title="Clear events"
                >
                  <Trash2 size={12} />
                </Button>
              )}
            </div>
          </div>
          <ScrollArea className="max-h-[420px] bg-bg-base/30">
            {runtimeSnapshotPending && events.length === 0 ? (
              <div className="flex h-28 items-center justify-center gap-2 px-4 text-[12px] text-text-tertiary">
                <Activity size={13} className="animate-pulse" />
                Waiting for runtime data.
              </div>
            ) : events.length === 0 ? (
              <div className="flex h-28 items-center justify-center px-4 text-[12px] text-text-tertiary">
                Waiting for runtime activity.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {events.slice(0, 50).map((event, i) => {
                  const config = getEventConfig(event.type);
                  const detail = getEventDetail(event);
                  const isNew = i < newEventCount;
                  return (
                    <div
                      key={`${event.type}-${event.timestamp}-${i}`}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 hover:bg-bg-elevated/50 transition-colors",
                        isNew && "animate-fade-in-fast"
                      )}
                    >
                      <config.icon size={13} className={config.color} />
                      <Badge
                        variant={config.badgeVariant}
                        className="w-20 shrink-0 justify-center text-[10px]"
                      >
                        {config.label}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="hidden w-20 shrink-0 justify-center text-[10px] lg:inline-flex"
                      >
                        {getActivityOriginLabel(event)}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="hidden w-32 shrink-0 justify-center text-[10px] xl:inline-flex"
                      >
                        {getRuntimeTag(event, runtimeMap)}
                      </Badge>
                      <span className="flex-1 truncate font-mono text-[12px] text-text-secondary">
                        {detail}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-text-tertiary tabular-nums">
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Active Queries */}
        <div className="flex flex-col overflow-hidden rounded-md border border-border bg-bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-semibold text-text-primary">
              Active Queries
            </h2>
            <Badge variant="secondary" className="tabular-nums">
              {runtimeSnapshotPending ? "..." : `${activeQueries.length} watching`}
            </Badge>
          </div>
          <ScrollArea className="max-h-[420px] p-3">
            <ActiveQueries />
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
