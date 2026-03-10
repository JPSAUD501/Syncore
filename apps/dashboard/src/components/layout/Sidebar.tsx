import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Database,
  Code2,
  ScrollText,
  Clock,
  Terminal,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnectedRuntimeCount, useDevtoolsStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: Activity },
  { to: "/data", label: "Data", icon: Database },
  { to: "/functions", label: "Functions", icon: Code2 },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/scheduler", label: "Scheduler", icon: Clock },
  { to: "/sql", label: "SQL Console", icon: Terminal }
] as const;

interface SidebarProps {
  collapsed?: boolean;
  onClose?: (() => void) | undefined;
  onNavClick?: (() => void) | undefined;
}

export function Sidebar({ collapsed, onClose, onNavClick }: SidebarProps) {
  const location = useRouterState({ select: (s) => s.location });
  const connected = useDevtoolsStore((s) => s.connected);
  const connectedRuntimeCount = useConnectedRuntimeCount();

  if (collapsed) return null;

  return (
    <aside className="flex h-screen w-[240px] shrink-0 flex-col border-r border-border bg-bg-base">
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-bg-surface font-semibold text-text-primary">
          S
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-text-primary">
            Syncore
          </div>
          <div className="truncate text-[12px] text-text-tertiary">
            Dev Dashboard
          </div>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="self-start md:hidden"
          >
            <X size={14} />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-3 flex flex-1 flex-col gap-0.5 px-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavClick}
              className={cn(
                "flex items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] transition-colors duration-150",
                "hover:bg-bg-surface hover:text-text-primary",
                isActive
                  ? "border-border-hover bg-bg-surface text-text-primary"
                  : "border-transparent text-text-secondary"
              )}
            >
              <item.icon size={15} strokeWidth={1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Status bar */}
      <div className="space-y-2 border-t border-border px-4 py-3">
        <div className="text-[11px] text-text-tertiary">
          {connected
            ? connectedRuntimeCount > 0
              ? `${connectedRuntimeCount} runtime(s) connected`
              : "Hub connected"
            : "Disconnected"}
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
