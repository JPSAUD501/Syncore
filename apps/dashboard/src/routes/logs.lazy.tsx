import {
  createLazyFileRoute,
  useNavigate,
  useSearch
} from "@tanstack/react-router";
import {
  getRuntimeLabel,
  useRuntimeList,
  useDevtoolsStore
} from "@/lib/store";
import { cn, formatTime } from "@/lib/utils";
import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  AlertTriangle,
  Activity,
  ArrowDown,
  Pause,
  Play,
  Filter,
  X,
  GitBranch
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  filterActivityEvents
} from "@/lib/activity";
import { useDevtools } from "@/hooks";
import {
  EVENT_BADGE_VARIANTS,
  EVENT_COLORS,
  EVENT_ICONS,
  EVENT_LABELS,
  type EventType,
  getEventDuration,
  getEventRuntimeTag,
  getEventSummary
} from "@/lib/eventPresentation";
import { TraceDetailPanel } from "@/components/shared";
import type { ExecutionTrace } from "@syncore/devtools-protocol";
import type { TraceIndex } from "@/lib/traces";
import {
  buildInvalidationsByQueryId,
  getInvalidationsForQuery,
  isVisibleActivityEvent,
  type QueryInvalidationEvent
} from "@/lib/queryInvalidations";

export const Route = createLazyFileRoute("/logs")({
  component: LogsPage
});

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

