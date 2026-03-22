import {
  derived,
  type Readable,
  readable,
  type StartStopNotifier
} from "svelte/store";
import { getContext, setContext } from "svelte";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionResult,
  PaginationOptions,
  PaginationResult,
  SyncoreClient,
  SyncoreQueryState,
  SyncoreRuntimeStatus,
  SyncoreWatch,
  UsePaginatedQueryResult
} from "@syncore/core";

export type OptionalArgsTuple<TArgs> =
  Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];

type ManagedSyncoreWatch<TResult> = SyncoreWatch<TResult> & {
  dispose?: () => void;
};

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

export type CreateQueriesStoreResult<TEntries extends QueriesRequestInput> = {
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

type PaginatedQueryInternalState = {
  nextPageKey: number;
  pages: Array<{
    key: string;
    cursor: string | null;
    numItems: number;
  }>;
};

/**
 * The reactive query state shape exposed by Syncore's Svelte stores.
 */
export interface SyncoreQueryStoreState<TResult>
  extends SyncoreQueryState<TResult> {}

export const skip = "skip" as const;
type Skip = typeof skip;

const defaultRuntimeStatus: SyncoreRuntimeStatus = {
  kind: "starting",
  reason: "booting"
};

const SYNCORE_CLIENT_CONTEXT = Symbol("syncore.client");

/**
 * Stores a Syncore client in Svelte component context and returns it.
 */
export function setSyncoreClient(client: SyncoreClient): SyncoreClient {
  setContext(SYNCORE_CLIENT_CONTEXT, client);
  return client;
}

/**
 * Reads the Syncore client previously stored in Svelte component context.
 */
export function getSyncoreClient(): SyncoreClient {
  const client = getContext<SyncoreClient | undefined>(SYNCORE_CLIENT_CONTEXT);
  if (!client) {
    throw new Error(
      "Syncore client is missing from the Svelte component context."
    );
  }
  return client;
}

export function createSyncoreStatusStore(): Readable<SyncoreRuntimeStatus> {
  return createClientSyncoreStatusStore(getSyncoreClient());
}

export function createClientSyncoreStatusStore(
  client: SyncoreClient
): Readable<SyncoreRuntimeStatus> {
  return readable<SyncoreRuntimeStatus>(
    defaultRuntimeStatus,
    createStatusStoreStart(client)
  );
}

/**
 * Creates a reactive store for a Syncore query result using the contextual client.
 */
export function createQueryValueStore<
  TReference extends FunctionReference<"query">
>(
  reference: TReference,
  ...args: OptionalArgsTuple<FunctionArgs<TReference>> | [Skip]
): Readable<FunctionResult<TReference> | undefined> {
  return createClientQueryValueStore(getSyncoreClient(), reference, ...args);
}

/**
 * Creates a reactive store for a Syncore query result using an explicit client.
 */
export function createClientQueryValueStore<
  TReference extends FunctionReference<"query">
>(
  client: SyncoreClient,
  reference: TReference,
  ...args: OptionalArgsTuple<FunctionArgs<TReference>> | [Skip]
): Readable<FunctionResult<TReference> | undefined> {
  return derived(
    createClientQueryStore(client, reference, ...(args as OptionalArgsTuple<
      FunctionArgs<TReference>
    > | [Skip])),
    ($state) => $state.data
  );
}

/**
 * Creates a reactive store with the full Syncore query state.
 */
export function createQueryStore<TReference extends FunctionReference<"query">>(
  reference: TReference,
  ...args: OptionalArgsTuple<FunctionArgs<TReference>> | [Skip]
): Readable<SyncoreQueryStoreState<FunctionResult<TReference>>> {
  return createClientQueryStore(getSyncoreClient(), reference, ...args);
}

/**
 * Creates a reactive store with the full Syncore query state for an explicit client.
 */
export function createClientQueryStore<
  TReference extends FunctionReference<"query">
>(
  client: SyncoreClient,
  reference: TReference,
  ...args: OptionalArgsTuple<FunctionArgs<TReference>> | [Skip]
): Readable<SyncoreQueryStoreState<FunctionResult<TReference>>> {
  const isSkipped = args[0] === skip;
  const normalizedArgs = isSkipped
    ? undefined
    : normalizeOptionalArgs(args as OptionalArgsTuple<FunctionArgs<TReference>>);
  return readable<SyncoreQueryStoreState<FunctionResult<TReference>>>(
    toQueryState<FunctionResult<TReference>>(
      {
        data: undefined,
        error: undefined
      },
      defaultRuntimeStatus,
      isSkipped
    ),
    createQueryStoreStart(client, reference, normalizedArgs, isSkipped)
  );
}

export function createQueriesStore<TEntries extends QueriesRequestInput>(
  entries: TEntries
): Readable<CreateQueriesStoreResult<TEntries>> {
  return createClientQueriesStore(getSyncoreClient(), entries);
}

export function createClientQueriesStore<TEntries extends QueriesRequestInput>(
  client: SyncoreClient,
  entries: TEntries
): Readable<CreateQueriesStoreResult<TEntries>> {
  const normalizedEntries = Object.entries(entries)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => ({
      key,
      query: entry.query,
      skipped: entry.args === skip,
      args:
        entry.args === skip
          ? {}
          : normalizeOptionalArgs([entry.args ?? {}] as [] | [unknown])
    }));

  return readable<CreateQueriesStoreResult<TEntries>>(
    {} as CreateQueriesStoreResult<TEntries>,
    (set) => {
      const runtimeWatch = client.watchRuntimeStatus();
      const watches = normalizedEntries.map((entry) => ({
        key: entry.key,
        skipped: entry.skipped,
        watch: entry.skipped
          ? (noOpWatch as ManagedSyncoreWatch<unknown>)
          : (client.watchQuery(entry.query, entry.args) as ManagedSyncoreWatch<
              unknown
            >)
      }));
      const publish = () => {
        const runtimeStatus = readRuntimeStatus(runtimeWatch);
        set(
          Object.fromEntries(
            watches.map((entry) => [
              entry.key,
              toQueryState(
                entry.skipped
                  ? {
                      data: undefined,
                      error: undefined
                    }
                  : readWatchSnapshot(entry.watch),
                runtimeStatus,
                entry.skipped
              )
            ])
          ) as CreateQueriesStoreResult<TEntries>
        );
      };

      publish();
      const cleanups = [
        runtimeWatch.onUpdate(publish),
        ...watches.map((entry) => entry.watch.onUpdate(publish))
      ];

      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
        runtimeWatch.dispose?.();
        for (const entry of watches) {
          if (!entry.skipped) {
            entry.watch.dispose?.();
          }
        }
      };
    }
  );
}

