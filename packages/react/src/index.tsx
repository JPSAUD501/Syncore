import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { FunctionReference, SyncoreClient, SyncoreWatch } from "syncore";

type ManagedSyncoreWatch<TResult> = SyncoreWatch<TResult> & {
  dispose?: () => void;
};

type OptionalArgsTuple<TArgs> =
  Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];

const SyncoreContext = createContext<SyncoreClient | null>(null);

/**
 * Provide a Syncore client to React descendants.
 *
 * Wrap your app with this component to use Syncore hooks like `useQuery` and
 * `useMutation`.
 */
export function SyncoreProvider({
  client,
  children
}: {
  client: SyncoreClient;
  children: ReactNode;
}) {
  return (
    <SyncoreContext.Provider value={client}>{children}</SyncoreContext.Provider>
  );
}

/**
 * Read the active Syncore client from React context.
 *
 * Throws if used outside of {@link SyncoreProvider}.
 */
export function useSyncore(): SyncoreClient {
  const client = useContext(SyncoreContext);
  if (!client) {
    throw new Error("SyncoreProvider is missing from the React tree.");
  }
  return client;
}

/**
 * Load a reactive Syncore query within a React component.
 *
 * The hook subscribes automatically and re-renders whenever the local query
 * result changes.
 */
export function useQuery<TArgs, TResult>(
  reference: FunctionReference<"query", TArgs, TResult>,
  ...args: OptionalArgsTuple<TArgs>
): TResult | undefined {
  const client = useSyncore();
  const watch = useManagedQueryWatch(
    client,
    reference,
    normalizeOptionalArgs(args)
  );
  const [snapshot, setSnapshot] = useState(() => readWatchSnapshot(watch));

  useEffect(() => {
    const sync = () => {
      setSnapshot(readWatchSnapshot(watch));
    };
    sync();
    return watch.onUpdate(sync);
  }, [watch]);

  if (snapshot.error) {
    throw snapshot.error;
  }

  return snapshot.result;
}

/**
 * Construct a stable function that executes a Syncore mutation.
 */
export function useMutation<TArgs, TResult>(
  reference: FunctionReference<"mutation", TArgs, TResult>
): (...args: OptionalArgsTuple<TArgs>) => Promise<TResult> {
  const client = useSyncore();
  return (...args) => client.mutation(reference, normalizeOptionalArgs(args));
}

/**
 * Construct a stable function that executes a Syncore action.
 */
export function useAction<TArgs, TResult>(
  reference: FunctionReference<"action", TArgs, TResult>
): (...args: OptionalArgsTuple<TArgs>) => Promise<TResult> {
  const client = useSyncore();
  return (...args) => client.action(reference, normalizeOptionalArgs(args));
}

/**
 * Load several Syncore queries at once using explicit keys.
 */
export function useQueries<TResult>(
  entries: Array<{
    key: string;
    reference: FunctionReference<"query">;
    args?: Record<string, unknown>;
  }>
): Record<string, TResult | undefined> {
  const client = useSyncore();
  const entriesKey = stableStringify(
    entries.map((entry) => ({
      key: entry.key,
      referenceName: entry.reference.name,
      args: entry.args ?? {}
    }))
  );
  const normalizedEntries = useMemo(
    () =>
      JSON.parse(entriesKey) as Array<{
        key: string;
        referenceName: string;
        args: Record<string, unknown>;
      }>,
    [entriesKey]
  );
  const watches = useMemo(
    () =>
      normalizedEntries.map((entry) => ({
        key: entry.key,
        watch: client.watchQuery(
          { kind: "query", name: entry.referenceName },
          entry.args
        ) as ManagedSyncoreWatch<TResult>
      })),
    [client, normalizedEntries]
  );
  const [snapshot, setSnapshot] = useState(() => readQueriesSnapshot(watches));

  useEffect(
    () => () => {
      for (const entry of watches) {
        entry.watch.dispose?.();
      }
    },
    [watches]
  );

  useEffect(() => {
    const sync = () => {
      setSnapshot(readQueriesSnapshot(watches));
    };
    sync();
    const cleanups = watches.map((entry) => entry.watch.onUpdate(sync));
    return () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    };
  }, [watches]);

  return snapshot;
}

function useManagedQueryWatch<TArgs, TResult>(
  client: SyncoreClient,
  reference: FunctionReference<"query", TArgs, TResult>,
  args?: TArgs
): ManagedSyncoreWatch<TResult> {
  const argsKey = stableStringify(args ?? {});
  const normalizedArgs = useMemo(() => JSON.parse(argsKey) as TArgs, [argsKey]);
  const watch = useMemo<ManagedSyncoreWatch<TResult>>(
    () =>
      client.watchQuery(
        reference,
        normalizedArgs
      ) as ManagedSyncoreWatch<TResult>,
    [client, normalizedArgs, reference]
  );

  useEffect(() => () => watch.dispose?.(), [watch]);

  return watch;
}

function normalizeOptionalArgs<TArgs>(
  args: [] | [TArgs] | readonly unknown[]
): TArgs {
  return (args[0] ?? {}) as TArgs;
}

function readWatchSnapshot<TResult>(watch: SyncoreWatch<TResult>): {
  result: TResult | undefined;
  error: Error | undefined;
} {
  return {
    result: watch.localQueryResult(),
    error: watch.localQueryError()
  };
}

function readQueriesSnapshot<TResult>(
  watches: Array<{
    key: string;
    watch: ManagedSyncoreWatch<TResult>;
  }>
): Record<string, TResult | undefined> {
  return Object.fromEntries(
    watches.map((entry) => [entry.key, entry.watch.localQueryResult()])
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)])
    );
  }
  return value;
}
