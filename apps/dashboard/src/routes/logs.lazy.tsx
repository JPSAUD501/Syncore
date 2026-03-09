import { createLazyFileRoute } from "@tanstack/react-router";
import { useActiveRuntime } from "@/lib/store";
import { cn, formatTime, formatDuration } from "@/lib/utils";
import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Database,
  Zap,
  AlertTriangle,
  Circle,
  Activity,
  Clock,
  HardDrive,
  ArrowDown,
  Pause,
  Play,
  Filter,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createLazyFileRoute("/logs")({
  component: LogsPage
});

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

type EventType = SyncoreDevtoolsEvent["type"];

const EVENT_LABELS: Record<EventType, string> = {
  "query.executed": "Query",
  "query.invalidated": "Invalidated",
  "mutation.committed": "Mutation",
  "action.completed": "Action",
  "scheduler.tick": "Scheduler",
  "storage.updated": "Storage",
  "runtime.connected": "Connected",
  "runtime.disconnected": "Disconnected",
  log: "Log"
};

const EVENT_COLORS: Record<EventType, string> = {
  "query.executed": "text-fn-query",
  "query.invalidated": "text-fn-query",
  "mutation.committed": "text-fn-mutation",
  "action.completed": "text-fn-action",
  "scheduler.tick": "text-fn-cron",
  "storage.updated": "text-info",
  "runtime.connected": "text-success",
  "runtime.disconnected": "text-error",
  log: "text-text-secondary"
};

const EVENT_BADGE_VARIANTS: Record<
  EventType,
  "success" | "info" | "warning" | "destructive" | "secondary" | "default"
> = {
  "query.executed": "success",
  "query.invalidated": "success",
  "mutation.committed": "info",
  "action.completed": "default",
  "scheduler.tick": "warning",
  "storage.updated": "info",
  "runtime.connected": "success",
  "runtime.disconnected": "destructive",
  log: "secondary"
};

const EVENT_ICONS: Record<
  EventType,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  "query.executed": Search,
  "query.invalidated": Search,
  "mutation.committed": Database,
  "action.completed": Zap,
  "scheduler.tick": Clock,
  "storage.updated": HardDrive,
  "runtime.connected": Circle,
  "runtime.disconnected": Circle,
  log: Activity
};

const EVENT_TYPE_FILTERS: { value: EventType; label: string }[] = [
  { value: "query.executed", label: "Queries" },
  { value: "mutation.committed", label: "Mutations" },
  { value: "action.completed", label: "Actions" },
  { value: "log", label: "Logs" },
  { value: "scheduler.tick", label: "Scheduler" },
  { value: "storage.updated", label: "Storage" }
];

function getEventSummary(event: SyncoreDevtoolsEvent): string {
  switch (event.type) {
    case "query.executed":
      return event.functionName;
    case "query.invalidated":
      return `${event.queryId} — ${event.reason}`;
    case "mutation.committed":
      return event.functionName;
    case "action.completed":
      return event.functionName;
    case "scheduler.tick":
      return `${event.executedJobIds.length} job(s)`;
    case "storage.updated":
      return `${event.operation} ${event.storageId}`;
    case "runtime.connected":
      return `${event.runtimeId} (${event.platform})`;
    case "runtime.disconnected":
      return event.runtimeId;
    case "log":
      return event.message;
    default:
      return "";
  }
}

function getEventDuration(event: SyncoreDevtoolsEvent): string | null {
  if ("durationMs" in event && typeof event.durationMs === "number") {
    return formatDuration(event.durationMs);
  }
  return null;
}

function hasError(event: SyncoreDevtoolsEvent): boolean {
  if (event.type === "action.completed" && event.error) return true;
  if (event.type === "log" && event.level === "error") return true;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Log entry component with fade-in animation                         */
/* ------------------------------------------------------------------ */

function LogEntry({
  event,
  isSelected,
  onClick,
  isNew
}: {
  event: SyncoreDevtoolsEvent;
  isSelected: boolean;
  onClick: () => void;
  isNew: boolean;
}) {
  const color = EVENT_COLORS[event.type];
  const Icon = EVENT_ICONS[event.type];
  const summary = getEventSummary(event);
  const duration = getEventDuration(event);
  const errored = hasError(event);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-4 py-2 text-left transition-colors outline-none",
        "hover:bg-bg-elevated/50",
        isSelected && "bg-bg-elevated border-l-2 border-l-accent",
        errored && "bg-error/3",
        isNew && "animate-fade-in"
      )}
    >
      <Icon size={12} className={cn(color, "shrink-0")} />
      <Badge
        variant={EVENT_BADGE_VARIANTS[event.type]}
        className="w-[72px] justify-center text-[10px] shrink-0"
      >
        {EVENT_LABELS[event.type]}
      </Badge>
      <span className="text-[12px] text-text-secondary font-mono truncate flex-1">
        {summary}
      </span>
      {duration && (
        <span className="text-[11px] text-text-tertiary font-mono shrink-0 tabular-nums">
          {duration}
        </span>
      )}
      {errored && <AlertTriangle size={11} className="text-error shrink-0" />}
      <span className="text-[10px] text-text-tertiary shrink-0 tabular-nums ml-2 font-mono">
        {formatTime(event.timestamp)}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail panel                                                       */