const EVENT_TYPE_FILTERS: { value: EventType; label: string }[] = [
  { value: "query.executed", label: "Queries" },
  { value: "mutation.committed", label: "Mutations" },
  { value: "action.completed", label: "Actions" },
  { value: "log", label: "Logs" },
  { value: "scheduler.tick", label: "Scheduler" },
  { value: "storage.updated", label: "Storage" }
];

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
  isNew,
  runtimeMap,
  causalBadges
}: {
  event: SyncoreDevtoolsEvent;
  isSelected: boolean;
  onClick: () => void;
  isNew: boolean;
  runtimeMap: Map<string, { label: string; publicId: string }>;
  causalBadges: string[];
}) {
  const color = EVENT_COLORS[event.type];
  const Icon = EVENT_ICONS[event.type];
  const summary = getEventSummary(event);
  const duration = getEventDuration(event);
  const errored = hasError(event);
  const runtimeTag = getEventRuntimeTag(event, runtimeMap);

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
      <Badge
        variant="outline"
        className="hidden w-[120px] justify-center text-[10px] shrink-0 xl:inline-flex"
      >
        {runtimeTag}
      </Badge>
      <span className="text-[12px] text-text-secondary font-mono truncate flex-1">
        {summary}
      </span>
      {causalBadges.length > 0 && (
        <div className="hidden shrink-0 items-center gap-1 lg:flex">
          {causalBadges.slice(0, 2).map((badge) => (
            <Badge
              key={badge}
              variant="secondary"
              className="gap-1 text-[10px]"
              title={badge}
            >
              <GitBranch size={10} />
              {badge}
            </Badge>
          ))}
        </div>
      )}
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

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function LogsPage() {
  const { events, traceIndex } = useDevtools();
  const navigate = useNavigate();
  const logSearch = useSearch({ from: "/logs" });
  const runtimes = useRuntimeList();
  const includeDashboardActivity = useDevtoolsStore(
    (state) => state.includeDashboardActivity
  );
  const filteredActivityEvents = useMemo(
    () => filterActivityEvents(events, includeDashboardActivity),
    [events, includeDashboardActivity]
  );
  const runtimeMap = useMemo(
    () => {
      return new Map(
        runtimes.map((runtime) => [
          runtime.runtimeId,
          {
            label: getRuntimeLabel(runtime),
            publicId: runtime.runtimeId.slice(0, 8)
          }
        ])
      );
    },
    [runtimes]
  );
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
  const displayEvents = paused ? pausedEvents : filteredActivityEvents;
  const visibleDisplayEvents = useMemo(
    () => displayEvents.filter(isVisibleActivityEvent),
    [displayEvents]
  );
  const invalidationsByQueryId = useMemo(
    () => buildInvalidationsByQueryId(displayEvents),
    [displayEvents]
  );

  useEffect(() => {
    if (!paused) {
      setPausedEvents(filteredActivityEvents);
      prevCountRef.current = filteredActivityEvents.filter(
        isVisibleActivityEvent
      ).length;
    }
  }, [paused, filteredActivityEvents]);

  useEffect(() => {
    if (paused) return;
    setPausedEvents(filteredActivityEvents);
  }, [filteredActivityEvents, paused]);

  // Filter events
  const filteredEvents = useMemo(() => {
    let result = visibleDisplayEvents;

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
  }, [visibleDisplayEvents, activeFilters, searchText]);

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
  const selectedTrace = selectedEvent
    ? getTraceForEvent(selectedEvent, traceIndex)
    : null;
  const selectedInvalidations = selectedTrace?.executionId
    ? (traceIndex.invalidationsByCause.get(selectedTrace.executionId) ?? [])
    : [];
  const selectedInvalidatedBy =
    selectedEvent?.type === "query.executed"
      ? getInvalidationsForQuery(selectedEvent, invalidationsByQueryId).map(
          (invalidation) => ({
            invalidation,
            trace: invalidation.causedByExecutionId
              ? (traceIndex.byExecutionId.get(invalidation.causedByExecutionId) ??
                null)
              : null
          })
        )
      : [];
  const causingTrace =
    selectedEvent?.type === "query.invalidated" && selectedEvent.causedByExecutionId
      ? (traceIndex.byExecutionId.get(selectedEvent.causedByExecutionId) ?? null)
      : null;

  const scrollToBottom = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, []);

  const selectExecution = useCallback(
    (executionId: string) => {
      const index = filteredEvents.findIndex(
        (event) => getExecutionIdForEvent(event) === executionId
      );
      if (index >= 0) {
        setSelectedIndex(index);
      }
    },
    [filteredEvents]
  );

  useEffect(() => {
    if (!logSearch.executionId) {
      return;
    }

    setPaused(false);
    setSearchText("");
    setActiveFilters(new Set());
  }, [logSearch.executionId]);

  useEffect(() => {
    if (!logSearch.executionId) {
      return;
    }

    selectExecution(logSearch.executionId);
  }, [logSearch.executionId, selectExecution]);

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      {/* Toolbar */}
      <div className="shrink-0 rounded-md border border-border bg-bg-surface p-3">
      <div className="flex items-center gap-2 flex-wrap">
        {!includeDashboardActivity && (
          <Badge variant="outline" className="text-[10px]">
            App only
          </Badge>
        )}
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
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {filteredEvents.length} events
          </Badge>
        </div>
      </div>

      {/* Filter chips */}
      {showFilters && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
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
      </div>

      {/* Log list + detail */}
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-md border border-border bg-bg-surface">
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
              {filteredEvents.map((event: SyncoreDevtoolsEvent, i: number) => {
                const invalidations =
                  event.type === "query.executed"
                    ? getInvalidationsForQuery(event, invalidationsByQueryId)
                    : [];
                const causalBadges = getCausalBadges(
                  event,
                  traceIndex,
                  invalidations
                );
                return (
                  <LogEntry
                    key={`${event.type}-${event.timestamp}-${i}`}
                    event={event}
                    isSelected={selectedIndex === i}
                    isNew={i >= knownCount}
                    runtimeMap={runtimeMap}
                    causalBadges={causalBadges}
                    onClick={() =>
                      setSelectedIndex(selectedIndex === i ? null : i)
                    }
                  />
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Detail panel */}
        {selectedEvent && (
          <div className="w-[40%] shrink-0 border-l border-border bg-bg-base overflow-y-auto hidden md:block">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-surface">
              <span className="text-[11px] font-semibold text-text-primary">
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
            <TraceDetailPanel
              event={selectedEvent}
              trace={selectedTrace}
              invalidations={selectedInvalidations}
              invalidatedBy={selectedInvalidatedBy}
              causingTrace={causingTrace}
              onOpenExecution={selectExecution}
              onOpenFunction={(functionName) =>
                void navigate({
                  to: "/functions",
                  search: buildFunctionSearch(functionName, selectedTrace)
                })
              }
              onOpenTable={() => void navigate({ to: "/data" })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function buildFunctionSearch(
  functionName: string,
  trace: ExecutionTrace | null
): { fn: string; args?: string } {
  const args = getTraceArgs(trace);
  return {
    fn: functionName,
    ...(args ? { args: JSON.stringify(args) } : {})
  };
}

function getTraceArgs(trace: ExecutionTrace | null): Record<string, unknown> | null {
  if (
    trace?.argsPreview?.kind === "value" &&
    trace.argsPreview.value &&
    typeof trace.argsPreview.value === "object" &&
    !Array.isArray(trace.argsPreview.value)
  ) {
    return trace.argsPreview.value as Record<string, unknown>;
  }
  return null;
}

function getTraceForEvent(
  event: SyncoreDevtoolsEvent,
  traceIndex: TraceIndex
) {
  const executionId = getExecutionIdForEvent(event);
  if (executionId) {
    return traceIndex.byExecutionId.get(executionId) ?? null;
  }
  if (event.type === "query.invalidated" && event.rerunExecutionId) {
    return traceIndex.byExecutionId.get(event.rerunExecutionId) ?? null;
  }
  return null;
}

function getExecutionIdForEvent(event: SyncoreDevtoolsEvent): string | null {
  if ("executionId" in event && event.executionId) {
    return event.executionId;
  }
  if (event.type === "mutation.committed") {
    return event.mutationId;
  }
  if (event.type === "action.completed") {
    return event.actionId;
  }
  return null;
}

function getCausalBadges(
  event: SyncoreDevtoolsEvent,
  traceIndex: TraceIndex,
  invalidations: QueryInvalidationEvent[]
): string[] {
  if (event.type === "query.executed" && invalidations.length > 0) {
    return invalidations.map((invalidation) =>
      invalidation.causedByExecutionId
        ? `Rerun by ${invalidation.causedByExecutionId.slice(0, 8)}`
        : "Rerun"
    );
  }

  const executionId = getExecutionIdForEvent(event);
  const caused = executionId
    ? (traceIndex.invalidationsByCause.get(executionId) ?? [])
    : [];
  if (caused.length === 0) {
    return [];
  }
  const reruns = caused.filter((invalidation) => invalidation.rerunExecutionId);
  return [
    reruns.length > 0
      ? `caused ${reruns.length} rerun${reruns.length === 1 ? "" : "s"}`
      : `invalidated ${caused.length}`
  ];
}
