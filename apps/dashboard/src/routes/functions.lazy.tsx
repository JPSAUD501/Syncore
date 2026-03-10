import { createLazyFileRoute } from "@tanstack/react-router";
import {
  Code2,
  ChevronRight,
  FileCode,
  Play,
  Loader2,
  AlertCircle,
  Clock,
  Activity,
  Search,
  XCircle,
  CheckCircle2
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  FunctionBadge,
  inferFunctionType,
  JsonViewer,
  EmptyState,
  TimestampCell
} from "@/components/shared";
import type { FunctionType } from "@/components/shared/FunctionBadge";
import { useDevtools } from "@/hooks";
import { useDevtoolsSubscription } from "@/hooks/useReactiveData";
import { sendRequest } from "@/lib/store";
import { cn, formatDuration } from "@/lib/utils";

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

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

function FunctionsPage() {
  const { isReady, functionMetrics, functionEvents } = useDevtools();
  const [search, setSearch] = useState("");
  const [selectedFn, setSelectedFn] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<FunctionRunResult>({
    status: "idle"
  });
  const [argsText, setArgsText] = useState("{}");

  /* ---------------------------------------------------------------- */
  /*  Reactive function list fetch                                     */
  /* ---------------------------------------------------------------- */

  const functionsSubscription = useDevtoolsSubscription(
    isReady ? { kind: "functions.catalog" } : null,
    { enabled: isReady }
  );

  const registeredFunctions =
    functionsSubscription.data?.kind === "functions.catalog.result"
      ? functionsSubscription.data.functions
      : null;
  const loadingFunctions = functionsSubscription.loading;

  const fnList = useMemo(
    () => registeredFunctions ?? [],
    [registeredFunctions]
  );

  /* ---------------------------------------------------------------- */
  /*  Build combined function list (registered + observed from events)  */
  /* ---------------------------------------------------------------- */

  const allFunctions = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        type: FunctionType;
        file: string;
        invocations: number;
        avgDuration: number;
        errorRate: number;
        lastInvoked: number;
        registered: boolean;
        args?: Record<string, unknown>;
      }
    >();

    // Seed from registered functions
    for (const fn of fnList) {
      const entry: {
        name: string;
        type: FunctionType;
        file: string;
        invocations: number;
        avgDuration: number;
        errorRate: number;
        lastInvoked: number;
        registered: boolean;
        args?: Record<string, unknown>;
      } = {
        name: fn.name,
        type: fn.type as FunctionType,
        file: fn.file,
        invocations: 0,
        avgDuration: 0,
        errorRate: 0,
        lastInvoked: 0,
        registered: true
      };
      if (fn.args) entry.args = fn.args;
      map.set(fn.name, entry);
    }

    // Merge with observed metrics
    for (const metric of functionMetrics) {
      const existing = map.get(metric.functionName);
      const fnType =
        existing?.type ?? inferFunctionType(metric.type) ?? "query";

      const entry: {
        name: string;
        type: FunctionType;
        file: string;
        invocations: number;
        avgDuration: number;
        errorRate: number;
        lastInvoked: number;
        registered: boolean;
        args?: Record<string, unknown>;
      } = {
        name: metric.functionName,
        type: fnType,
        file: existing?.file ?? inferFileFromName(metric.functionName),
        invocations: metric.invocations,
        avgDuration: metric.avgDuration,
        errorRate: metric.errorRate,
        lastInvoked: metric.lastInvoked,
        registered: existing?.registered ?? false
      };
      if (existing?.args) entry.args = existing.args;
      map.set(metric.functionName, entry);
    }

    return Array.from(map.values());
  }, [fnList, functionMetrics]);

  /* ---------------------------------------------------------------- */
  /*  Group by file for tree view                                      */
  /* ---------------------------------------------------------------- */

  const fileTree = useMemo(() => {
    const filtered = search
      ? allFunctions.filter(
          (fn) =>
            fn.name.toLowerCase().includes(search.toLowerCase()) ||
            fn.file.toLowerCase().includes(search.toLowerCase())
        )
      : allFunctions;

    const groups = new Map<string, typeof filtered>();
    for (const fn of filtered) {
      const file = fn.file;
      const existing = groups.get(file) ?? [];
      existing.push(fn);
      groups.set(file, existing);
    }

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allFunctions, search]);

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

  useEffect(() => {
    if (allFunctions.length === 0) {
      if (selectedFn !== null) {
        setSelectedFn(null);
      }
      return;
    }

    if (selectedFn && allFunctions.some((fn) => fn.name === selectedFn)) {
      return;
    }

    setSelectedFn(allFunctions[0]!.name);
  }, [allFunctions, selectedFn]);

  /* ---------------------------------------------------------------- */
  /*  Run function                                                     */
  /* ---------------------------------------------------------------- */

  const handleRun = useCallback(async () => {
    if (!selectedFunction || !isReady) return;

    let args: Record<string, unknown>;
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

    setRunResult({ status: "running" });
    try {
      const res = await sendRequest({
        kind: "fn.run",
        functionName: selectedFunction.name,
        functionType:
          selectedFunction.type === "cron" ? "action" : selectedFunction.type,
        args
      });
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
  }, [selectedFunction, isReady, argsText]);

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
                  {isReady
                    ? "No functions observed yet"
                    : "Connect to an active runtime to see functions"}
                </p>
              </div>
            ) : (
              fileTree.map(([file, fns]) => (
                <FileGroup
                  key={file}
                  file={file}
                  functions={fns}
                  selectedFn={selectedFn}
                  onSelect={setSelectedFn}
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
                  {selectedFunction.file}
                </span>
                <span className="flex items-center gap-1">
                  <Activity size={11} />
                  {selectedFunction.invocations} invocations
                </span>
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
                  connected={isReady}
                />
              </TabsContent>

              <TabsContent value="logs" className="flex-1 min-h-0">
                <FunctionLogs events={selectedFnEvents} />
              </TabsContent>

              <TabsContent value="metrics" className="flex-1 min-h-0">
                <FunctionMetricsPanel fn={selectedFunction} />
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  File group in tree                                                 */
/* ------------------------------------------------------------------ */

function FileGroup({
  file,
  functions,
  selectedFn,
  onSelect
}: {
  file: string;
  functions: Array<{
    name: string;
    type: FunctionType;
    invocations: number;
  }>;
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
        <span className="truncate font-medium">{file}</span>
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
              {fn.invocations > 0 && (
                <span className="ml-auto text-[10px] text-text-tertiary">
                  {fn.invocations}x
                </span>
              )}
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
  events
}: {
  events: Array<{
    type: string;
    timestamp: number;
    functionName: string;
    durationMs?: number;
    error?: string;
  }>;
}) {
  if (events.length === 0) {
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
        {events.map((event, i) => {
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
              {"durationMs" in event && event.durationMs !== undefined && (
                <span className="text-[11px] text-text-tertiary font-mono">
                  {formatDuration(event.durationMs)}
                </span>
              )}
              {"error" in event && event.error && (
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
/*  Function Metrics Panel                                             */
/* ------------------------------------------------------------------ */

function FunctionMetricsPanel({
  fn
}: {
  fn: {
    name: string;
    type: FunctionType;
    invocations: number;
    avgDuration: number;
    errorRate: number;
    lastInvoked: number;
  };
}) {
  return (
    <div className="p-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard
          label="Invocations"
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
          label="Last Invoked"
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

/** Infer a file path from a function name like "api/users:list" */
function inferFileFromName(name: string): string {
  const parts = name.split(":");
  if (parts.length > 1) {
    return parts[0]! + ".ts";
  }
  return "unknown";
}