export function createPaginatedQueryStore<
  TReference extends PaginatedQueryReference
>(
  reference: TReference,
  args: PaginatedQueryArgs<TReference> | Skip,
  options: {
    initialNumItems: number;
  }
): Readable<UsePaginatedQueryResult<PaginatedQueryItem<TReference>>> {
  return createClientPaginatedQueryStore(
    getSyncoreClient(),
    reference,
    args,
    options
  );
}

export function createClientPaginatedQueryStore<
  TReference extends PaginatedQueryReference
>(
  client: SyncoreClient,
  reference: TReference,
  args: PaginatedQueryArgs<TReference> | Skip,
  options: {
    initialNumItems: number;
  }
): Readable<UsePaginatedQueryResult<PaginatedQueryItem<TReference>>> {
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

  const isSkipped = args === skip;
  const baseArgs = isSkipped ? {} : (args ?? {});

  return readable<UsePaginatedQueryResult<PaginatedQueryItem<TReference>>>(
    createEmptyPaginatedResult(defaultRuntimeStatus),
    (set) => {
      const runtimeWatch = client.watchRuntimeStatus();
      let state: PaginatedQueryInternalState = {
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
      };
      const pageEntries = new Map<
        string,
        {
          cursor: string | null;
          numItems: number;
          watch: ManagedSyncoreWatch<PaginationResult<PaginatedQueryItem<TReference>>>;
          unsubscribe: () => void;
        }
      >();

      const disposePage = (key: string) => {
        const entry = pageEntries.get(key);
        if (!entry) {
          return;
        }
        entry.unsubscribe();
        entry.watch.dispose?.();
        pageEntries.delete(key);
      };

      const ensurePages = () => {
        const activeKeys = new Set(state.pages.map((page) => page.key));
        for (const page of state.pages) {
          if (pageEntries.has(page.key)) {
            continue;
          }
          const watch = client.watchQuery(reference, {
            ...(baseArgs as Record<string, unknown>),
            paginationOpts: {
              cursor: page.cursor,
              numItems: page.numItems
            }
          }) as ManagedSyncoreWatch<PaginationResult<PaginatedQueryItem<TReference>>>;
          const unsubscribe = watch.onUpdate(publish);
          pageEntries.set(page.key, {
            cursor: page.cursor,
            numItems: page.numItems,
            watch,
            unsubscribe
          });
        }
        for (const key of [...pageEntries.keys()]) {
          if (!activeKeys.has(key)) {
            disposePage(key);
          }
        }
      };

      const deriveResult = (
        runtimeStatus: SyncoreRuntimeStatus
      ): UsePaginatedQueryResult<PaginatedQueryItem<TReference>> => {
        if (isSkipped) {
          return createEmptyPaginatedResult(runtimeStatus);
        }

        const pages: Array<PaginationResult<PaginatedQueryItem<TReference>>> = [];
        let error: Error | undefined;

        for (const page of state.pages) {
          const entry = pageEntries.get(page.key);
          if (!entry) {
            break;
          }
          const pageError = entry.watch.localQueryError();
          if (pageError) {
            error = pageError;
            break;
          }
          const value = entry.watch.localQueryResult();
          if (!value) {
            break;
          }
          pages.push(value);
        }

        const results = pages.flatMap((page) => page.page);
        const lastLoadedPage = pages.at(-1);
        const lastRequestedPage = state.pages.at(-1);
        const lastRequestedEntry = lastRequestedPage
          ? pageEntries.get(lastRequestedPage.key)
          : undefined;
        const lastRequestedResult = lastRequestedEntry?.watch.localQueryResult();
        const isLoading = pages.length === 0 && !error;
        const isLoadingMore =
          state.pages.length > pages.length ||
          (!!lastRequestedEntry && !lastRequestedResult && pages.length > 0);
        const hasMore = !!lastLoadedPage && !lastLoadedPage.isDone;
        const status = error
          ? "error"
          : isLoading
            ? "loading"
            : isLoadingMore
              ? "loadingMore"
              : hasMore
                ? "ready"
                : "exhausted";

        return {
          results,
          pages,
          status,
          error,
          isLoading,
          isLoadingMore,
          hasMore,
          cursor: lastLoadedPage?.cursor ?? null,
          runtimeStatus,
          loadMore(numItems = options.initialNumItems) {
            if (
              error ||
              isLoadingMore ||
              !hasMore ||
              !lastLoadedPage?.cursor
            ) {
              return;
            }
            state = {
              nextPageKey: state.nextPageKey + 1,
              pages: [
                ...state.pages,
                {
                  key: String(state.nextPageKey),
                  cursor: lastLoadedPage.cursor,
                  numItems
                }
              ]
            };
            ensurePages();
            publish();
          }
        };
      };

      function publish() {
        set(deriveResult(readRuntimeStatus(runtimeWatch)));
      }

      ensurePages();
      publish();
      const detachRuntime = runtimeWatch.onUpdate(publish);

      return () => {
        detachRuntime();
        runtimeWatch.dispose?.();
        for (const key of [...pageEntries.keys()]) {
          disposePage(key);
        }
      };
    }
  );
}

