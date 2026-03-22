import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionResult,
  PaginationOptions,
  PaginationResult,
  SyncoreClient,
  SyncorePaginatedQueryStatus,
  SyncoreQueryState,
  SyncoreRuntimeStatus,
  SyncoreWatch,
  UsePaginatedQueryResult
} from "@syncore/core";

type ManagedSyncoreWatch<TResult> = SyncoreWatch<TResult> & {
  dispose?: () => void;
};

type OptionalArgsTuple<TArgs> =
  Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];

type QueryRequestInput<
  TReference extends FunctionReference<"query"> = FunctionReference<"query">
> = Record<never, never> extends FunctionArgs<TReference>
  ? {
      query: TReference;
      args?: FunctionArgs<TReference> | Skip;
    }
  : {
      query: TReference;
      args: FunctionArgs<TReference> | Skip;
    };

type QueriesRequestInput = Record<string, QueryRequestInput>;

type QueryStateForEntry<TEntry> = TEntry extends QueryRequestInput<
  infer TReference
>
  ? SyncoreQueryState<FunctionResult<TReference>>
  : never;

export type UseQueriesResult<TEntries extends QueriesRequestInput> = {
  [TKey in keyof TEntries]: QueryStateForEntry<TEntries[TKey]>;
};

type PaginatedQueryReference = FunctionReference<
  "query",
  Record<string, unknown>,
  PaginationResult<unknown>
>;

type PaginatedQueryArgs<TReference extends FunctionReference<"query">> =
  FunctionArgs<TReference> extends { paginationOpts: PaginationOptions }
    ? Omit<FunctionArgs<TReference>, "paginationOpts">
    : never;

type PaginatedQueryItem<TReference extends FunctionReference<"query">> =
  FunctionResult<TReference> extends PaginationResult<infer TItem>
    ? TItem
    : never;

type QuerySnapshot<TResult> = {
  data: TResult | undefined;
  error: Error | undefined;
};

type NormalizedQueryEntry = {
  key: string;
  referenceName: string;
  args: Record<string, unknown>;
  skipped: boolean;
};

type PaginatedQueryInternalState = {
  requestKey: string;
  nextPageKey: number;
  pages: Array<{
    key: string;
    cursor: string | null;
    numItems: number;
  }>;
};

type QueryObserverRecord = {
  requestKey: string;
  snapshot: QuerySnapshot<unknown>;
  unsubscribe: () => void;
  watch?: ManagedSyncoreWatch<unknown>;
};

/**
 * Pass `"skip"` as the args argument to `useQuery`, `useQueryState`,
 * `useQueries`, or `usePaginatedQuery` to suppress the subscription entirely.
 */
export const skip = "skip" as const;
type Skip = typeof skip;

const defaultRuntimeStatus: SyncoreRuntimeStatus = {
  kind: "starting",
  reason: "booting"
};

const SyncoreContext = createContext<SyncoreClient | null>(null);

/**
 * Provide a Syncore client to React descendants.
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
 */
export function useSyncore(): SyncoreClient {
  const client = useContext(SyncoreContext);
  if (!client) {
    throw new Error("SyncoreProvider is missing from the React tree.");
  }
  return client;
}

/**
 * Subscribe to the active Syncore client's runtime lifecycle status.
 */
export function useSyncoreStatus(): SyncoreRuntimeStatus {
  const client = useSyncore();
  const watch = useMemo(
    () => client.watchRuntimeStatus() as ManagedSyncoreWatch<SyncoreRuntimeStatus>,
    [client]
  );
  const [status, setStatus] = useState<SyncoreRuntimeStatus>(() =>
    readRuntimeStatusSnapshot(watch)
  );

  useEffect(() => {
    const sync = () => {
      setStatus(readRuntimeStatusSnapshot(watch));
    };
    sync();
    return watch.onUpdate(sync);
  }, [watch]);

  useEffect(
    () => () => {
      watch.dispose?.();
    },
    [watch]
  );

  return status;
}

/**
 * Load a reactive Syncore query and return only the data for the common case.
 */
