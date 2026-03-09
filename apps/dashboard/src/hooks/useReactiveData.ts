import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveRuntime } from "@/lib/store";

/**
 * Hook that reactively fetches data at an interval and tracks
 * which items changed for highlight animations.
 *
 * Inspired by Convex dashboard's reactive pattern — data is always
 * live with no refresh buttons needed.
 */
export function useReactiveData<T>(
  fetcher: () => Promise<T>,
  options: {
    /** Polling interval in ms (default 2000) */
    interval?: number;
    /** Whether fetching is enabled */
    enabled?: boolean;
    /** Key extractor for change detection */
    keyExtractor?: (data: T) => string;
  } = {}
) {
  const { interval = 2000, enabled = true, keyExtractor } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const prevKeyRef = useRef<string | null>(null);
  const [didJustChange, setDidJustChange] = useState(false);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const result = await fetcher();
      if (!mountedRef.current) return;

      const newKey = keyExtractor
        ? keyExtractor(result)
        : JSON.stringify(result);
      const prevKey = prevKeyRef.current;

      setData(result);
      setError(null);
      setLastUpdated(Date.now());

      // Detect changes after first load
      if (prevKey !== null && prevKey !== newKey) {
        setDidJustChange(true);
        setTimeout(() => {
          if (mountedRef.current) setDidJustChange(false);
        }, 1200);
      }

      prevKeyRef.current = newKey;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [fetcher, keyExtractor]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      setLoading(true);
      void fetchData();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, fetchData]);

  // Polling interval
  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      void fetchData();
    }, interval);

    return () => clearInterval(timer);
  }, [enabled, interval, fetchData]);

  const refresh = useCallback(() => {
    void fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    didJustChange,
    refresh
  };
}

/**
 * Hook that tracks changes to individual items in an array for
 * per-row highlight animations.
 */
export function useTrackChanges<T>(
  items: T[],
  keyFn: (item: T) => string,
  hashFn?: (item: T) => string
) {
  const prevMapRef = useRef<Map<string, string>>(new Map());
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Initialize the map without marking anything as changed
      const map = new Map<string, string>();
      for (const item of items) {
        const key = keyFn(item);
        const hash = hashFn ? hashFn(item) : JSON.stringify(item);
        map.set(key, hash);
      }
      prevMapRef.current = map;
      return;
    }

    const prevMap = prevMapRef.current;
    const nextMap = new Map<string, string>();
    const changed = new Set<string>();
    const added = new Set<string>();

    for (const item of items) {
      const key = keyFn(item);
      const hash = hashFn ? hashFn(item) : JSON.stringify(item);
      nextMap.set(key, hash);

      if (!prevMap.has(key)) {
        added.add(key);
      } else if (prevMap.get(key) !== hash) {
        changed.add(key);
      }
    }

    prevMapRef.current = nextMap;

    if (changed.size > 0 || added.size > 0) {
      setChangedKeys(changed);
      setNewKeys(added);

      // Clear after animation
      setTimeout(() => {
        setChangedKeys(new Set());
        setNewKeys(new Set());
      }, 1200);
    }
  }, [items, keyFn, hashFn]);

  return {
    /** Keys of items whose values changed */
    changedKeys,
    /** Keys of newly added items */
    newKeys,
    /** Check if a specific item was just changed */
    isChanged: (key: string) => changedKeys.has(key),
    /** Check if a specific item was just added */
    isNew: (key: string) => newKeys.has(key),
    /** Check if a specific item has any highlight */
    hasHighlight: (key: string) => changedKeys.has(key) || newKeys.has(key)
  };
}

/**
 * Simple hook to force re-render on a timer (e.g., for relative timestamps).
 * Uses a shared singleton interval like Convex's useRefresh pattern.
 */
const refreshCallbacks = new Map<number, () => void>();
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let refreshNextId = 0;

function callRefreshCallbacks() {
  for (const cb of refreshCallbacks.values()) {
    cb();
  }
}

export function useRefreshTimer(intervalMs = 1000) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const id = refreshNextId++;
    const cb = () => forceUpdate((x) => x + 1);

    if (refreshCallbacks.size === 0) {
      refreshTimer = setInterval(callRefreshCallbacks, intervalMs);
    }
    refreshCallbacks.set(id, cb);

    return () => {
      refreshCallbacks.delete(id);
      if (refreshCallbacks.size === 0 && refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    };
  }, [intervalMs]);
}

/**
 * Hook that returns true for a brief period when a value changes.
 * Useful for triggering highlight animations on individual values.
 */
export function useDidJustChange(value: unknown): boolean {
  const prevRef = useRef<string | null>(null);
  const [didChange, setDidChange] = useState(false);
  const isFirst = useRef(true);

  useEffect(() => {
    const serialized = JSON.stringify(value);
    if (isFirst.current) {
      isFirst.current = false;
      prevRef.current = serialized;
      return;
    }

    if (prevRef.current !== serialized) {
      prevRef.current = serialized;
      setDidChange(true);
      const timer = setTimeout(() => setDidChange(false), 1200);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return didChange;
}

/**
 * Hook that auto-fetches data reactively based on active runtime events.
 * Re-fetches when the active runtime's event count changes, indicating
 * new activity (mutations, actions, etc.).
 */
export function useReactiveRuntimeData<T>(
  fetcher: () => Promise<T>,
  options: {
    enabled?: boolean;
    /** Also poll on an interval as a fallback */
    pollInterval?: number;
  } = {}
) {
  const { enabled = true, pollInterval = 3000 } = options;
  const activeRuntime = useActiveRuntime();
  const eventCount =
    (activeRuntime?.queryCount ?? 0) +
    (activeRuntime?.mutationCount ?? 0) +
    (activeRuntime?.actionCount ?? 0);

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const prevEventCountRef = useRef(eventCount);
  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);
  const [didJustChange, setDidJustChange] = useState(false);
  const prevDataHashRef = useRef<string | null>(null);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current || !enabled) return;
    fetchingRef.current = true;
    try {
      const result = await fetcher();
      if (!mountedRef.current) return;

      const hash = JSON.stringify(result);
      if (
        prevDataHashRef.current !== null &&
        prevDataHashRef.current !== hash
      ) {
        setDidJustChange(true);
        setTimeout(() => {
          if (mountedRef.current) setDidJustChange(false);
        }, 1200);
      }
      prevDataHashRef.current = hash;
      setData(result);
    } catch {
      /* silently handle — we'll retry on next poll */
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [fetcher, enabled]);

  // Initial fetch
  useEffect(() => {
    mountedRef.current = true;
    if (enabled) {
      setLoading(true);
      void fetchData();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, fetchData]);

  // Re-fetch when event count changes (reactive trigger)
  useEffect(() => {
    if (eventCount !== prevEventCountRef.current) {
      prevEventCountRef.current = eventCount;
      void fetchData();
    }
  }, [eventCount, fetchData]);

  // Fallback poll interval
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => void fetchData(), pollInterval);
    return () => clearInterval(timer);
  }, [enabled, pollInterval, fetchData]);

  return { data, loading, didJustChange, refresh: fetchData };
}
