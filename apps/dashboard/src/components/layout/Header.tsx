import { useRouterState } from "@tanstack/react-router";
import {
  getPublicTargetDisplayId,
  getPublicRuntimeId,
  getRuntimeBrowser,
  getRuntimeLabel,
  getStorageProtocolLabel,
  useActiveRuntime,
  useConnectedTargets,
  useDevtoolsStore,
  useProjectTargetRuntime,
  useSelectedRuntimeConnected,
  useSelectedRuntimeFilter,
  useSelectedTarget,
  useSelectedTargetRuntimes
} from "@/lib/store";
import { Wifi, WifiOff, Menu, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/data": "Data Browser",
  "/functions": "Functions",
  "/queries": "Active Queries",
  "/logs": "Logs",
  "/scheduler": "Scheduler",
  "/sql": "SQL Console"
};

function getTargetDisplayParts(target: NonNullable<ReturnType<typeof useSelectedTarget>>) {
  return {
    name: target.label,
    protocol: getStorageProtocolLabel(target.storageProtocol),
    publicId: getPublicTargetDisplayId(target.id)
  };
}

export function Header({
  onToggleSidebar
}: {
  onToggleSidebar?: (() => void) | undefined;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const connected = useDevtoolsStore((s) => s.connected);
  const selectTarget = useDevtoolsStore((s) => s.selectTarget);
  const selectRuntime = useDevtoolsStore((s) => s.selectRuntime);
  const selectRuntimeFilter = useDevtoolsStore((s) => s.selectRuntimeFilter);
  const includeDashboardActivity = useDevtoolsStore(
    (s) => s.includeDashboardActivity
  );
  const toggleIncludeDashboardActivity = useDevtoolsStore(
    (s) => s.toggleIncludeDashboardActivity
  );
  const activeRuntime = useActiveRuntime();
  const selectedTarget = useSelectedTarget();
  const selectedTargetRuntimes = useSelectedTargetRuntimes();
  const selectedRuntimeFilter = useSelectedRuntimeFilter();
  const runtimeConnected = useSelectedRuntimeConnected();
  const targets = useConnectedTargets();
  const projectTarget = useProjectTargetRuntime();

  const title = ROUTE_TITLES[pathname] ?? "Dashboard";
  const platform = activeRuntime?.platform ?? null;
  const supportsProjectFallback = ["/data", "/functions", "/queries", "/scheduler", "/sql"].includes(
    pathname
  );
  const projectOffline =
    supportsProjectFallback && !runtimeConnected && projectTarget?.connected;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-base px-4 md:px-6">
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleSidebar}
            className="md:hidden"
          >
            <Menu size={16} />
          </Button>
        )}
        <h1 className="text-sm font-semibold text-text-primary">{title}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        {/* Data source selector */}
        <div className="flex items-center gap-1.5">
          <span className="hidden shrink-0 select-none text-[11px] text-text-tertiary sm:block">Data Source</span>
          {targets.length > 0 ? (
            <Select
              value={selectedTarget?.id ?? ""}
              onValueChange={(value) => selectTarget(value)}
            >
              <SelectTrigger size="sm" className="max-w-32 sm:min-w-40 sm:max-w-70">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent position="popper" align="center" className="min-w-64 w-(--radix-select-trigger-width)">
                {targets.filter((t) => t.kind === "client").map((target) => {
                  const parts = getTargetDisplayParts(target);
                  return (
                    <SelectItem key={target.id} value={target.id}>
                      <div className="flex min-w-0 w-full items-center gap-1.5">
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full transition-colors",
                            target.connected ? "bg-success" : "bg-text-tertiary/40"
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                          {parts.name}
                        </span>
                        <span className="rounded border border-border bg-bg-base px-1.5 py-0.5 text-[10px] text-text-tertiary whitespace-nowrap">
                          {parts.protocol}
                        </span>
                        <span className="font-mono text-[10px] text-text-tertiary/60 whitespace-nowrap">
                          {parts.publicId}
                        </span>
                        {target.connectedRuntimes > 0 && (
                          <span className="tabular-nums text-[10px] text-text-tertiary/60 whitespace-nowrap">
                            {target.connectedRuntimes}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
                {targets.some((t) => t.kind === "client") &&
                  targets.some((t) => t.kind === "project") && (
                    <SelectSeparator />
                  )}
                {targets.filter((t) => t.kind === "project").map((target) => {
                  const parts = getTargetDisplayParts(target);
                  return (
                    <SelectItem key={target.id} value={target.id}>
                      <div className="flex min-w-0 w-full items-center gap-1.5">
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full transition-colors",
                            target.connected ? "bg-success" : "bg-text-tertiary/40"
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                          {parts.name}
                        </span>
                        <span className="rounded border border-accent/30 bg-accent/8 px-1.5 py-0.5 text-[10px] font-medium text-accent whitespace-nowrap">
                          Project
                        </span>
                        <span className="rounded border border-border bg-bg-base px-1.5 py-0.5 text-[10px] text-text-tertiary whitespace-nowrap">
                          {parts.protocol}
                        </span>
                        <span className="font-mono text-[10px] text-text-tertiary/60 whitespace-nowrap">
                          {parts.publicId}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          ) : (
            <span className="hidden rounded-md border border-dashed border-border px-2.5 py-1 text-[11px] text-text-tertiary sm:flex">
              {connected ? "Waiting for app…" : "No app connected"}
            </span>
          )}
        </div>

        {/* Runtime selector */}
        {selectedTarget?.kind === "client" && (
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="shrink-0 select-none text-[11px] text-text-tertiary">Runtime</span>
            <Select
              value={selectedRuntimeFilter ?? "all"}
              onValueChange={(value) =>
                value === "all"
                  ? selectRuntimeFilter("all")
                  : selectRuntime(value)
              }
            >
              <SelectTrigger
                size="sm"
                className="min-w-36 max-w-55"
              >
                <SelectValue placeholder="Select runtime" />
              </SelectTrigger>
              <SelectContent position="popper" align="center" className="min-w-50 w-(--radix-select-trigger-width)">
                {selectedTargetRuntimes.length > 1 && (
                  <>
                    <SelectItem value="all">
                      <div className="flex w-full items-center gap-1.5">
                        <span className="size-1.5 shrink-0 rounded-full bg-success" />
                        <span className="flex-1 font-medium text-text-primary">All</span>
                        <span className="rounded border border-border bg-bg-base px-1.5 py-0.5 text-[10px] tabular-nums text-text-tertiary whitespace-nowrap">
                          {selectedTarget.connectedRuntimes} connected
                        </span>
                      </div>
                    </SelectItem>
                    <SelectSeparator />
                  </>
                )}
                {selectedTargetRuntimes.map((runtime) => {
                  const label = getRuntimeLabel(runtime);
                  const browser = getRuntimeBrowser(runtime);
                  const isWorker = browser?.toLowerCase().includes("worker");
                  return (
                    <SelectItem key={runtime.runtimeId} value={runtime.runtimeId}>
                      <div className="flex w-full items-center gap-1.5">
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full transition-colors",
                            runtime.connected ? "bg-success" : "bg-text-tertiary/40"
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                          {label}
                        </span>
                        {browser && !isWorker && (
                          <span className="rounded border border-border bg-bg-base px-1.5 py-0.5 text-[10px] text-text-tertiary whitespace-nowrap">
                            {browser}
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-text-tertiary/60 whitespace-nowrap">
                          {getPublicRuntimeId(
                            runtime.runtimeId,
                            selectedTargetRuntimes.map((entry) => entry.runtimeId)
                          )}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        {platform && !platform.toLowerCase().includes("worker") && (
          <Badge
            variant="secondary"
            className="hidden font-mono text-[10px] md:inline-flex"
          >
            {platform}
          </Badge>
        )}

        {projectOffline && (
          <Badge variant="outline" className="hidden text-[10px] md:inline-flex">
            Project Offline
          </Badge>
        )}

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              className="flex text-text-tertiary hover:text-text-primary"
              title="Settings"
            >
              <Settings size={14} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Configure the dashboard interface and filtering behavior.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              {/* Runtime selector — shown in Settings on mobile since header selector is sm+ only */}
              {selectedTarget?.kind === "client" && (
                <div className="flex flex-col gap-2 sm:hidden">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-text-primary">
                      Runtime
                    </span>
                    <span className="text-[13px] text-text-tertiary">
                      Select which connected runtime to inspect.
                    </span>
                  </div>
                  <Select
                    value={selectedRuntimeFilter ?? "all"}
                    onValueChange={(value) =>
                      value === "all"
                        ? selectRuntimeFilter("all")
                        : selectRuntime(value)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select runtime" />
                    </SelectTrigger>
                    <SelectContent position="popper" align="center" className="min-w-50 w-(--radix-select-trigger-width)">
                      {selectedTargetRuntimes.length > 1 && (
                        <>
                          <SelectItem value="all">
                            <div className="flex w-full items-center gap-1.5">
                              <span className="size-1.5 shrink-0 rounded-full bg-success" />
                              <span className="flex-1 font-medium text-text-primary">All</span>
                              <span className="rounded border border-border bg-bg-base px-1.5 py-0.5 text-[10px] tabular-nums text-text-tertiary whitespace-nowrap">
                                {selectedTarget.connectedRuntimes} connected
                              </span>
                            </div>
                          </SelectItem>
                          <SelectSeparator />
                        </>
                      )}
                      {selectedTargetRuntimes.map((runtime) => {
                        const label = getRuntimeLabel(runtime);
                        const browser = getRuntimeBrowser(runtime);
                        const isWorker = browser?.toLowerCase().includes("worker");
                        return (
                          <SelectItem key={runtime.runtimeId} value={runtime.runtimeId}>
                            <div className="flex w-full items-center gap-1.5">
                              <span
                                className={cn(
                                  "size-1.5 shrink-0 rounded-full transition-colors",
                                  runtime.connected ? "bg-success" : "bg-text-tertiary/40"
                                )}
                              />
                              <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                                {label}
                              </span>
                              {browser && !isWorker && (
                                <span className="rounded border border-border bg-bg-base px-1.5 py-0.5 text-[10px] text-text-tertiary whitespace-nowrap">
                                  {browser}
                                </span>
                              )}
                              <span className="font-mono text-[10px] text-text-tertiary/60 whitespace-nowrap">
                                {getPublicRuntimeId(
                                  runtime.runtimeId,
                                  selectedTargetRuntimes.map((entry) => entry.runtimeId)
                                )}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text-primary">
                    Hide dashboard events
                  </span>
                  <span className="text-[13px] text-text-tertiary">
                    Exclude activity originating from this dashboard (like running queries) from the activity feed and metrics.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!includeDashboardActivity}
                  onClick={() => toggleIncludeDashboardActivity()}
                  className={cn(
                    "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:cursor-not-allowed disabled:opacity-50",
                    !includeDashboardActivity ? "bg-accent" : "bg-bg-elevated"
                  )}
                >
                  <span
                    data-state={!includeDashboardActivity ? "checked" : "unchecked"}
                    className={cn(
                      "pointer-events-none block size-4 rounded-full bg-white ring-0 transition-transform",
                      !includeDashboardActivity ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Badge
          variant={connected ? "success" : "destructive"}
          className={cn("gap-1.5", connected && "animate-fade-in")}
        >
          {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span className="hidden sm:inline">
            {connected ? "Live" : "Offline"}
          </span>
        </Badge>
      </div>
    </header>
  );
}