/**
 * Creates a callable wrapper for a Syncore mutation using the contextual client.
 */
export function createMutation<
  TReference extends FunctionReference<"mutation">
>(
  reference: TReference
): (
  ...args: OptionalArgsTuple<FunctionArgs<TReference>>
) => Promise<FunctionResult<TReference>> {
  const client = getSyncoreClient();
  return (...args) =>
    client.mutation(reference, normalizeOptionalArgs(args)) as Promise<
      FunctionResult<TReference>
    >;
}

/**
 * Creates a callable wrapper for a Syncore action using the contextual client.
 */
export function createAction<TReference extends FunctionReference<"action">>(
  reference: TReference
): (
  ...args: OptionalArgsTuple<FunctionArgs<TReference>>
) => Promise<FunctionResult<TReference>> {
  const client = getSyncoreClient();
  return (...args) =>
    client.action(reference, normalizeOptionalArgs(args)) as Promise<
      FunctionResult<TReference>
    >;
}

function createStatusStoreStart(
  client: SyncoreClient
): StartStopNotifier<SyncoreRuntimeStatus> {
  return (set) => {
    const watch = client.watchRuntimeStatus();
    const sync = () => {
      set(readRuntimeStatus(watch));
    };
    sync();
    const unsubscribe = watch.onUpdate(sync);
    return () => {
      unsubscribe();
      watch.dispose?.();
    };
  };
}

