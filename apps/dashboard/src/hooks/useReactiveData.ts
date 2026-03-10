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
  const [changedPulses, setChangedPulses] = useState<Map<string, number>>(
    new Map()
  );
  const [newPulses, setNewPulses] = useState<Map<string, number>>(new Map());
  const previousHashesRef = useRef<Map<string, string>>(new Map());
  const changePulseVersionsRef = useRef<Map<string, number>>(new Map());
  const newPulseVersionsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const previousHashes = previousHashesRef.current;
    const nextHashes = new Map<string, string>();
    const changed = new Map<string, number>();
    const added = new Map<string, number>();
    const changePulseVersions = changePulseVersionsRef.current;
    const newPulseVersions = newPulseVersionsRef.current;

    for (const [index, item] of items.entries()) {
      const key = keyFn(item, index);
      const hash = hashFn ? hashFn(item) : JSON.stringify(item);
      nextHashes.set(key, hash);
      if (!previousHashes.has(key)) {
        const nextPulse = (newPulseVersions.get(key) ?? 0) + 1;
        newPulseVersions.set(key, nextPulse);
        added.set(key, nextPulse);
      } else if (previousHashes.get(key) !== hash) {
        const nextPulse = (changePulseVersions.get(key) ?? 0) + 1;
        changePulseVersions.set(key, nextPulse);
        changed.set(key, nextPulse);
      }
    }

    previousHashesRef.current = nextHashes;

    if (changed.size > 0 || added.size > 0) {
      setChangedPulses(changed);
      setNewPulses(added);
      const timer = setTimeout(() => {
        setChangedPulses(new Map());
        setNewPulses(new Map());
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [hashFn, items, keyFn]);

  return {
    isChanged: (key: string) => changedPulses.has(key),
    isNew: (key: string) => newPulses.has(key),
    getChangePulse: (key: string) => changedPulses.get(key) ?? 0,
    getNewPulse: (key: string) => newPulses.get(key) ?? 0
  };
}

export function useDidJustChange(value: unknown): {
  didChange: boolean;
  pulse: number;
} {
  const [pulse, setPulse] = useState(0);
  const previousValueRef = useRef<string | null>(null);
  const latestPulseRef = useRef(0);

  useEffect(() => {
    const serialized = JSON.stringify(value);
    const previousValue = previousValueRef.current;
    if (previousValue !== null && previousValue !== serialized) {
      const nextPulse = latestPulseRef.current + 1;
      latestPulseRef.current = nextPulse;
      setPulse(nextPulse);
      const timer = setTimeout(() => setPulse(0), 1200);
      previousValueRef.current = serialized;
      return () => clearTimeout(timer);
    }
    previousValueRef.current = serialized;
  }, [value]);

  return {
    didChange: pulse > 0,
    pulse
  };
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
    error,
    hasData: data !== null
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
