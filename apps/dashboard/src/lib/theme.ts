import { useSyncExternalStore } from "react";

/**
 * Theme management for the dashboard.
 *
 * Preference is one of "dark" | "light" | "system", persisted to
 * localStorage (`syncore-dashboard-theme`). Default is **dark**.
 *
 * The resolved theme is applied by toggling the `light` class on
 * `<html>` (dark is the unstyled default). An inline script in
 * `index.html` applies the class before first paint to avoid a flash;
 * this module keeps it in sync at runtime and reacts to system changes
 * when the preference is "system".
 */

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "syncore-dashboard-theme";

function getSystemTheme(): ResolvedTheme {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "system" || v === "dark" ? v : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
}

let state: Theme = typeof window === "undefined" ? "dark" : getStoredTheme();
let resolved: ResolvedTheme =
  typeof window === "undefined" ? "dark" : resolveTheme(state);
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

// Apply on first import (runtime safety net on top of the index.html script).
if (typeof window !== "undefined") {
  applyTheme(resolved);

  // React to OS theme changes only while following the system preference.
  if (typeof window.matchMedia === "function") {
    window
      .matchMedia("(prefers-color-scheme: light)")
      .addEventListener("change", () => {
        if (state === "system") {
          resolved = getSystemTheme();
          applyTheme(resolved);
          emit();
        }
      });
  }
}

export function setTheme(theme: Theme) {
  state = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore storage failures (private mode, etc.) */
  }
  resolved = resolveTheme(theme);
  applyTheme(resolved);
  emit();
}

/**
 * Switch theme with a circular reveal originating at the given point.
 *
 * Uses the View Transitions API + Web Animations API when available; the
 * reveal animates `::view-transition-new(root)` via WAAPI (more reliable
 * than toggling a CSS class, which races the default cross-fade). Falls
 * back to a plain {@link setTheme} otherwise.
 */
export function setThemeWithTransition(theme: Theme, x: number, y: number) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => {
      ready: Promise<void>;
      finished: Promise<void>;
    };
  };

  if (typeof document === "undefined" || typeof doc.startViewTransition !== "function") {
    setTheme(theme);
    return;
  }

  const transition = doc.startViewTransition(() => {
    setTheme(theme);
  });

  transition.ready.then(() => {
    // Animate the new snapshot expanding as a circle from the click point.
    // The base CSS disables the default cross-fade on ::view-transition-old/new(root).
    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(150% at ${x}px ${y}px)`
        ]
      },
      {
        duration: 450,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        pseudoElement: "::view-transition-new(root)"
      }
    );
  }).catch(() => {
    /* user dismissed or transition skipped — ignore */
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => state,
    () => "dark" as Theme
  );
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    () => resolved,
    () => "dark" as ResolvedTheme
  );
  return { theme, resolvedTheme, setTheme };
}
