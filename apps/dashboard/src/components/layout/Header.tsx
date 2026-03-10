import { useRouterState } from "@tanstack/react-router";
import {
  useActiveRuntime,
  useConnectedRuntimes,
  useDevtoolsStore,
  useSelectedRuntimeConnected
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
  const selectRuntime = useDevtoolsStore((s) => s.selectRuntime);
  const activeRuntime = useActiveRuntime();
  const runtimeConnected = useSelectedRuntimeConnected();
  const runtimes = useConnectedRuntimes();

  const title = ROUTE_TITLES[pathname] ?? "Dashboard";
  const runtimeId = activeRuntime?.runtimeId ?? null;
  const sessionLabel = activeRuntime?.sessionLabel ?? null;
  const platform = activeRuntime?.platform ?? null;

  // Extract the unique name from the session label (format: "UniqueName (Browser)")
  const displayName = sessionLabel ?? platform ?? null;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-base px-4 md:px-6">
      <div className="flex items-center gap-2">
        {/* Hamburger for mobile */}
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
        {/* Runtime selector — only when multiple active runtimes */}
        {runtimes.length > 1 && (
          <Select
            {...(runtimeConnected && runtimeId ? { value: runtimeId } : {})}
            onValueChange={(value) => selectRuntime(value)}
          >
            <SelectTrigger
              size="sm"
              className="min-w-48 max-w-72 hidden sm:flex"
            >
              <SelectValue
                placeholder={
                  runtimeConnected
                    ? "Select runtime"
                    : displayName
                      ? `${displayName} (inactive)`
                      : "Select runtime"
                }
              />
            </SelectTrigger>
            <SelectContent align="end">
              {runtimes.map((runtime) => {
                const label =
                  runtime.sessionLabel ?? runtime.appName ?? runtime.platform;
                return (
                  <SelectItem key={runtime.runtimeId} value={runtime.runtimeId}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-text-primary font-medium">
                        {label}
                      </span>
                      <span className="truncate text-[10px] text-text-tertiary font-mono">
                        {runtime.runtimeId.slice(0, 8)}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}

        {/* Active runtime display name */}
        {displayName && runtimes.length <= 1 && (
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-[11px] font-medium text-text-secondary">
              {displayName}
            </div>
          </div>
        )}

        {/* Platform badge */}
        {platform && (
          <Badge
            variant="secondary"
            className="hidden font-mono text-[10px] md:inline-flex"
          >
            {platform}
          </Badge>
        )}

        {/* Connection indicator */}
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
