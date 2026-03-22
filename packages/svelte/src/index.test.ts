import { get, type Readable } from "svelte/store";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createFunctionReference,
  type FunctionReference,
  type PaginationOptions,
  type PaginationResult,
  type SyncoreClient,
  type SyncoreRuntimeStatus,
  type SyncoreWatch
} from "@syncore/core";
import {
  createClientPaginatedQueryStore,
  createClientQueriesStore,
  createClientQueryStore,
  createClientQueryValueStore,
  createClientSyncoreStatusStore,
  skip
} from "./index.js";

describe("@syncore/svelte", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tracks query state in a readable store", async () => {
    const queryWatch = createTestWatch<Array<{ title: string }>>();
    const client = createTestClient({
      queryWatches: [queryWatch]
    });
    const reference = createFunctionReference<
      "query",
      Record<never, never>,
      Array<{ title: string }>
    >("query", "todos/list");
    const store = createClientQueryStore(client, reference);
    const tracked = trackStore(store);

    expect(tracked.current().status).toBe("loading");

    queryWatch.setResult([{ title: "Loaded" }]);
    await waitFor(() => tracked.current().status === "success");

    expect(tracked.current().data?.[0]?.title).toBe("Loaded");
    tracked.dispose();
  });

  it("keeps errors scoped per key in queries stores", async () => {
    const todosWatch = createTestWatch<Array<{ title: string }>>([
      { title: "Inbox" }
    ]);
    const failingWatch = createTestWatch<number>();
    const client = createTestClient({
      queryWatches: [failingWatch, todosWatch]
    });
    const todosReference = createFunctionReference<
      "query",
      Record<never, never>,
      Array<{ title: string }>
    >("query", "todos/list");
    const countReference = createFunctionReference<
      "query",
      Record<never, never>,
      number
    >("query", "todos/count");
    const store = createClientQueriesStore(client, {
      todos: {
        query: todosReference
      },
      count: {
        query: countReference
      },
      skipped: {
        query: countReference,
        args: skip
      }
    });
    const tracked = trackStore(store);

    failingWatch.setError(new Error("Count failed"));
    await waitFor(() => tracked.current().count.status === "error");

    expect(tracked.current().todos.status).toBe("success");
    expect(tracked.current().count.error?.message).toBe("Count failed");
    expect(tracked.current().skipped.status).toBe("skipped");
    tracked.dispose();
  });

  it("supports paginated query stores", async () => {
    const firstPageWatch = createTestWatch<PaginationResult<{ title: string }>>({
      page: [{ title: "First page" }],
      cursor: "cursor-1",
      isDone: false
    });
    const secondPageWatch = createTestWatch<PaginationResult<{ title: string }>>();
    const client = createTestClient({
      queryWatches: [firstPageWatch, secondPageWatch]
    });
    const reference = createFunctionReference<
      "query",
      { list: string; paginationOpts: PaginationOptions },
      PaginationResult<{ title: string }>
    >("query", "todos/paginated");
    const store = createClientPaginatedQueryStore(
      client,
      reference,
      { list: "all" },
      { initialNumItems: 1 }
    );
    const tracked = trackStore(store);

    expect(tracked.current().status).toBe("ready");

    tracked.current().loadMore();
    expect(tracked.current().status).toBe("loadingMore");

    secondPageWatch.setResult({
      page: [{ title: "Second page" }],
      cursor: null,
      isDone: true
    });
    await waitFor(() => tracked.current().status === "exhausted");

    expect(tracked.current().results.map((item) => item.title)).toEqual([
      "First page",
      "Second page"
    ]);
    tracked.dispose();
  });

  it("exposes runtime status through a store", async () => {
    const statusWatch = createTestWatch<SyncoreRuntimeStatus>({
      kind: "starting",
      reason: "booting"
    });
    const client = createTestClient({
      statusWatch
    });
    const store = createClientSyncoreStatusStore(client);
    const tracked = trackStore(store);

    expect(tracked.current().kind).toBe("starting");

    statusWatch.setResult({
      kind: "unavailable",
      reason: "disposed"
    });
    await waitFor(() => tracked.current().kind === "unavailable");

    expect(tracked.current().reason).toBe("disposed");
    tracked.dispose();
  });
});

function useStoreInference() {
  const queryReference = createFunctionReference<
    "query",
    Record<never, never>,
    Array<{ title: string }>
  >("query", "todos/list");
  const countReference = createFunctionReference<
    "query",
    Record<never, never>,
    number
  >("query", "todos/count");
  const paginatedReference = createFunctionReference<
    "query",
    { list: string; paginationOpts: PaginationOptions },
    PaginationResult<{ title: string }>
  >("query", "todos/paginated");
  const client = createTestClient();

  const valueStore = createClientQueryValueStore(client, queryReference);
  const stateStore = createClientQueryStore(client, queryReference);
  const queriesStore = createClientQueriesStore(client, {
    todos: {
      query: queryReference
    },
    count: {
      query: countReference
    }
  });
  const paginatedStore = createClientPaginatedQueryStore(
    client,
    paginatedReference,
    { list: "all" },
    { initialNumItems: 5 }
  );

  expectTypeOf(get(valueStore)).toEqualTypeOf<
    Array<{ title: string }> | undefined
  >();
  expectTypeOf(get(stateStore).data).toEqualTypeOf<
    Array<{ title: string }> | undefined
  >();
  expectTypeOf(get(queriesStore).count.data).toEqualTypeOf<number | undefined>();
  expectTypeOf(get(paginatedStore).results).toEqualTypeOf<
    Array<{ title: string }>
  >();
}

void useStoreInference;

function createTestClient(options?: {
  queryWatches?: Array<TestWatch<unknown>>;
  statusWatch?: TestWatch<SyncoreRuntimeStatus>;
}): SyncoreClient {
  const queryWatches = [...(options?.queryWatches ?? [])];
  const statusWatch =
    options?.statusWatch ??
    createTestWatch<SyncoreRuntimeStatus>({
      kind: "ready"
    });
  const watchQuery = vi.fn(
    () => {
      const nextWatch = queryWatches.shift() ?? createTestWatch();
      return nextWatch as unknown as SyncoreWatch<unknown>;
    }
  ) as SyncoreClient["watchQuery"];

  return {
    query: vi.fn(),
    mutation: vi.fn(),
    action: vi.fn(),
    watchQuery,
    watchRuntimeStatus: vi.fn(
      () => statusWatch as unknown as SyncoreWatch<SyncoreRuntimeStatus>
    ) as SyncoreClient["watchRuntimeStatus"]
  };
}

type TestWatch<TResult> = SyncoreWatch<TResult> & {
  setResult(value: TResult): void;
  setError(error: Error): void;
  dispose: ReturnType<typeof vi.fn>;
};

function createTestWatch<TResult>(initialValue?: TResult): TestWatch<TResult> {
  const listeners = new Set<() => void>();
  let result: TResult | undefined = initialValue;
  let error: Error | undefined;

  return {
    onUpdate(callback) {
      listeners.add(callback);
      queueMicrotask(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    localQueryResult() {
      return result;
    },
    localQueryError() {
      return error;
    },
    setResult(value) {
      result = value;
      error = undefined;
      for (const listener of listeners) {
        listener();
      }
    },
    setError(nextError) {
      error = nextError;
      for (const listener of listeners) {
        listener();
      }
    },
    dispose: vi.fn()
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1500;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out while waiting for store update.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function trackStore<T>(store: Readable<T>) {
  let value!: T;
  const unsubscribe = store.subscribe((nextValue) => {
    value = nextValue;
  });
  return {
    current: () => value,
    dispose: unsubscribe
  };
}