/* ------------------------------------------------------------------ */

function LogDetail({ event }: { event: SyncoreDevtoolsEvent }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Badge variant={EVENT_BADGE_VARIANTS[event.type]}>
          {EVENT_LABELS[event.type]}
        </Badge>
        <span className="text-[11px] text-text-tertiary">
          {new Date(event.timestamp).toLocaleString()}
        </span>
      </div>

      <div className="flex flex-col gap-2 text-[12px]">
        {event.type === "query.executed" && (
          <>
            <DetailRow label="Function" value={event.functionName} mono />
            <DetailRow label="Query ID" value={event.queryId} mono />
            <DetailRow
              label="Duration"
              value={formatDuration(event.durationMs)}
            />
            <DetailRow
              label="Dependencies"
              value={
                event.dependencies.length > 0
                  ? event.dependencies.join(", ")
                  : "none"
              }
              mono
            />
          </>
        )}
        {event.type === "query.invalidated" && (
          <>
            <DetailRow label="Query ID" value={event.queryId} mono />
            <DetailRow label="Reason" value={event.reason} />
          </>
        )}
        {event.type === "mutation.committed" && (
          <>
            <DetailRow label="Function" value={event.functionName} mono />
            <DetailRow label="Mutation ID" value={event.mutationId} mono />
            <DetailRow
              label="Duration"
              value={formatDuration(event.durationMs)}
            />
            <DetailRow
              label="Changed Tables"
              value={event.changedTables.join(", ") || "none"}
              mono
            />
          </>
        )}
        {event.type === "action.completed" && (
          <>
            <DetailRow label="Function" value={event.functionName} mono />
            <DetailRow label="Action ID" value={event.actionId} mono />
            <DetailRow
              label="Duration"
              value={formatDuration(event.durationMs)}
            />
            {event.error && (
              <DetailRow label="Error" value={event.error} error />
            )}
          </>
        )}
        {event.type === "scheduler.tick" && (
          <DetailRow
            label="Executed Jobs"
            value={event.executedJobIds.join(", ") || "none"}
            mono
          />
        )}
        {event.type === "storage.updated" && (
          <>
            <DetailRow label="Storage ID" value={event.storageId} mono />
            <DetailRow label="Operation" value={event.operation} />
          </>
        )}
        {event.type === "runtime.connected" && (
          <>
            <DetailRow label="Runtime ID" value={event.runtimeId} mono />
            <DetailRow label="Platform" value={event.platform} />
          </>
        )}
        {event.type === "runtime.disconnected" && (
          <DetailRow label="Runtime ID" value={event.runtimeId} mono />
        )}
        {event.type === "log" && (
          <>
            <DetailRow label="Level" value={event.level} />
            <div className="mt-2 p-3 rounded-md bg-bg-base border border-border">
              <pre className="font-mono text-[12px] text-text-primary whitespace-pre-wrap break-all">
                {event.message}
              </pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  error
}: {
  label: string;
  value: string;
  mono?: boolean;
  error?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span className="text-text-tertiary w-28 shrink-0">{label}</span>
      <span
        className={cn(
          "text-text-secondary break-all",
          mono && "font-mono",
          error && "text-error"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function LogsPage() {
  const activeRuntime = useActiveRuntime();
  const events = useMemo(() => activeRuntime?.events ?? [], [activeRuntime]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<EventType>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [pausedEvents, setPausedEvents] = useState<SyncoreDevtoolsEvent[]>([]);

  // Track known count for fade-in animations on new entries
  const prevCountRef = useRef(0);
  const knownCount = prevCountRef.current;

  // When paused, buffer events
  const displayEvents = paused ? pausedEvents : events;

  useEffect(() => {
    if (!paused) {
      setPausedEvents(events);
      prevCountRef.current = events.length;
    }
  }, [paused, events]);

  useEffect(() => {
    if (paused) return;
    setPausedEvents(events);
  }, [events, paused]);

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = displayEvents;

    if (activeFilters.size > 0) {
      result = result.filter((e: SyncoreDevtoolsEvent) =>
        activeFilters.has(e.type)
      );
    }

    if (searchText.trim()) {
      const query = searchText.toLowerCase();
      result = result.filter((e: SyncoreDevtoolsEvent) => {
        const summary = getEventSummary(e).toLowerCase();
        return summary.includes(query) || e.type.toLowerCase().includes(query);
      });
    }

    return result;
  }, [displayEvents, activeFilters, searchText]);

  const toggleFilter = useCallback((type: EventType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const selectedEvent =
    selectedIndex !== null ? (filteredEvents[selectedIndex] ?? null) : null;

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 pb-3 shrink-0 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-sm min-w-48">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
          />
          <Input
            type="text"
            placeholder="Search logs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-8 pl-8 pr-8 text-[12px]"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <Button
          variant={
            showFilters || activeFilters.size > 0 ? "default" : "secondary"
          }
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "text-[12px]",
            (showFilters || activeFilters.size > 0) &&
              "bg-accent/10 border-accent/30 text-accent hover:bg-accent/15"
          )}
        >
          <Filter size={12} />
          Filter
          {activeFilters.size > 0 && (
            <Badge variant="default" className="ml-1 text-[10px] px-1.5 py-0">
              {activeFilters.size}
            </Badge>
          )}
        </Button>

        {/* Pause/Resume */}
        <Button
          variant={paused ? "outline" : "secondary"}
          size="sm"
          onClick={() => setPaused(!paused)}
          className={cn(
            "text-[12px]",
            paused && "border-warning/30 text-warning hover:bg-warning/10"
          )}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
          {paused ? "Resume" : "Pause"}
        </Button>

        {/* Jump to latest */}
        <Button
          variant="secondary"
          size="sm"
          onClick={scrollToBottom}
          className="text-[12px]"
        >
          <ArrowDown size={12} />
          Latest
        </Button>

        {/* Live indicator + Event count */}
        <div className="flex items-center gap-2 ml-auto">
          {!paused && (
            <div className="flex items-center gap-1.5">
              <Circle
                size={5}
                fill="var(--color-success)"
                stroke="none"
                className="animate-live-dot"
              />
              <span className="text-[10px] text-text-tertiary">Live</span>
            </div>
          )}
          <Badge variant="secondary" className="tabular-nums">
            {filteredEvents.length} events
          </Badge>
        </div>
      </div>

      {/* Filter chips */}
      {showFilters && (
        <div className="flex items-center gap-1.5 pb-3 shrink-0 flex-wrap">
          {EVENT_TYPE_FILTERS.map((f) => (
            <Button
              key={f.value}
              variant={activeFilters.has(f.value) ? "default" : "ghost"}
              size="xs"
              onClick={() => toggleFilter(f.value)}
              className={cn(
                "text-[11px]",
                activeFilters.has(f.value)
                  ? "bg-accent/10 text-accent hover:bg-accent/15"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              {f.label}
            </Button>
          ))}
          {activeFilters.size > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setActiveFilters(new Set())}
              className="text-[11px] text-text-tertiary hover:text-text-secondary ml-1"
            >
              Clear all
            </Button>
          )}
        </div>
      )}

      {/* Log list + detail */}
      <div className="flex flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-bg-surface">
        {/* Event list */}
        <ScrollArea
          ref={listRef}
          className={cn("flex-1", selectedEvent && "max-w-[60%]")}
        >
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-text-tertiary">
              <Activity size={20} className="mb-2 opacity-40" />
              <span className="text-[12px]">
                {events.length === 0
                  ? "Waiting for events..."
                  : "No events match your filters"}
              </span>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredEvents.map((event: SyncoreDevtoolsEvent, i: number) => (
                <LogEntry
                  key={`${event.type}-${event.timestamp}-${i}`}
                  event={event}
                  isSelected={selectedIndex === i}
                  isNew={i >= knownCount}
                  onClick={() =>
                    setSelectedIndex(selectedIndex === i ? null : i)
                  }
                />
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Detail panel */}
        {selectedEvent && (
          <div className="w-[40%] shrink-0 border-l border-border bg-bg-base overflow-y-auto hidden md:block">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-surface">
              <span className="text-[11px] font-bold text-text-primary uppercase tracking-wider">
                Event Detail
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setSelectedIndex(null)}
              >
                <X size={14} />
              </Button>
            </div>
            <LogDetail event={selectedEvent} />
          </div>
        )}
      </div>
    </div>
  );
}
