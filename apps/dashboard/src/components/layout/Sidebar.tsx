import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Activity,
  Database,
  Code2,
  HardDrive,
  Radio,
  ScrollText,
  Clock,
  Terminal,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useConnectedRuntimeCount,
  useDevtoolsStore,
  useSelectedTarget
} from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: Activity },
  { to: "/data", label: "Data", icon: Database },
  { to: "/storage", label: "Storage", icon: HardDrive },
  { to: "/functions", label: "Functions", icon: Code2 },
  { to: "/queries", label: "Active Queries", icon: Radio },
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
  const selectedTarget = useSelectedTarget();

  if (collapsed) return null;

  return (
    <aside className="flex h-screen w-[240px] shrink-0 flex-col border-r border-border bg-bg-base">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-bg-base">
          S
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-text-primary">
            Syncore
          </div>
          <div className="truncate text-[11px] leading-tight text-text-tertiary">
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
        {NAV_ITEMS.filter((item) => {
          if (item.to !== "/sql") {
            return true;
          }
          return selectedTarget?.sqlAvailable === true;
        }).map((item) => {
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
                "relative flex items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] transition-colors duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
                "hover:text-text-primary",
                isActive
                  ? "border-border-hover bg-bg-surface text-text-primary"
                  : "border-transparent text-text-secondary hover:bg-bg-surface/60"
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="sidebar-active-indicator"
                  className="pointer-events-none absolute inset-0 rounded-md border border-border-hover bg-bg-surface"
                  transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
                />
              )}
              <item.icon
                size={15}
                strokeWidth={1.8}
                className="relative z-10"
              />
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Status bar */}
      <div className="space-y-2 border-t border-border px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              connected
                ? "bg-success animate-live-dot"
                : "bg-text-tertiary"
            )}
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
