import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Clock,
  Database,
  FileCode,
  Loader2,
  Search,
  Users,
  X
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState, JsonViewer, TimestampCell } from "@/components/shared";
import { usePreferredTarget } from "@/hooks";
import { useDevtoolsMultiRuntimeSubscription } from "@/hooks/useReactiveData";
import { stableStringify } from "@/lib/stable";
import { cn, formatRelativeTime } from "@/lib/utils";
import type {
  SyncoreActiveQueryInfo,
  SyncoreDevtoolsSubscriptionResultPayload
} from "@syncore/devtools-protocol";

type ActiveQueryWithRuntime = SyncoreActiveQueryInfo & { runtimeId: string };

export const Route = createLazyFileRoute("/queries")({
  component: ActiveQueriesPage
});

function ActiveQueriesPage() {
  const navigate = useNavigate();
  const { queryId: initialQueryId } = Route.useSearch();
  const {
    targetRuntimeId,
    usingProjectTarget,
    supportsOffline,
    selectedTarget,
    runtimeFilter
  } = usePreferredTarget();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialQueryId ?? null
  );

  const runtimeIds = useMemo(() => {
    if (!selectedTarget) {
      return targetRuntimeId ? [targetRuntimeId] : [];
    }
    if (runtimeFilter === "all") {
      return selectedTarget.runtimes
        .filter((runtime) => runtime.connected)
        .map((runtime) => runtime.runtimeId);
    }
    return targetRuntimeId ? [targetRuntimeId] : [];
  }, [runtimeFilter, selectedTarget, targetRuntimeId]);
  const activeQueriesSubscription = useDevtoolsMultiRuntimeSubscription<
    Extract<
      SyncoreDevtoolsSubscriptionResultPayload,
      { kind: "runtime.activeQueries.result" }
    >
  >(
    runtimeIds.length > 0 ? { kind: "runtime.activeQueries" } : null,
    runtimeIds,
    { enabled: runtimeIds.length > 0 }
  );

  const queries = useMemo<ActiveQueryWithRuntime[]>(
    () =>
      Object.entries(activeQueriesSubscription.dataByRuntime).flatMap(
        ([runtimeId, payload]) =>
          payload.kind === "runtime.activeQueries.result"
            ? payload.activeQueries.map((query) => ({ ...query, runtimeId }))
            : []
      ),
    [activeQueriesSubscription.dataByRuntime]
  );

  const filteredQueries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const sorted = [...queries].sort(
      (left, right) => right.lastRunAt - left.lastRunAt
    );
    if (!needle) {
      return sorted;
    }
    return sorted.filter((query) =>
      [
        query.functionName,
        query.id,
        stableStringify(query.args ?? {}),
        ...query.dependencyKeys
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [queries, search]);

  const selectedQuery =
    filteredQueries.find(
      (query) =>
        getQuerySelectionId(query) === selectedId || query.id === selectedId
    ) ??
    filteredQueries[0] ??
    null;

  const functionCount = new Set(queries.map((query) => query.functionName))
    .size;
  const dependencyCount = new Set(
    queries.flatMap((query) => query.dependencyKeys)
  ).size;
  const totalConsumers = queries.reduce(
    (sum, query) => sum + (query.consumers ?? 1),
    0
  );

  if (!targetRuntimeId) {
    return (
      <div className="h-[calc(100vh-7rem)]">
        <EmptyState
          icon={Activity}
          title="Active queries unavailable"
          description={
            supportsOffline
              ? "The selected Project Target runtime is not available right now."
              : "Connect a runtime to inspect live query subscriptions."
          }
          className="h-full"
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg-surface">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Activity size={16} className="text-accent" />
          <h2 className="flex-1 text-[14px] font-bold text-text-primary">
            Active Queries
          </h2>
          {usingProjectTarget && (
            <Badge variant="outline" className="text-[9px]">
              Project Target
            </Badge>
          )}
          {activeQueriesSubscription.loading && (
            <Loader2 size={12} className="animate-spin text-text-tertiary" />
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 border-b border-border p-3">
          <MetricCard label="Watching" value={queries.length} icon={Activity} />
          <MetricCard label="Consumers" value={totalConsumers} icon={Users} />
          <MetricCard label="Functions" value={functionCount} icon={FileCode} />
        </div>

        <div className="border-b border-border p-3">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <Input
              placeholder="Search by function, args, dependency..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 border-border bg-bg-base pl-8 text-[12px]"
            />
          </div>
        </div>

        {filteredQueries.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No active query subscriptions"
            description="Queries appear here while the app has live subscribers."
            className="h-full"
          />
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1 p-2">
              {filteredQueries.map((query) => (
                <QueryRow
                  key={getQuerySelectionId(query)}
                  query={query}
                  selected={
                    selectedQuery
                      ? getQuerySelectionId(selectedQuery) ===
                        getQuerySelectionId(query)
                      : false
                  }
                  onSelect={() => setSelectedId(getQuerySelectionId(query))}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {selectedQuery && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg-surface xl:static xl:inset-auto xl:z-auto xl:w-105 xl:shrink-0 xl:overflow-visible xl:rounded-md xl:border xl:border-border">
          <div className="flex items-center justify-between border-b border-border p-3">
            <div className="min-w-0">
              <div className="truncate font-mono text-[12px] font-semibold text-text-primary">
                {selectedQuery.functionName.replaceAll("/", ":")}
              </div>
              <div className="mt-0.5 text-[10px] text-text-tertiary">
                {selectedQuery.consumers ?? 1} consumer
                {(selectedQuery.consumers ?? 1) === 1 ? "" : "s"} ·{" "}
                {selectedQuery.dependencyKeys.length} dependencies
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                className="gap-1.5"
                onClick={() =>
                  void navigate({
                    to: "/functions",
                    search: {
                      fn: selectedQuery.functionName,
                      args: JSON.stringify(selectedQuery.args ?? {})
                    }
                  })
                }
              >
                <FileCode size={11} />
                <span className="hidden sm:inline">Function</span>
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setSelectedId(null)}
                className="xl:hidden"
              >
                <X size={14} />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-4 p-4">
              <DetailField label="Query ID">
                <code className="block break-all rounded bg-bg-base px-2 py-1 text-[11px] text-text-code">
                  {selectedQuery.id}
                </code>
              </DetailField>
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="Last Run">
                  {selectedQuery.lastRunAt > 0 ? (
                    <TimestampCell
                      timestamp={selectedQuery.lastRunAt}
                      format="both"
                    />
                  ) : (
                    <span className="text-[12px] text-text-tertiary">
                      pending
                    </span>
                  )}
                </DetailField>
                <DetailField label="Owner">
                  <Badge variant="secondary">
                    {selectedQuery.owner ?? "root"}
                  </Badge>
                </DetailField>
              </div>
              {selectedQuery.componentPath && (
                <DetailField label="Component">
                  <code className="text-[11px] text-text-primary">
                    {selectedQuery.componentPath}
                  </code>
                </DetailField>
              )}
              <DetailField label="Arguments">
                <JsonViewer
                  data={selectedQuery.args ?? {}}
                  defaultExpanded
                  maxDepth={4}
                />
              </DetailField>
              <DetailField label="Dependencies">
                <div className="flex flex-wrap gap-1">
                  {selectedQuery.dependencyKeys.length === 0 ? (
                    <span className="text-[12px] text-text-tertiary">
                      No dependencies collected yet.
                    </span>
                  ) : (
                    selectedQuery.dependencyKeys.map((dependency) => (
                      <Badge
                        key={dependency}
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {dependency}
                      </Badge>
                    ))
                  )}
                </div>
              </DetailField>
              <div className="rounded-md border border-border bg-bg-base px-3 py-2 text-[11px] text-text-tertiary">
                {dependencyCount} unique dependencies are currently watched
                across all active queries.
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function QueryRow({
  query,
  selected,
  onSelect
}: {
  query: ActiveQueryWithRuntime;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-accent/20 bg-accent/8"
          : "border-transparent hover:bg-bg-base"
      )}
    >
      <Activity size={13} className="shrink-0 text-fn-query" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[12px] text-text-primary">
            {query.functionName.replaceAll("/", ":")}
          </span>
          {(query.consumers ?? 1) > 1 && (
            <Badge variant="secondary" className="px-1 py-0 text-[9px]">
              {query.consumers} consumers
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-tertiary">
          <span className="font-mono">{query.runtimeId.slice(0, 8)}</span>
          <span className="font-mono">{query.dependencyKeys.length} deps</span>
          <span>{formatRelativeTime(query.lastRunAt)}</span>
        </div>
      </div>
      <Clock size={12} className="shrink-0 text-text-tertiary" />
    </button>
  );
}

function getQuerySelectionId(query: ActiveQueryWithRuntime): string {
  return `${query.runtimeId}:${query.id}`;
}

function MetricCard({
  label,
  value,
  icon: Icon
}: {
  label: string;
  value: number;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-md border border-border bg-bg-base px-3 py-2">
      <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
        <Icon size={11} />
        {label}
      </div>
      <div className="mt-1 font-mono text-[18px] font-semibold text-text-primary">
        {value}
      </div>
    </div>
  );
}

function DetailField({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-text-tertiary">
        {label}
      </label>
      {children}
    </div>
  );
}
