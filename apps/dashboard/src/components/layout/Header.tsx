import { useRouterState } from "@tanstack/react-router";
import {
  useActiveRuntime,
  useDevtoolsStore,
  useRuntimeList
} from "@/lib/store";
import { Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/data": "Data Browser",
  "/functions": "Functions",
  "/logs": "Logs",
  "/scheduler": "Scheduler",
  "/sql": "SQL Console"
};

export function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const connected = useDevtoolsStore((s) => s.connected);
  const selectRuntime = useDevtoolsStore((s) => s.selectRuntime);
  const activeRuntime = useActiveRuntime();
  const runtimes = useRuntimeList().filter((runtime) => runtime.connected);

  const title = ROUTE_TITLES[pathname] ?? "Dashboard";
  const runtimeId = activeRuntime?.runtimeId ?? null;
  const platform = activeRuntime?.platform ?? null;

  return (
    <header className="flex items-center justify-between h-12 px-6 border-b border-border bg-bg-base/60 backdrop-blur-sm shrink-0">
      <h1 className="text-sm font-bold text-text-primary">{title}</h1>

      <div className="flex items-center gap-3">
        {runtimes.length > 1 && (
          <Select
            {...(runtimeId ? { value: runtimeId } : {})}
            onValueChange={(value) => selectRuntime(value)}
          >
            <SelectTrigger size="sm" className="min-w-56 max-w-72">
              <SelectValue placeholder="Select runtime" />
            </SelectTrigger>
            <SelectContent align="end">
              {runtimes.map((runtime) => {
                const label =
                  runtime.appName ?? runtime.sessionLabel ?? runtime.platform;
                const detail = runtime.origin ?? runtime.platform;
                return (
                  <SelectItem key={runtime.runtimeId} value={runtime.runtimeId}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-text-primary">
                        {label}
                      </span>
                      <span className="truncate text-[11px] text-text-tertiary">
                        {detail} - {runtime.runtimeId.slice(0, 8)}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}

        {/* Platform badge */}
        {platform && (
          <Badge variant="secondary" className="font-mono text-[11px]">
            {platform}
          </Badge>
        )}

        {/* Runtime ID */}
        {runtimeId && (
          <span className="text-[11px] font-mono text-text-tertiary">
            {runtimeId.slice(0, 12)}
          </span>
        )}

        {/* Connection indicator */}
        <Badge
          variant={connected ? "success" : "destructive"}
          className="gap-1.5"
        >
          {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {connected ? "Live" : "Offline"}
        </Badge>
      </div>
    </header>
  );
}