export function useQuery<TArgs, TResult>(
  reference: FunctionReference<"query", TArgs, TResult>,
  ...args: OptionalArgsTuple<TArgs> | [Skip]
): TResult | undefined {
  const state = useQueryState(reference, ...(args as OptionalArgsTuple<TArgs> | [Skip]));
  if (state.error) {
    throw state.error;
  }
  return state.data;
}

/**
 * Load a reactive Syncore query and keep the full local state.
 */
export function useQueryState<TArgs, TResult>(
  reference: FunctionReference<"query", TArgs, TResult>,
  ...args: OptionalArgsTuple<TArgs> | [Skip]
): SyncoreQueryState<TResult> {
  const isSkipped = args[0] === skip;
  const client = useSyncore();
  const runtimeStatus = useSyncoreStatus();
  const watch = useManagedQueryWatch(
    client,
    reference,
    isSkipped
      ? undefined
      : normalizeOptionalArgs(args as OptionalArgsTuple<TArgs>),
    isSkipped
  );
  const [snapshot, setSnapshot] = useState<QuerySnapshot<TResult>>(() =>
    isSkipped ? noOpSnapshot : readWatchSnapshot(watch)
  );

  useEffect(() => {
    if (isSkipped) {
      setSnapshot(noOpSnapshot);
      return;
    }
    const sync = () => {
      setSnapshot(readWatchSnapshot(watch));
    };
    sync();
    return watch.onUpdate(sync);
  }, [watch, isSkipped]);

  return toQueryState(snapshot, runtimeStatus, isSkipped);
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
 * Load a keyed set of Syncore queries at once with per-entry state.
 */
export function useQueries<TEntries extends QueriesRequestInput>(
  entries: TEntries
): UseQueriesResult<TEntries> {
  const client = useSyncore();
  const runtimeStatus = useSyncoreStatus();
  const entriesKey = stableStringify(
    Object.entries(entries)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => ({
        key,
        referenceName: entry.query.name,
        skipped: entry.args === skip,
        args:
          entry.args === skip
            ? {}
            : normalizeOptionalArgs([entry.args ?? {}] as [] | [unknown])
      }))
  );
  const normalizedEntries = useMemo(
    () => JSON.parse(entriesKey) as NormalizedQueryEntry[],
    [entriesKey]
  );
  const [observer] = useState(() => new ReactQueriesObserver(client));
  const [, setVersion] = useState(0);

  if (observer.client !== client) {
    observer.replaceClient(client);
  }

  useEffect(() => () => observer.destroy(), [observer]);

  useEffect(() => {
    observer.setEntries(normalizedEntries);
    setVersion((value) => value + 1);
    return observer.subscribe(() => {
      setVersion((value) => value + 1);
    });
  }, [normalizedEntries, observer]);

  const snapshot = observer.getSnapshot(normalizedEntries);

  return useMemo(() => {
    return Object.fromEntries(
      normalizedEntries.map((entry) => [
        entry.key,
        toQueryState(
          snapshot[entry.key] ?? noOpSnapshot,
          runtimeStatus,
          entry.skipped
        )
      ])
    ) as UseQueriesResult<TEntries>;
  }, [normalizedEntries, runtimeStatus, snapshot]);
}

/**
 * Load a paginated Syncore query as a growing reactive list.
 */
