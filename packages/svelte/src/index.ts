import { type Readable, type StartStopNotifier, readable } from "svelte/store";
import { getContext, setContext } from "svelte";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionResult,
  SyncoreClient,
  SyncoreWatch
} from "@syncore/core";

export type OptionalArgsTuple<TArgs> =
  Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];

/**
 * The observable state exposed by a Syncore-backed Svelte query store.
 */
export interface SyncoreQueryStoreState<TResult> {
  /** The latest local result for the watched query. */
  data: TResult | undefined;

  /** The latest local error for the watched query, if any. */
  error: Error | undefined;

  /** The current watch lifecycle status. */
  status: "loading" | "ready" | "error";
}

const SYNCORE_CLIENT_CONTEXT = Symbol("syncore.client");

/**
 * Store a Syncore client in the current Svelte component context.
 */
export function setSyncoreClient(client: SyncoreClient): SyncoreClient {
  setContext(SYNCORE_CLIENT_CONTEXT, client);
  return client;
}

/**
 * Read the active Syncore client from the current Svelte component context.
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

/**
 * Create a readable Svelte store backed by a reactive Syncore query.
 */
export function createQueryStore<TReference extends FunctionReference<"query">>(
  reference: TReference,
  ...args: OptionalArgsTuple<FunctionArgs<TReference>>
): Readable<SyncoreQueryStoreState<FunctionResult<TReference>>> {
  return createClientQueryStore(getSyncoreClient(), reference, ...args);
}

/**
 * Create a readable Svelte store backed by a reactive Syncore query.
 */
export function createClientQueryStore<
  TReference extends FunctionReference<"query">
>(
  client: SyncoreClient,
  reference: TReference,
  ...args: OptionalArgsTuple<FunctionArgs<TReference>>
): Readable<SyncoreQueryStoreState<FunctionResult<TReference>>> {
  const normalizedArgs = normalizeOptionalArgs(args);
  return readable<SyncoreQueryStoreState<FunctionResult<TReference>>>(
    {
      data: undefined,
      error: undefined,
      status: "loading"
    },
    createQueryStoreStart(client, reference, normalizedArgs)
  );
}

/**
 * Create a function that executes a Syncore mutation.
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
 * Create a function that executes a Syncore action.
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

function createQueryStoreStart<TReference extends FunctionReference<"query">>(
  client: SyncoreClient,
  reference: TReference,
  args: FunctionArgs<TReference>
): StartStopNotifier<SyncoreQueryStoreState<FunctionResult<TReference>>> {
  return (
    set: (value: SyncoreQueryStoreState<FunctionResult<TReference>>) => void
  ) => {
    const watch = client.watchQuery(reference, args) as SyncoreWatch<
      FunctionResult<TReference>
    >;
    const sync = () => {
      const error = watch.localQueryError();
      set({
        data: watch.localQueryResult(),
        error,
        status: error ? "error" : "ready"
      });
    };
    sync();
    const unsubscribe = watch.onUpdate(sync);
    return () => {
      unsubscribe();
      watch.dispose?.();
    };
  };
}

function normalizeOptionalArgs<TArgs>(
  args: [] | [TArgs] | readonly unknown[]
): TArgs {
  return (args[0] ?? {}) as TArgs;
}
