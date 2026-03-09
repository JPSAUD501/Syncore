import { useEffect, useMemo, useState } from "react";
import { subscribe, useActiveRuntime } from "@/lib/store";
import type {
  SyncoreDevtoolsSubscriptionPayload,
  SyncoreDevtoolsSubscriptionResultPayload
} from "@syncore/devtools-protocol";

export function useTrackChanges<T>(
  items: T[],
  keyFn: (item: T) => string,
  hashFn?: (item: T) => string
) {
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [previousHashes, setPreviousHashes] = useState<Map<string, string>>(
    new Map()
  );

  useEffect(() => {
    const nextHashes = new Map<string, string>();
    const changed = new Set<string>();
    const added = new Set<string>();

    for (const item of items) {
      const key = keyFn(item);
      const hash = hashFn ? hashFn(item) : JSON.stringify(item);
      nextHashes.set(key, hash);
      if (!previousHashes.has(key)) {
        added.add(key);
      } else if (previousHashes.get(key) !== hash) {
        changed.add(key);
      }
    }

    setPreviousHashes(nextHashes);
    setChangedKeys(changed);
    setNewKeys(added);

    if (changed.size > 0 || added.size > 0) {
      const timer = setTimeout(() => {
        setChangedKeys(new Set());
        setNewKeys(new Set());
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [hashFn, items, keyFn, previousHashes]);

  return {
    isChanged: (key: string) => changedKeys.has(key),
    isNew: (key: string) => newKeys.has(key)
  };
}

export function useDidJustChange(value: unknown): boolean {
  const [didChange, setDidChange] = useState(false);
  const [previousValue, setPreviousValue] = useState<string | null>(null);

  useEffect(() => {
    const serialized = JSON.stringify(value);
    if (previousValue !== null && previousValue !== serialized) {
      setDidChange(true);
      const timer = setTimeout(() => setDidChange(false), 1200);
      setPreviousValue(serialized);
      return () => clearTimeout(timer);
    }
    setPreviousValue(serialized);
  }, [previousValue, value]);

  return didChange;
}

export function useDevtoolsSubscription<
  TResult extends SyncoreDevtoolsSubscriptionResultPayload
>(
  payload: SyncoreDevtoolsSubscriptionPayload | null,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;
  const [data, setData] = useState<TResult | null>(null);
  const [loading, setLoading] = useState(Boolean(payload) && enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payload || !enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const unsubscribe = subscribe(payload, (nextPayload) => {
      setData(nextPayload as TResult);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, payload ? JSON.stringify(payload) : null]);

  return {
    data,
    loading,
    error
  };
}

export function useReactiveRuntimeData<T>(
  selector: (runtime: NonNullable<ReturnType<typeof useActiveRuntime>>) => T,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;
  const activeRuntime = useActiveRuntime();

  return useMemo(
    () => ({
      data: enabled && activeRuntime ? selector(activeRuntime) : null,
      loading: enabled && !activeRuntime,
      didJustChange: false,
      refresh: () => undefined
    }),
    [activeRuntime, enabled, selector]
  );
}

export function useRefreshTimer(intervalMs = 1000) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((value) => value + 1);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
}