export function usePaginatedQuery<TReference extends PaginatedQueryReference>(
  reference: TReference,
  args: PaginatedQueryArgs<TReference> | Skip,
  options: {
    initialNumItems: number;
  }
): UsePaginatedQueryResult<PaginatedQueryItem<TReference>> {
  if (
    typeof options.initialNumItems !== "number" ||
    options.initialNumItems <= 0
  ) {
    throw new Error(
      `options.initialNumItems must be a positive number. Received ${String(
        options.initialNumItems
      )}.`
    );
  }

  const runtimeStatus = useSyncoreStatus();
  const isSkipped = args === skip;
  const normalizedArgs = isSkipped ? {} : (args ?? {});
  const requestKey = stableStringify({
    referenceName: reference.name,
    args: normalizedArgs,
    initialNumItems: options.initialNumItems,
    skipped: isSkipped
  });
  const createInitialState = useMemo(
    () => () =>
      ({
        requestKey,
        nextPageKey: 1,
        pages: isSkipped
          ? []
          : [
              {
                key: "0",
                cursor: null,
                numItems: options.initialNumItems
              }
            ]
      }) satisfies PaginatedQueryInternalState,
    [isSkipped, options.initialNumItems, requestKey]
  );
  const [state, setState] = useState<PaginatedQueryInternalState>(
    createInitialState
  );

  let currentState = state;
  if (currentState.requestKey !== requestKey) {
    currentState = createInitialState();
    setState(currentState);
  }

  const pageQueries = useMemo(() => {
    const requests: Record<string, QueryRequestInput> = {};
    for (const page of currentState.pages) {
      requests[page.key] = {
        query: reference,
        args: {
          ...(normalizedArgs as Record<string, unknown>),
          paginationOpts: {
            cursor: page.cursor,
            numItems: page.numItems
          }
        }
      };
    }
    return requests;
  }, [currentState.pages, normalizedArgs, reference]);
  const pageStates = useQueries(pageQueries);

  const derived = useMemo(() => {
    const pages: Array<PaginationResult<PaginatedQueryItem<TReference>>> = [];
    let error: Error | undefined;

    for (const page of currentState.pages) {
      const pageState =
        pageStates[page.key as keyof typeof pageStates] as
          | SyncoreQueryState<PaginationResult<PaginatedQueryItem<TReference>>>
          | undefined;
      if (!pageState || pageState.status === "loading") {
        break;
      }
      if (pageState.status === "error") {
        error = pageState.error;
        break;
      }
      if (pageState.data) {
        pages.push(pageState.data);
      }
    }

    const results = pages.flatMap((page) => page.page);
    const lastLoadedPage = pages.at(-1);
    const lastRequestedKey = currentState.pages.at(-1)?.key;
    const lastRequestedState = lastRequestedKey
      ? (pageStates[lastRequestedKey as keyof typeof pageStates] as
          | SyncoreQueryState<PaginationResult<PaginatedQueryItem<TReference>>>
          | undefined)
      : undefined;
    const isLoading = !isSkipped && pages.length === 0 && !error;
    const isLoadingMore =
      currentState.pages.length > pages.length ||
      (!!lastRequestedState && lastRequestedState.status === "loading" && pages.length > 0);
    const hasMore = !!lastLoadedPage && !lastLoadedPage.isDone;
    const status: SyncorePaginatedQueryStatus = error
      ? "error"
      : isSkipped
        ? "ready"
        : isLoading
          ? "loading"
          : isLoadingMore
            ? "loadingMore"
            : hasMore
              ? "ready"
              : "exhausted";

    return {
      pages,
      results,
      error,
      isLoading,
      isLoadingMore,
      hasMore,
      cursor: lastLoadedPage?.cursor ?? null,
      status
    };
  }, [currentState.pages, isSkipped, pageStates]);

  return {
    ...derived,
    runtimeStatus,
    loadMore(numItems = options.initialNumItems) {
      if (
        isSkipped ||
        derived.error ||
        derived.isLoadingMore ||
        !derived.hasMore ||
        !derived.cursor
      ) {
        return;
      }

      setState((previous) => ({
        ...previous,
        nextPageKey: previous.nextPageKey + 1,
        pages: [
          ...previous.pages,
          {
            key: String(previous.nextPageKey),
            cursor: derived.cursor,
            numItems
          }
        ]
      }));
    }
  };
}

const noOpSnapshot: QuerySnapshot<never> = {
  data: undefined,
  error: undefined
};

const noOpWatch: ManagedSyncoreWatch<never> = {
  onUpdate: () => () => undefined,
  localQueryResult: () => undefined,
  localQueryError: () => undefined
};

function useManagedQueryWatch<TArgs, TResult>(
  client: SyncoreClient,
  reference: FunctionReference<"query", TArgs, TResult>,
  args?: TArgs,
  isSkipped = false
): ManagedSyncoreWatch<TResult> {
  const argsKey = isSkipped ? skip : stableStringify(args ?? {});
  const normalizedArgs = useMemo(
    () => (isSkipped ? undefined : (JSON.parse(argsKey) as TArgs)),
    [argsKey, isSkipped]
  );
  const watch = useMemo<ManagedSyncoreWatch<TResult>>(
    () =>
      isSkipped
        ? noOpWatch
        : (client.watchQuery(
            reference,
            normalizedArgs as TArgs
          ) as ManagedSyncoreWatch<TResult>),
    [client, isSkipped, normalizedArgs, reference]
  );

  useEffect(
    () => () => {
      if (!isSkipped) {
        watch.dispose?.();
      }
    },
    [isSkipped, watch]
  );

  return watch;
}

