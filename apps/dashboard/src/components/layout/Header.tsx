import { useRouterState } from "@tanstack/react-router";
import {
  useActiveRuntime,
  useConnectedTargets,
  useDevtoolsStore,
  useProjectTargetRuntime,
  useSelectedRuntimeConnected,
  useSelectedRuntimeFilter,
  useSelectedTarget,
  useSelectedTargetRuntimes
} from "@/lib/store";
import { Wifi, WifiOff, Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const sessionLabel = activeRuntime?.sessionLabel ?? null;
  const platform = activeRuntime?.platform ?? null;

  const displayName = sessionLabel ?? platform ?? null;
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
              className="hidden min-w-48 max-w-72 sm:flex"
            >
              <SelectValue placeholder="Select target" />
            </SelectTrigger>
            <SelectContent align="end">
              {targets.map((target) => (
                <SelectItem key={target.id} value={target.id}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-text-primary">
                      {target.id} - {target.label}
                    </span>
                    <span className="truncate font-mono text-[10px] text-text-tertiary">
                      {target.kind === "project"
                        ? "project"
                        : `${target.connectedSessions} session(s)`}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {selectedTarget?.kind === "client" && selectedTargetRuntimes.length > 1 && (
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
              className="hidden min-w-44 max-w-64 sm:flex"
            >
              <SelectValue placeholder="All sessions" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-text-primary">
                    All sessions
                  </span>
                  <span className="truncate font-mono text-[10px] text-text-tertiary">
                    {selectedTarget.connectedSessions} session(s)
                  </span>
                </span>
              </SelectItem>
              {selectedTargetRuntimes.map((runtime) => (
                <SelectItem key={runtime.runtimeId} value={runtime.runtimeId}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-text-primary">
                      {runtime.sessionLabel ?? runtime.appName ?? runtime.platform}
                    </span>
                    <span className="truncate font-mono text-[10px] text-text-tertiary">
                      {runtime.runtimeId.slice(0, 8)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {displayName && targets.length <= 1 && (
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-[11px] font-medium text-text-secondary">
              {displayName}
            </div>
          </div>
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

        <Button
          variant="outline"
          size="sm"
          onClick={toggleIncludeDashboardActivity}
          className="h-8 px-2.5 text-[11px]"
          title={
            includeDashboardActivity
              ? "Hide dashboard-origin activity from counts and logs"
              : "Include dashboard-origin activity in counts and logs"
          }
        >
          {includeDashboardActivity ? "All activity" : "App only"}
        </Button>

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
