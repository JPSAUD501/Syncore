import { useRouterState } from "@tanstack/react-router";
import { useDevtoolsStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  const runtimeId = useDevtoolsStore((s) => s.runtimeId);
  const platform = useDevtoolsStore((s) => s.platform);

  const title = ROUTE_TITLES[pathname] ?? "Dashboard";

  return (
    <header className="flex items-center justify-between h-12 px-6 border-b border-border bg-bg-base/60 backdrop-blur-sm shrink-0">
      <h1 className="text-sm font-bold text-text-primary">{title}</h1>

      <div className="flex items-center gap-3">
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