function normalizeOptionalArgs<TArgs>(
  args: [] | [TArgs] | readonly unknown[]
): TArgs {
  return (args[0] ?? {}) as TArgs;
}

function readWatchSnapshot<TResult>(
  watch: SyncoreWatch<TResult>
): QuerySnapshot<TResult> {
  return {
    data: watch.localQueryResult(),
    error: watch.localQueryError()
  };
}

function readQueriesSnapshot(
  records: Array<{
    key: string;
    snapshot: QuerySnapshot<unknown>;
  }>
): Record<string, QuerySnapshot<unknown>> {
  return Object.fromEntries(
    records.map((entry) => [entry.key, entry.snapshot])
  );
}

function readRuntimeStatusSnapshot(
  watch: SyncoreWatch<SyncoreRuntimeStatus>
): SyncoreRuntimeStatus {
  return watch.localQueryResult() ?? defaultRuntimeStatus;
}

function toQueryState<TResult>(
  snapshot: QuerySnapshot<TResult>,
  runtimeStatus: SyncoreRuntimeStatus,
  isSkipped: boolean
): SyncoreQueryState<TResult> {
  if (isSkipped) {
    return {
      data: undefined,
      error: undefined,
      status: "skipped",
      runtimeStatus,
      isLoading: false,
      isError: false,
      isReady: false
    };
  }

  const status =
    snapshot.error !== undefined
      ? "error"
      : snapshot.data === undefined
        ? "loading"
        : "success";

  return {
    data: snapshot.data,
    error: snapshot.error,
    status,
    runtimeStatus,
    isLoading: status === "loading",
    isError: status === "error",
    isReady: status === "success"
  };
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

class ReactQueriesObserver {
  readonly client: SyncoreClient;
  private readonly listeners = new Set<() => void>();
  private readonly records = new Map<string, QueryObserverRecord>();

  constructor(client: SyncoreClient) {
    this.client = client;
  }

  replaceClient(client: SyncoreClient): void {
    this.destroy();
    (this as { client: SyncoreClient }).client = client;
  }

  setEntries(entries: NormalizedQueryEntry[]): void {
    const activeKeys = new Set(entries.map((entry) => entry.key));

    for (const entry of entries) {
      const requestKey = `${entry.referenceName}:${stableStringify(entry.args)}:${String(
        entry.skipped
      )}`;
      const current = this.records.get(entry.key);
      if (current?.requestKey === requestKey) {
        continue;
      }

      current?.unsubscribe();
      current?.watch?.dispose?.();

      if (entry.skipped) {
        this.records.set(entry.key, {
          requestKey,
          snapshot: noOpSnapshot,
          unsubscribe: () => undefined
        });
        continue;
      }

      const watch = this.client.watchQuery(
        { kind: "query", name: entry.referenceName },
        entry.args
      ) as ManagedSyncoreWatch<unknown>;
      const record: QueryObserverRecord = {
        requestKey,
        snapshot: readWatchSnapshot(watch),
        unsubscribe: () => undefined,
        watch
      };
      record.unsubscribe = watch.onUpdate(() => {
        record.snapshot = readWatchSnapshot(watch);
        this.notify();
      });
      this.records.set(entry.key, record);
    }

    for (const [key, record] of this.records.entries()) {
      if (activeKeys.has(key)) {
        continue;
      }
      record.unsubscribe();
      record.watch?.dispose?.();
      this.records.delete(key);
    }
  }

  getSnapshot(entries: NormalizedQueryEntry[]): Record<string, QuerySnapshot<unknown>> {
    return readQueriesSnapshot(
      entries.map((entry) => ({
        key: entry.key,
        snapshot: this.records.get(entry.key)?.snapshot ?? noOpSnapshot
      }))
    );
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    for (const record of this.records.values()) {
      record.unsubscribe();
      record.watch?.dispose?.();
    }
    this.records.clear();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
