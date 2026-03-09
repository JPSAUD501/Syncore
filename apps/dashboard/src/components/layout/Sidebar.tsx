import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Database,
  Code2,
  ScrollText,
  Clock,
  Terminal,
  Circle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnectedRuntimeCount, useDevtoolsStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: Activity },
  { to: "/data", label: "Data", icon: Database },
  { to: "/functions", label: "Functions", icon: Code2 },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/scheduler", label: "Scheduler", icon: Clock },
  { to: "/sql", label: "SQL Console", icon: Terminal }
] as const;

export function Sidebar() {
  const location = useRouterState({ select: (s) => s.location });
  const connected = useDevtoolsStore((s) => s.connected);
  const connectedRuntimeCount = useConnectedRuntimeCount();

  return (
    <aside className="flex flex-col h-screen border-r border-border bg-bg-base/80 backdrop-blur-sm w-[220px] shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-amber-700 text-bg-deep font-bold text-sm shadow-sm shadow-accent/20">
          S
        </div>
        <div>
          <div className="font-bold text-sm text-text-primary leading-tight">
            Syncore
          </div>
          <div className="text-[11px] text-text-tertiary leading-tight">
            Dev Dashboard
          </div>
        </div>
      </div>

      <Separator className="mx-4" />

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-3 flex-1 mt-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors duration-150",
                "hover:bg-bg-surface hover:text-text-primary",
                isActive
                  ? "bg-bg-surface text-text-primary border border-border-hover shadow-sm shadow-black/5"
                  : "text-text-secondary border border-transparent"
              )}
            >
              <item.icon size={15} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Status bar */}
      <div className="px-4 py-3 border-t border-border space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <Circle
            size={7}
            fill={connected ? "var(--color-success)" : "var(--color-error)"}
            stroke="none"
            className={cn(connected && "animate-pulse")}
          />
          <span>
            {connected
              ? connectedRuntimeCount > 0
                ? `${connectedRuntimeCount} runtime(s) connected`
                : "Hub connected"
              : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-[10px] py-0">
            v0.1.0
          </Badge>
          <span className="text-[10px] text-text-tertiary font-mono">
            :4310
          </span>
        </div>
      </div>
    </aside>
  );
}
