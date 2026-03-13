import { useRouterState } from "@tanstack/react-router";
import {
  getPublicRuntimeId,
  getRuntimeLabel,
  parseSessionLabel,
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
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/data": "Data Browser",
  "/functions": "Functions",
  "/logs": "Logs",
  "/scheduler": "Scheduler",
  "/sql": "SQL Console"
};

function getTargetDisplayParts(target: NonNullable<ReturnType<typeof useSelectedTarget>>) {
  if (target.kind === "project") {
    return {
      name: target.label,
      browser: null as string | null
    };
  }
  const primaryRuntime =
    target.runtimes.find((runtime) => runtime.connected) ?? target.runtimes[0] ?? null;
  const parsed = parseSessionLabel(primaryRuntime?.sessionLabel);
  return {
    name:
      parsed?.name ??
      primaryRuntime?.appName ??
      primaryRuntime?.databaseLabel ??
      primaryRuntime?.origin ??
      target.label,
    browser: parsed?.browser ?? null
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
  const supportsProjectFallback = ["/data", "/functions", "/scheduler", "/sql"].includes(
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

      <div className="flex items-center gap-2 md:gap-3">
        {targets.length > 0 && (
          <Select
            {...(selectedTarget?.id ? { value: selectedTarget.id } : {})}
            onValueChange={(value) => selectTarget(value)}
          >
            <SelectTrigger
              size="sm"
              className="hidden min-w-[180px] max-w-[320px] sm:flex"
            >
              <SelectValue placeholder="Select target" />
            </SelectTrigger>
            <SelectContent position="popper" align="center" className="min-w-[200px] w-[var(--radix-select-trigger-width)]">
              {targets.map((target) => {
                const parts = getTargetDisplayParts(target);
                return (
                  <SelectItem key={target.id} value={target.id}>
                    <div className="flex min-w-0 w-full items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                        {parts.name}
                      </span>
                      <span className="text-[10px] font-mono text-text-tertiary whitespace-nowrap">
                        {target.id}
                      </span>
                      {parts.browser && (
                        <span className="rounded-full border border-border bg-bg-base px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary whitespace-nowrap">
                          {parts.browser}
                        </span>
                      )}
                      {target.kind !== "project" && (
                        <span className="rounded-full bg-bg-base px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary tabular-nums border border-border">
                          {target.connectedSessions}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}

        {selectedTarget?.kind === "client" && (
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
              className="hidden min-w-[140px] max-w-[240px] sm:flex"
            >
              <SelectValue placeholder="Select session" />
            </SelectTrigger>
            <SelectContent position="popper" align="center" className="min-w-[200px] w-[var(--radix-select-trigger-width)]">
              {selectedTargetRuntimes.length > 1 && (
                <SelectItem value="all">
                  <div className="flex w-full items-center gap-2">
                    <span className="font-medium text-text-primary">All sessions</span>
                    <span className="ml-auto rounded-full bg-bg-base px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary tabular-nums border border-border">
                      {selectedTarget.connectedSessions}
                    </span>
                  </div>
                </SelectItem>
              )}
              {selectedTargetRuntimes.map((runtime) => {
                const label = getRuntimeLabel(runtime);
                return (
                  <SelectItem key={runtime.runtimeId} value={runtime.runtimeId}>
                    <div className="flex w-full items-center gap-2">
                      <span className="font-medium text-text-primary truncate">
                        {label}
                      </span>
                      <span className="ml-auto text-[10px] whitespace-nowrap font-mono text-text-tertiary">
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
        )}

        {platform && (
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
              className="hidden md:flex text-text-tertiary hover:text-text-primary"
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