function createQueryStoreStart<TReference extends FunctionReference<"query">>(
  client: SyncoreClient,
  reference: TReference,
  args: FunctionArgs<TReference> | undefined,
  isSkipped: boolean
): StartStopNotifier<SyncoreQueryStoreState<FunctionResult<TReference>>> {
  return (
    set: (value: SyncoreQueryStoreState<FunctionResult<TReference>>) => void
  ) => {
    const runtimeWatch = client.watchRuntimeStatus();
    const watch = isSkipped
      ? (noOpWatch as ManagedSyncoreWatch<FunctionResult<TReference>>)
      : (client.watchQuery(reference, args ?? {}) as ManagedSyncoreWatch<
          FunctionResult<TReference>
        >);
    const sync = () => {
      set(
        toQueryState(
          isSkipped
            ? {
                data: undefined,
                error: undefined
              }
            : readWatchSnapshot(watch),
          readRuntimeStatus(runtimeWatch),
          isSkipped
        )
      );
    };
    sync();
    const unsubscribeWatch = watch.onUpdate(sync);
    const unsubscribeRuntime = runtimeWatch.onUpdate(sync);
    return () => {
      unsubscribeWatch();
      unsubscribeRuntime();
      runtimeWatch.dispose?.();
      if (!isSkipped) {
        watch.dispose?.();
      }
    };
  };
}

function normalizeOptionalArgs<TArgs>(
  args: [] | [TArgs] | readonly unknown[]
): TArgs {
  return (args[0] ?? {}) as TArgs;
}

function readWatchSnapshot<TResult>(watch: SyncoreWatch<TResult>): {
  data: TResult | undefined;
  error: Error | undefined;
} {
  return {
    data: watch.localQueryResult(),
    error: watch.localQueryError()
  };
}

function readRuntimeStatus(
  watch: SyncoreWatch<SyncoreRuntimeStatus>
): SyncoreRuntimeStatus {
  return watch.localQueryResult() ?? defaultRuntimeStatus;
}

function toQueryState<TResult>(
  snapshot: {
    data: TResult | undefined;
    error: Error | undefined;
  },
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

function createEmptyPaginatedResult<TItem>(
  runtimeStatus: SyncoreRuntimeStatus
): UsePaginatedQueryResult<TItem> {
  return {
    results: [],
    pages: [],
    status: "ready",
    error: undefined,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    cursor: null,
    runtimeStatus,
    loadMore() {
      return;
    }
  };
}

const noOpWatch: ManagedSyncoreWatch<never> = {
  onUpdate: () => () => undefined,
  localQueryResult: () => undefined,
  localQueryError: () => undefined
};
