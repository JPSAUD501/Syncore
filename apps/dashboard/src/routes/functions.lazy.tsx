import {
  createLazyFileRoute,
  useNavigate,
  useSearch
} from "@tanstack/react-router";
import {
  Code2,
  ChevronRight,
  FileCode,
  Play,
  Loader2,
  AlertCircle,
  Clock,
  Radio,
  Activity,
  Search,
  XCircle,
  CheckCircle2,
  Copy,
  ExternalLink
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  FunctionBadge,
  inferFunctionType,
  JsonViewer,
  EmptyState,
  TimestampCell
} from "@/components/shared";
import type { FunctionType } from "@/components/shared/FunctionBadge";
import { useDevtools, usePreferredTarget } from "@/hooks";
import {
  useDevtoolsMultiRuntimeSubscription,
  useDevtoolsSubscription
} from "@/hooks/useReactiveData";
import { sendRequest } from "@/lib/store";
import { cn, formatDuration } from "@/lib/utils";
import type {
  ExecutionTrace,
  SyncoreActiveQueryInfo,
  SyncoreDevtoolsSubscriptionResultPayload
} from "@syncore/devtools-protocol";

export const Route = createLazyFileRoute("/functions")({
  component: FunctionsPage
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FunctionRunResult {
  status: "idle" | "running" | "success" | "error";
  result?: unknown;
  error?: string;
  durationMs?: number;
}

type FunctionListEntry = {
  name: string;
  type: FunctionType;
  file?: string;
  modulePath?: string;
  namespace: string;
  metadataAvailable: boolean;
  invocations: number;
  avgDuration: number;
  errorRate: number;
  lastInvoked: number;
  registered: boolean;
  activeCount: number;
  args?: Record<string, unknown>;
};

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

function FunctionsPage() {
  const { functionMetrics, functionEvents, traceIndex } = useDevtools();
  const { targetRuntimeId, usingProjectTarget, selectedTarget, runtimeFilter } = usePreferredTarget();
  const functionSearch = useSearch({ from: "/functions" });
  const navigate = useNavigate();
  const appliedSearchRef = useRef<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFn, setSelectedFn] = useState<string | null>(null);
  const [mobileFunctionsOpen, setMobileFunctionsOpen] = useState(false);
  const [runResult, setRunResult] = useState<FunctionRunResult>({
    status: "idle"
  });
  const [argsText, setArgsText] = useState("{}");

  /* ---------------------------------------------------------------- */
  /*  Reactive function list fetch                                     */
  /* ---------------------------------------------------------------- */

  const functionsSubscription = useDevtoolsSubscription(
    targetRuntimeId ? { kind: "functions.catalog" } : null,
    { enabled: Boolean(targetRuntimeId), targetRuntimeId }
  );
  const activeQueryRuntimeIds = useMemo(() => {
    if (runtimeFilter === "all" && selectedTarget) {
      return selectedTarget.runtimes
        .filter((runtime) => runtime.connected)
        .map((runtime) => runtime.runtimeId);
    }
    return targetRuntimeId ? [targetRuntimeId] : [];
  }, [runtimeFilter, selectedTarget, targetRuntimeId]);
  const activeQueriesSubscription = useDevtoolsMultiRuntimeSubscription<
    Extract<SyncoreDevtoolsSubscriptionResultPayload, { kind: "runtime.activeQueries.result" }>
  >(
    activeQueryRuntimeIds.length > 0 ? { kind: "runtime.activeQueries" } : null,
    activeQueryRuntimeIds,
    { enabled: activeQueryRuntimeIds.length > 0 }
  );

  const registeredFunctions =
    functionsSubscription.data?.kind === "functions.catalog.result"
      ? functionsSubscription.data.functions
      : null;
  const loadingFunctions = functionsSubscription.loading;
  const activeQueries = useMemo(
    () =>
      Object.values(activeQueriesSubscription.dataByRuntime).flatMap((payload) =>
        payload.kind === "runtime.activeQueries.result"
          ? payload.activeQueries
          : []
      ),
    [activeQueriesSubscription.dataByRuntime]
  );

  const fnList = useMemo(
    () => registeredFunctions ?? [],
    [registeredFunctions]
  );

  /* ---------------------------------------------------------------- */
  /*  Build combined function list (registered + observed from events)  */
  /* ---------------------------------------------------------------- */

  const allFunctions = useMemo(() => {
    const map = new Map<string, FunctionListEntry>();

    // Seed from registered functions
    for (const fn of fnList) {
      const entry: FunctionListEntry = {
        name: fn.name,
        type: fn.type,
        ...(fn.file ? { file: fn.file } : {}),
        ...(fn.modulePath ? { modulePath: fn.modulePath } : {}),
        namespace: fn.namespace ?? inferFunctionNamespace(fn.name),
        metadataAvailable: fn.metadataAvailable ?? Boolean(fn.file),
        invocations: 0,
        avgDuration: 0,
        errorRate: 0,
        lastInvoked: 0,
        registered: true,
        activeCount: activeQueries.filter((query) => query.functionName === fn.name).length
      };
      if (fn.args) entry.args = fn.args;
      map.set(fn.name, entry);
    }

    // Merge with observed metrics
    for (const metric of functionMetrics) {
      const existing = map.get(metric.functionName);
      const fnType =
        existing?.type ?? inferFunctionType(metric.type) ?? "query";

      const entry: FunctionListEntry = {
        name: metric.functionName,
        type: fnType,
        ...(existing?.file ? { file: existing.file } : {}),
        ...(existing?.modulePath ? { modulePath: existing.modulePath } : {}),
        namespace: existing?.namespace ?? inferFunctionNamespace(metric.functionName),
        metadataAvailable: existing?.metadataAvailable ?? false,
        invocations: metric.invocations,
        avgDuration: metric.avgDuration,
        errorRate: metric.errorRate,
        lastInvoked: metric.lastInvoked,
        registered: existing?.registered ?? false,
        activeCount: activeQueries.filter(
          (query) => query.functionName === metric.functionName
        ).length
      };
      if (existing?.args) entry.args = existing.args;
      map.set(metric.functionName, entry);
    }

    return Array.from(map.values());
  }, [activeQueries, fnList, functionMetrics]);

  /* ---------------------------------------------------------------- */
  /*  Group by file for tree view                                      */
  /* ---------------------------------------------------------------- */

  const fileTree = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const tracesByFunction = traceIndex.byFunctionName;
    const filtered = normalizedSearch
      ? allFunctions.filter(
          (fn) => getFunctionSearchText(fn, tracesByFunction).includes(normalizedSearch)
        )
      : allFunctions;

    const groups = new Map<string, typeof filtered>();
    for (const fn of filtered) {
      const group = getFunctionGroupLabel(fn);
      const existing = groups.get(group) ?? [];
      existing.push(fn);
      groups.set(group, existing);
    }

    return Array.from(groups.entries())
      .map(([group, functions]) => [
        group,
        [...functions].sort(compareFunctionEntries)
      ] as const)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [allFunctions, search, traceIndex.byFunctionName]);

  /* ---------------------------------------------------------------- */
  /*  Selected function details                                        */
  /* ---------------------------------------------------------------- */

  const selectedFunction = useMemo(
    () => allFunctions.find((fn) => fn.name === selectedFn) ?? null,
    [allFunctions, selectedFn]
  );

  const selectedFnEvents = useMemo(() => {
    if (!selectedFn) return [];
    return functionEvents.filter((e) => e.functionName === selectedFn);
  }, [functionEvents, selectedFn]);
  const selectedFnTraces = useMemo(
    () => (selectedFn ? (traceIndex.byFunctionName.get(selectedFn) ?? []) : []),
    [selectedFn, traceIndex]
  );
  const selectedFnActiveQueries = useMemo(
    () =>
      selectedFn
        ? activeQueries.filter((query) => query.functionName === selectedFn)
        : [],
    [activeQueries, selectedFn]
  );
  const selectFunction = useCallback(
    (name: string, options: { clearRouteSearch?: boolean } = {}) => {
      setSelectedFn(name);
      setArgsText("{}");
      setRunResult({ status: "idle" });
      if (options.clearRouteSearch) {
        appliedSearchRef.current = null;
        void navigate({ to: "/functions", search: {}, replace: true });
      }
    },
    [navigate]
  );

  useEffect(() => {
    if (functionSearch.fn) {
      return;
    }

    if (allFunctions.length === 0) {
      if (selectedFn !== null) {
        setSelectedFn(null);
        setArgsText("{}");
        setRunResult({ status: "idle" });
      }
      return;
    }

    if (selectedFn && allFunctions.some((fn) => fn.name === selectedFn)) {
      return;
    }

    selectFunction(allFunctions[0]!.name);
  }, [allFunctions, functionSearch.fn, selectFunction, selectedFn]);

  useEffect(() => {
    if (!functionSearch.fn) {
      return;
    }

    const searchKey = `${functionSearch.fn}\u0000${functionSearch.args ?? ""}`;
    if (appliedSearchRef.current === searchKey) {
      return;
    }

    setSelectedFn(functionSearch.fn);
    setRunResult({ status: "idle" });
    if (functionSearch.args) {
      try {
        setArgsText(JSON.stringify(JSON.parse(functionSearch.args), null, 2));
      } catch {
        setArgsText(functionSearch.args);
      }
    } else {
      setArgsText("{}");
    }
    appliedSearchRef.current = searchKey;
  }, [functionSearch.args, functionSearch.fn]);

  /* ---------------------------------------------------------------- */
  /*  Run function                                                     */
  /* ---------------------------------------------------------------- */

  const handleRun = useCallback(async (overrideArgs?: Record<string, unknown>) => {
    if (!selectedFunction || !targetRuntimeId) return;

    let args: Record<string, unknown>;
    if (overrideArgs) {
      args = overrideArgs;
    } else {
      try {
        const parsed = JSON.parse(argsText) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setRunResult({
            status: "error",
            error: "Arguments must be a JSON object"
          });
          return;
        }
        args = parsed as Record<string, unknown>;
      } catch {
        setRunResult({
          status: "error",
          error: "Invalid JSON in arguments"
        });
        return;
      }
    }

    setRunResult({ status: "running" });
    try {
      const res = await sendRequest({
        kind: "fn.run",
        functionName: selectedFunction.name,
        functionType:
          selectedFunction.type === "cron" ? "action" : selectedFunction.type,
        args
      }, { targetRuntimeId });
      if (res.kind === "fn.run.result") {
        if (res.error) {
          setRunResult({
            status: "error",
            error: res.error,
            durationMs: res.durationMs
          });
        } else {
          setRunResult({
            status: "success",
            result: res.result,
            durationMs: res.durationMs
          });
        }
      }
    } catch (err) {
      setRunResult({
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error"
      });
    }
  }, [selectedFunction, targetRuntimeId, argsText]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      {/* ---- Left sidebar: file tree ---- */}
      <div className="hidden min-h-0 w-72 shrink-0 md:flex">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg-surface">
        <div className="border-b border-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[13px] font-bold text-text-primary flex-1">
              Functions
            </h2>
            {usingProjectTarget && (
              <Badge variant="outline" className="text-[9px]">
                Project Target
              </Badge>
            )}
            {loadingFunctions && (
              <Loader2 size={12} className="animate-spin text-text-tertiary" />
            )}
          </div>
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <Input
              placeholder="Search functions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 border-border bg-bg-base pl-8 text-[12px]"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {fileTree.length === 0 ? (
              <div className="py-8 text-center">
                <Code2 size={20} className="mx-auto mb-2 text-text-tertiary" />
                <p className="text-[11px] text-text-tertiary">
                  {targetRuntimeId
                    ? "No functions available for this target"
                    : "Connect a runtime"}
                </p>
              </div>
            ) : (
              fileTree.map(([group, fns]) => (
                <FileGroup
                  key={group}
                  group={group}
                  functions={fns}
                  selectedFn={selectedFn}
                  onSelect={(name) =>
                    selectFunction(name, { clearRouteSearch: true })
                  }
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Summary counts */}
        <div className="border-t border-border p-3">
          <div className="flex gap-3 text-[11px] text-text-tertiary">
            <span>
              {allFunctions.filter((f) => f.type === "query").length} queries
            </span>
            <span>
              {allFunctions.filter((f) => f.type === "mutation").length}{" "}
              mutations
            </span>
            <span>
              {allFunctions.filter((f) => f.type === "action").length} actions
            </span>
          </div>
        </div>
        </div>
      </div>

      {/* ---- Right content: function details ---- */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg-surface">
        {/* Mobile: function selector button */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setMobileFunctionsOpen(true)}
          >
            <Code2 size={13} />
            Functions
          </Button>
          {selectedFunction && (
            <Badge variant="secondary" className="max-w-[60vw] truncate font-mono">
              <span className="truncate">{selectedFunction.name}</span>
            </Badge>
          )}
          {allFunctions.length > 0 && (
            <span className="ml-auto text-[11px] text-text-tertiary">
              {allFunctions.length} fns
            </span>
          )}
        </div>

        {selectedFunction ? (
          <>
            {/* Header */}
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-3 mb-2">
                <FunctionBadge type={selectedFunction.type} />
                <h2 className="text-[14px] font-bold text-text-primary font-mono">
                  {selectedFunction.name}
                </h2>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-text-tertiary flex-wrap">
                <span className="flex items-center gap-1">
                  <FileCode size={11} />
                  {selectedFunction.file ??
                    "file unavailable from runtime metadata"}
                </span>
                <span className="flex items-center gap-1">
                  <Code2 size={11} />
                  {selectedFunction.namespace}
                </span>
                <Badge variant={selectedFunction.registered ? "secondary" : "outline"}>
                  {selectedFunction.registered ? "registered" : "observed only"}
                </Badge>
                {!selectedFunction.metadataAvailable && (
                  <Badge variant="outline">
                    file metadata unavailable
                  </Badge>
                )}
                <span className="flex items-center gap-1">
                  <Activity size={11} />
                  {selectedFunction.invocations} invocations
                </span>
                {selectedFnActiveQueries.length > 0 && (
                  <span className="flex items-center gap-1 text-fn-query">
                    <Radio size={11} />
                    {selectedFnActiveQueries.length} active
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  {formatDuration(selectedFunction.avgDuration)} avg
                </span>
                {selectedFunction.errorRate > 0 && (
                  <span className="flex items-center gap-1 text-error">
                    <AlertCircle size={11} />
                    {(selectedFunction.errorRate * 100).toFixed(1)}% errors
                  </span>
                )}
              </div>
            </div>

            {/* Tabs: Runner / Logs / Metrics */}
            <Tabs
              defaultValue="runner"
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="border-b border-border px-4">
                <TabsList variant="line" className="h-9">
                  <TabsTrigger value="runner">Runner</TabsTrigger>
                  <TabsTrigger value="logs">
                    Logs
                    {selectedFnEvents.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1.5 text-[9px] px-1 py-0"
                      >
                        {selectedFnEvents.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="active">
                    Active
                    {selectedFnActiveQueries.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1.5 text-[9px] px-1 py-0"
                      >
                        {selectedFnActiveQueries.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="metrics">Metrics</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="runner" className="flex-1 min-h-0">
                <FunctionRunner
                  fn={selectedFunction}
                  argsText={argsText}
                  setArgsText={setArgsText}
                  runResult={runResult}
                  onRun={() => void handleRun()}
                  connected={Boolean(targetRuntimeId)}
                />
              </TabsContent>

              <TabsContent value="logs" className="flex-1 min-h-0">
                <FunctionLogs
                  events={selectedFnEvents}
                  traces={selectedFnTraces}
                  onUseArgs={(args) => setArgsText(JSON.stringify(args, null, 2))}
                  onOpenExecution={(executionId) =>
                    void navigate({
                      to: "/logs",
                      search: { executionId }
                    })
                  }
                />
              </TabsContent>

              <TabsContent value="active" className="flex-1 min-h-0">
                <FunctionActiveQueries
                  queries={selectedFnActiveQueries}
                  onOpenQueries={() => void navigate({ to: "/queries" })}
                />
              </TabsContent>

              <TabsContent value="metrics" className="flex-1 min-h-0">
                <FunctionMetricsPanel
                  fn={selectedFunction}
                  activeQueries={selectedFnActiveQueries}
                  traces={selectedFnTraces}
                />
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <EmptyState
            icon={Code2}
            title="Select a function"
            description="Choose a function from the sidebar to view details, run it with custom arguments, and inspect logs."
            className="h-full"
          />
        )}
      </div>

      {/* Mobile: function list dialog */}
      <Dialog open={mobileFunctionsOpen} onOpenChange={setMobileFunctionsOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle className="text-[14px]">Functions</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="relative border-b border-border px-3 py-2">
              <Search
                size={13}
                className="pointer-events-none absolute left-5.5 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <Input
                placeholder="Search functions..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 border-border bg-bg-base pl-8 text-[12px]"
              />
            </div>
            <ScrollArea className="max-h-[55vh]">
              <div className="p-2">
                {fileTree.length === 0 ? (
                  <div className="py-8 text-center">
                    <Code2 size={20} className="mx-auto mb-2 text-text-tertiary" />
                    <p className="text-[11px] text-text-tertiary">
                      {targetRuntimeId
                        ? "No functions available"
                        : "Connect a runtime first"}
                    </p>
                  </div>
                ) : (
                  fileTree.map(([group, fns]) => (
                    <FileGroup
                      key={group}
                      group={group}
                      functions={fns}
                      selectedFn={selectedFn}
                      onSelect={(name) => {
                        selectFunction(name, { clearRouteSearch: true });
                        setMobileFunctionsOpen(false);
                      }}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  File group in tree                                                 */
/* ------------------------------------------------------------------ */

function FileGroup({
  group,
  functions,
  selectedFn,
  onSelect
}: {
  group: string;
  functions: FunctionListEntry[];
  selectedFn: string | null;
  onSelect: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-[11px] text-text-secondary hover:text-text-primary rounded transition-colors"
      >
        <ChevronRight
          size={11}
          className={cn(
            "text-text-tertiary transition-transform shrink-0",
            expanded && "rotate-90"
          )}
        />
        <FileCode size={11} className="text-text-tertiary shrink-0" />
        <span className="truncate font-medium">{group}</span>
        <span className="ml-auto text-text-tertiary text-[10px]">
          {functions.length}
        </span>
      </button>

      {expanded && (
        <div className="ml-3">
          {functions.map((fn) => (
            <button
              key={fn.name}
              type="button"
              onClick={() => onSelect(fn.name)}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1 text-[12px] rounded transition-colors",
                selectedFn === fn.name
                  ? "bg-accent/10 text-text-primary"
                  : "text-text-secondary hover:bg-bg-surface hover:text-text-primary"
              )}
            >
              <FunctionBadge
                type={fn.type}
                showIcon={false}
                className="text-[8px] px-1 py-0"
              />
              <span className="truncate font-mono text-[11px]">
                {extractFnName(fn.name)}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {fn.invocations > 0 && (
                  <span className="text-[10px] text-text-tertiary">
                    {fn.invocations}x
                  </span>
                )}
                {fn.activeCount > 0 && (
                  <Badge variant="secondary" className="px-1 py-0 text-[8px]">
                    active
                  </Badge>
                )}
                {!fn.registered && (
                  <Badge variant="outline" className="px-1 py-0 text-[8px]">
                    observed
                  </Badge>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Function Runner                                                    */
/* ------------------------------------------------------------------ */

function FunctionRunner({
  fn,
  argsText,
  setArgsText,
  runResult,
  onRun,
  connected
}: {
  fn: { name: string; type: FunctionType; args?: Record<string, unknown> };
  argsText: string;
  setArgsText: (v: string) => void;
  runResult: FunctionRunResult;
  onRun: () => void;
  connected: boolean;
}) {
  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      {/* Arguments editor */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-medium text-text-tertiary">
            Arguments
          </label>
          {fn.args && Object.keys(fn.args).length > 0 && (
            <Badge variant="outline" className="text-[9px]">
              Schema available
            </Badge>
          )}
        </div>
        <div className="relative">
          <textarea
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            className={cn(
              "w-full h-32 rounded-md border border-border bg-bg-base px-3 py-2",
              "font-mono text-[12px] text-text-code leading-relaxed",
              "focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent/40",
              "resize-none placeholder:text-text-tertiary"
            )}
            placeholder='{ "key": "value" }'
            spellCheck={false}
          />
        </div>
      </div>

      {/* Run button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={onRun}
          disabled={!connected || runResult.status === "running"}
          size="sm"
          className="gap-1.5"
        >
          {runResult.status === "running" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Play size={13} />
          )}
          {runResult.status === "running" ? "Running..." : "Run Function"}
        </Button>

        {!connected && (
          <span className="text-[11px] text-text-tertiary">
            Connect to a runtime to run functions
          </span>
        )}

        {runResult.durationMs !== undefined &&
          runResult.status !== "running" && (
            <span className="text-[11px] text-text-tertiary flex items-center gap-1">
              <Clock size={10} />
              {formatDuration(runResult.durationMs)}
            </span>
          )}
      </div>

      <Separator />

      {/* Result area */}
      <div className="flex-1 min-h-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-medium text-text-tertiary">
            Result
          </span>
          {runResult.status === "success" && (
            <CheckCircle2 size={12} className="text-success" />
          )}
          {runResult.status === "error" && (
            <XCircle size={12} className="text-error" />
          )}
        </div>

        {runResult.status === "idle" && (
          <div className="text-[12px] text-text-tertiary italic py-4">
            Run the function to see results here.
          </div>
        )}

        {runResult.status === "running" && (
          <div className="flex items-center gap-2 py-4 text-[12px] text-text-secondary">
            <Loader2 size={14} className="animate-spin" />
            Executing {fn.name}...
          </div>
        )}

        {runResult.status === "success" && (
          <ScrollArea className="h-[calc(100%-2rem)]">
            <JsonViewer data={runResult.result} defaultExpanded maxDepth={6} />
          </ScrollArea>
        )}

        {runResult.status === "error" && (
          <div className="rounded-md border border-error/20 bg-error/5 p-3">
            <p className="text-[12px] text-error font-mono whitespace-pre-wrap">
              {runResult.error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Function Logs                                                      */
/* ------------------------------------------------------------------ */

function FunctionLogs({
  events,
  traces,
  onUseArgs,
  onOpenExecution
}: {
  events: Array<{
    type: string;
    timestamp: number;
    functionName: string;
    durationMs?: number;
    error?: string;
  }>;
  traces: ExecutionTrace[];
  onUseArgs: (args: Record<string, unknown>) => void;
  onOpenExecution: (executionId: string) => void;
}) {
  if (events.length === 0 && traces.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No logs yet"
        description="Function invocations will appear here as they are executed."
        className="h-full"
      />
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-1">
        {traces.length > 0 ? traces.map((trace, i) => {
          const event = events[i];
          const eventType =
            trace.kind === "query"
              ? "query.executed"
              : trace.kind === "mutation" || trace.kind === "dashboard"
                ? "mutation.committed"
                : "action.completed";
          const fnType = inferFunctionType(eventType);
          const args =
            trace.argsPreview?.kind === "value" &&
            trace.argsPreview.value &&
            typeof trace.argsPreview.value === "object" &&
            !Array.isArray(trace.argsPreview.value)
              ? (trace.argsPreview.value as Record<string, unknown>)
              : null;
          return (
            <div
              key={`${trace.executionId}-${i}`}
              role="button"
              tabIndex={0}
              onClick={() => onOpenExecution(trace.executionId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenExecution(trace.executionId);
                }
              }}
              title="Open execution in Logs"
              className="group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors animate-fade-in hover:bg-bg-surface/50 focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {fnType && (
                <FunctionBadge
                  type={fnType}
                  showIcon={false}
                  className="text-[8px] px-1 py-0 w-14 justify-center"
                />
              )}
              <TimestampCell timestamp={event?.timestamp ?? Date.now()} format="time" />
              {event && "durationMs" in event && event.durationMs !== undefined && (
                <span className="text-[11px] text-text-tertiary font-mono">
                  {formatDuration(event.durationMs)}
                </span>
              )}
              {((event && "error" in event && event.error) || trace?.error) && (
                <Badge variant="destructive" className="text-[9px]">
                  Error
                </Badge>
              )}
              <span className="ml-auto text-[10px] text-text-tertiary font-mono truncate max-w-48">
                {trace.executionId}
              </span>
              <ExternalLink
                size={12}
                className="shrink-0 text-text-tertiary opacity-60 transition-colors group-hover:text-accent group-hover:opacity-100"
              />
              {args && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Use args"
                  onClick={(event) => {
                    event.stopPropagation();
                    onUseArgs(args);
                  }}
                >
                  <Copy size={12} />
                </Button>
              )}
            </div>
          );
        }) : events.map((event, i) => {
          const fnType = inferFunctionType(event.type);
          return (
            <div
              key={`${event.timestamp}-${i}`}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-bg-surface/50 transition-colors animate-fade-in"
            >
              {fnType && (
                <FunctionBadge
                  type={fnType}
                  showIcon={false}
                  className="text-[8px] px-1 py-0 w-14 justify-center"
                />
              )}
              <TimestampCell timestamp={event.timestamp} format="time" />
              {event.durationMs !== undefined && (
                <span className="text-[11px] text-text-tertiary font-mono">
                  {formatDuration(event.durationMs)}
                </span>
              )}
              {event.error && (
                <Badge variant="destructive" className="text-[9px]">
                  Error
                </Badge>
              )}
              <span className="ml-auto text-[10px] text-text-tertiary font-mono truncate max-w-48">
                {event.type}
              </span>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------ */
/*  Function Active Queries                                            */
/* ------------------------------------------------------------------ */

function FunctionActiveQueries({
  queries,
  onOpenQueries
}: {
  queries: SyncoreActiveQueryInfo[];
  onOpenQueries: () => void;
}) {
  if (queries.length === 0) {
    return (
      <EmptyState
        icon={Radio}
        title="No active query runs"
        description="This query function is not currently watched by the app."
        className="h-full"
      />
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between rounded-md border border-border bg-bg-base px-3 py-2">
          <div className="text-[12px] text-text-secondary">
            {queries.length} active subscription{queries.length === 1 ? "" : "s"} ·{" "}
            {queries.reduce((sum, query) => sum + (query.consumers ?? 1), 0)} consumer
            {queries.reduce((sum, query) => sum + (query.consumers ?? 1), 0) === 1
              ? ""
              : "s"}
          </div>
          <Button variant="outline" size="xs" className="gap-1.5" onClick={onOpenQueries}>
            <Radio size={11} />
            Open Queries
          </Button>
        </div>

        {queries.map((query) => (
          <div
            key={query.id}
            className="rounded-md border border-border bg-bg-base p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <code className="min-w-0 flex-1 truncate text-[11px] text-text-primary">
                {query.id}
              </code>
              <Badge variant="secondary" className="shrink-0 text-[9px]">
                {query.consumers ?? 1} consumer
                {(query.consumers ?? 1) === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] text-text-tertiary">
              <span>Last run</span>
              <TimestampCell timestamp={query.lastRunAt} format="relative" />
              <span>Dependencies</span>
              <span className="font-mono">{query.dependencyKeys.length}</span>
            </div>
            <JsonViewer data={query.args ?? {}} maxDepth={3} />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------ */
/*  Function Metrics Panel                                             */
/* ------------------------------------------------------------------ */

function FunctionMetricsPanel({
  fn,
  activeQueries,
  traces
}: {
  fn: {
    name: string;
    type: FunctionType;
    invocations: number;
    avgDuration: number;
    errorRate: number;
    lastInvoked: number;
  };
  activeQueries: SyncoreActiveQueryInfo[];
  traces: ExecutionTrace[];
}) {
  const successCount = traces.filter((trace) => !trace.error).length;
  const errorCount = traces.filter((trace) => trace.error).length;
  const totalConsumers = activeQueries.reduce(
    (sum, query) => sum + (query.consumers ?? 1),
    0
  );

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label={fn.type === "query" ? "Runs" : "Occurrences"}
          value={String(fn.invocations)}
          icon={Activity}
        />
        <MetricCard
          label="Avg Duration"
          value={formatDuration(fn.avgDuration)}
          icon={Clock}
        />
        <MetricCard
          label="Error Rate"
          value={`${(fn.errorRate * 100).toFixed(1)}%`}
          icon={AlertCircle}
          variant={fn.errorRate > 0.1 ? "error" : "default"}
        />
        <MetricCard
          label="Active"
          value={fn.type === "query" ? String(activeQueries.length) : "-"}
          icon={Radio}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="Consumers"
          value={fn.type === "query" ? String(totalConsumers) : "-"}
          icon={Radio}
        />
        <MetricCard
          label="Success"
          value={String(successCount)}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Errors"
          value={String(errorCount)}
          icon={AlertCircle}
          variant={errorCount > 0 ? "error" : "default"}
        />
        <MetricCard
          label="Last Run"
          value={
            fn.lastInvoked > 0
              ? new Date(fn.lastInvoked).toLocaleTimeString()
              : "Never"
          }
          icon={Clock}
        />
      </div>

      {fn.invocations === 0 && (
        <p className="text-[12px] text-text-tertiary text-center py-6">
          No invocation data yet. Run the function or wait for runtime activity.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Metric card                                                        */
/* ------------------------------------------------------------------ */

function MetricCard({
  label,
  value,
  icon: Icon,
  variant = "default"
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  variant?: "default" | "error";
}) {
  return (
    <div className="rounded-md border border-border bg-bg-base p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon
          size={12}
          className={variant === "error" ? "text-error" : "text-text-tertiary"}
        />
        <span className="text-[10px] font-medium text-text-tertiary">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-[18px] font-bold font-mono",
          variant === "error" ? "text-error" : "text-text-primary"
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Extract short function name from module:functionName format */
function extractFnName(fullName: string): string {
  const parts = fullName.split(":");
  return parts.length > 1 ? parts[parts.length - 1]! : fullName;
}

function inferFunctionNamespace(name: string): string {
  if (name.includes(":")) {
    return name.split(":")[0] ?? "root";
  }
  if (name.includes("/")) {
    return name.split("/")[0] ?? "root";
  }
  return "root";
}

function getFunctionGroupLabel(fn: FunctionListEntry): string {
  if (fn.namespace && fn.namespace !== "root") {
    return `${fn.namespace}/`;
  }
  return "Root functions";
}

function compareFunctionEntries(left: FunctionListEntry, right: FunctionListEntry) {
  if (left.activeCount !== right.activeCount) {
    return right.activeCount - left.activeCount;
  }
  if (left.lastInvoked !== right.lastInvoked) {
    return right.lastInvoked - left.lastInvoked;
  }
  if (left.registered !== right.registered) {
    return left.registered ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}

function getFunctionSearchText(
  fn: FunctionListEntry,
  tracesByFunction: Map<string, ExecutionTrace[]>
): string {
  const traces = tracesByFunction.get(fn.name) ?? [];
  return [
    fn.name,
    fn.type,
    fn.file ?? "",
    fn.modulePath ?? "",
    fn.namespace,
    fn.registered ? "registered" : "observed only",
    JSON.stringify(fn.args ?? {}),
    traces
      .slice(0, 5)
      .map((trace) =>
        JSON.stringify({
          args: trace.argsPreview,
          result: trace.resultPreview,
          error: trace.error
        })
      )
      .join(" ")
  ]
    .join(" ")
    .toLowerCase();
}
