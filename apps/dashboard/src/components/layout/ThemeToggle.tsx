import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useTheme,
  setThemeWithTransition,
  type Theme
} from "@/lib/theme";

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Moon }> = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor }
];

/**
 * Theme switcher for the dashboard. Cycles are surfaced as a small
 * popover anchored to the trigger button — matches the size/shape of the
 * adjacent Settings icon button for visual consistency.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const CurrentIcon =
    OPTIONS.find((o) => o.value === theme)?.icon ?? Moon;

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        title={`Theme: ${theme}`}
        aria-label="Change theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-text-tertiary hover:text-text-primary"
      >
        <CurrentIcon size={14} />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[8.5rem] overflow-hidden rounded-md border border-border bg-bg-surface p-1 shadow-soft"
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = value === theme;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={(e) => {
                  setThemeWithTransition(value, e.clientX, e.clientY);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[12px] transition-colors duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
                  active
                    ? "bg-bg-elevated text-text-primary"
                    : "text-text-secondary hover:bg-bg-elevated/60 hover:text-text-primary"
                )}
              >
                <Icon size={14} />
                {label}
                {active && (
                  <span className="ml-auto size-1.5 rounded-full bg-accent" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
