import { createFileRoute } from "@tanstack/react-router";
import {
  useActiveRuntime,
  useConnectedRuntimeCount,
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
import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";

export const Route = createFileRoute("/")({
  component: OverviewPage
});

/* ------------------------------------------------------------------ */
/*  Stat card                                                          */
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
  return (
    <div className="group flex flex-col gap-1.5 p-4 rounded-lg bg-bg-surface border border-border hover:border-border-hover transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-text-tertiary font-medium">
          {label}
        </span>
        <div
          className={cn(
            "rounded-md p-1.5 bg-bg-elevated/60 transition-colors group-hover:bg-bg-elevated",
            color
          )}
        >
          <Icon size={13} />
        </div>
      </div>
      <span className="text-2xl font-bold text-text-primary tabular-nums leading-none">
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
      return `${event.queryId} — ${event.reason}`;
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
      return event.platform;
    case "runtime.disconnected":
      return event.runtimeId;
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
  const snapshot = useActiveRuntime()?.snapshot ?? null;
  const queries = snapshot?.activeQueries ?? [];

  if (queries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-text-tertiary">
        <Search size={20} className="mb-2 opacity-40" />
        <span className="text-[12px]">No active query subscriptions</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {queries.map((q) => (
        <div
          key={q.id}
          className="flex items-center justify-between px-3 py-2 rounded-md bg-bg-base text-[12px] border border-border hover:border-border-hover transition-colors"
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

function OverviewPage() {
  const connected = useDevtoolsStore((s) => s.connected);
  const activeRuntime = useActiveRuntime();
  const connectedRuntimeCount = useConnectedRuntimeCount();
  const runtimeId = activeRuntime?.runtimeId ?? null;
  const platform = activeRuntime?.platform ?? null;
  const events = activeRuntime?.events ?? [];
  const queryCount = activeRuntime?.queryCount ?? 0;
  const mutationCount = activeRuntime?.mutationCount ?? 0;
  const actionCount = activeRuntime?.actionCount ?? 0;
  const errorCount = activeRuntime?.errorCount ?? 0;
  const snapshot = activeRuntime?.snapshot ?? null;
  const clearEvents = useDevtoolsStore((s) => s.clearEvents);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Connection banner */}
      {!connected && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-warning/5 border border-warning/20 text-warning text-[13px]">
          <AlertTriangle size={15} />
          <span>
            Waiting for runtime connection on{" "}
            <code className="font-mono text-[12px] bg-warning/10 px-1.5 py-0.5 rounded">
              ws://127.0.0.1:4311
            </code>
            . Start your app with{" "}
            <code className="font-mono text-[12px] bg-warning/10 px-1.5 py-0.5 rounded">
              syncore dev
            </code>
            .
          </span>
        </div>
      )}

      {connected && connectedRuntimeCount === 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-info/5 border border-info/20 text-info text-[13px]">
          <Activity size={15} />
          <span>
            Dashboard connected to the devtools hub. Start a Syncore runtime in
            development mode to see it here.
          </span>
        </div>
      )}

      {/* Runtime info strip */}
      {connected && runtimeId && (
        <div className="flex items-center gap-4 text-[12px] text-text-secondary">
          <Badge variant="success" className="gap-1.5">
            <Circle size={5} fill="currentColor" stroke="none" />
            Connected
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
          {snapshot && (
            <div>
              <span className="text-text-tertiary">Active: </span>
              <span className="font-mono text-fn-query">
                {snapshot.activeQueries.length} queries
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Queries"
          value={queryCount}
          icon={Search}
          color="text-fn-query"
          subtitle="Total executed"
        />
        <StatCard
          label="Mutations"
          value={mutationCount}
          icon={Database}
          color="text-fn-mutation"
          subtitle="Total committed"
        />
        <StatCard
          label="Actions"
          value={actionCount}
          icon={Zap}
          color="text-fn-action"
          subtitle="Total completed"
        />
        <StatCard
          label="Errors"
          value={errorCount}
          icon={AlertTriangle}
          color="text-error"
          subtitle="Total errors"
        />
      </div>

      {/* Two column: activity + active queries */}
      <div className="grid grid-cols-5 gap-4">
        {/* Recent Activity */}
        <div className="col-span-3 flex flex-col rounded-lg bg-bg-surface border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-[13px] font-bold text-text-primary">
              Recent Activity
            </h2>
            <div className="flex items-center gap-2">
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
          <ScrollArea className="max-h-[420px]">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-text-tertiary">
                <Activity size={20} className="mb-2 opacity-40" />
                <span className="text-[12px]">Waiting for events...</span>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {events.slice(0, 50).map((event, i) => {
                  const config = getEventConfig(event.type);
                  const detail = getEventDetail(event);
                  return (
                    <div
                      key={`${event.type}-${event.timestamp}-${i}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-elevated/50 transition-colors"
                    >
                      <config.icon size={13} className={config.color} />
                      <Badge
                        variant={config.badgeVariant}
                        className="w-20 justify-center text-[10px]"
                      >
                        {config.label}
                      </Badge>
                      <span className="text-[12px] text-text-secondary truncate flex-1 font-mono">
                        {detail}
                      </span>
                      <span className="text-[11px] text-text-tertiary shrink-0 tabular-nums font-mono">
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
        <div className="col-span-2 flex flex-col rounded-lg bg-bg-surface border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-[13px] font-bold text-text-primary">
              Active Queries
            </h2>
            <Badge variant="secondary" className="tabular-nums">
              {snapshot?.activeQueries.length ?? 0} watching
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
