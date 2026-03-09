import { useEffect, useMemo, useRef, useState } from "react";
import { subscribe, useActiveRuntime, useDevtoolsStore } from "@/lib/store";
import type {
  SyncoreDevtoolsSubscriptionPayload,
  SyncoreDevtoolsSubscriptionResultPayload
} from "@syncore/devtools-protocol";

export function useTrackChanges<T>(
  items: T[],
  keyFn: (item: T, index: number) => string,
  hashFn?: (item: T) => string
) {
  const [changedKeys, setChangedKeys] = useState<Set<string>>(new Set());
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const previousHashesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const previousHashes = previousHashesRef.current;
    const nextHashes = new Map<string, string>();
    const changed = new Set<string>();
    const added = new Set<string>();

    for (const [index, item] of items.entries()) {
      const key = keyFn(item, index);
      const hash = hashFn ? hashFn(item) : JSON.stringify(item);
      nextHashes.set(key, hash);
      if (!previousHashes.has(key)) {
        added.add(key);
      } else if (previousHashes.get(key) !== hash) {
        changed.add(key);
      }
    }

    previousHashesRef.current = nextHashes;

    if (changed.size > 0 || added.size > 0) {
      setChangedKeys(changed);
      setNewKeys(added);
      const timer = setTimeout(() => {
        setChangedKeys(new Set());
        setNewKeys(new Set());
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [hashFn, items, keyFn]);

  return {
    isChanged: (key: string) => changedKeys.has(key),
    isNew: (key: string) => newKeys.has(key)
  };
}

export function useDidJustChange(value: unknown): boolean {
  const [didChange, setDidChange] = useState(false);
  const previousValueRef = useRef<string | null>(null);

  useEffect(() => {
    const serialized = JSON.stringify(value);
    const previousValue = previousValueRef.current;
    if (previousValue !== null && previousValue !== serialized) {
      setDidChange(true);
      const timer = setTimeout(() => setDidChange(false), 1200);
      previousValueRef.current = serialized;
      return () => clearTimeout(timer);
    }
    previousValueRef.current = serialized;
  }, [value]);

  return didChange;
}

export function useDevtoolsSubscription<
  TResult extends SyncoreDevtoolsSubscriptionResultPayload
>(
  payload: SyncoreDevtoolsSubscriptionPayload | null,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true;
  const selectedRuntimeId = useDevtoolsStore(
    (state) => state.selectedRuntimeId
  );
  const payloadRef = useRef<SyncoreDevtoolsSubscriptionPayload | null>(payload);
  const payloadKey = JSON.stringify(payload);
  payloadRef.current = payload;
  const [data, setData] = useState<TResult | null>(null);
  const [loading, setLoading] = useState(Boolean(payload) && enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextPayload = payloadRef.current;
    if (!nextPayload || !enabled || !selectedRuntimeId) {
      setData(null);
      setLoading(false);
      return;
    }

    setData(null);
    setLoading(true);
    setError(null);
    const unsubscribe = subscribe(
      nextPayload,
      (nextPayload) => {
        setData(nextPayload as TResult);
        setLoading(false);
      },
      {
        onError: (message) => {
          setError(message);
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [enabled, payloadKey, selectedRuntimeId]);

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
