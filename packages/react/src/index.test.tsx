import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createUnavailableSyncoreClient,
  createFunctionReference,
  type FunctionReference,
  type PaginationOptions,
  type PaginationResult,
  type SyncoreClient,
  type SyncoreRuntimeStatus,
  type SyncoreWatch
} from "@syncore/core";
import {
  SyncoreProvider,
  skip,
  useAction,
  useMutation,
  usePaginatedQuery,
  useQueries,
  useQuery,
  useQueryState,
  useSyncoreStatus
} from "./index.js";

describe("@syncore/react", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rerenders query consumers when a watch updates", async () => {
    const queryWatch = createTestWatch<Array<{ title: string }>>();
    const client = createTestClient({
      queryWatches: [queryWatch]
    });
    const reference = createFunctionReference<
      "query",
      Record<never, never>,
      Array<{ title: string }>
    >("query", "todos/list");

    const view = render(
      <SyncoreProvider client={client}>
        <TodosProbe reference={reference} />
      </SyncoreProvider>
    );

    expect(screen.getByText("empty")).toBeDefined();

    await act(async () => {
      queryWatch.setResult([{ title: "Offline task" }]);
    });

    expect(screen.getByText("Offline task")).toBeDefined();

    view.unmount();

    expect(queryWatch.dispose).toHaveBeenCalledTimes(1);
  });

  it("exposes runtime status and query state without throwing", async () => {
    const queryWatch = createTestWatch<Array<{ title: string }>>();
    const statusWatch = createTestWatch<SyncoreRuntimeStatus>({
      kind: "starting",
      reason: "booting"
    });
    const client = createTestClient({
      queryWatches: [queryWatch],
      statusWatch
    });
    const reference = createFunctionReference<
      "query",
      Record<never, never>,
      Array<{ title: string }>
    >("query", "todos/list");

    render(
      <SyncoreProvider client={client}>
        <QueryStateProbe reference={reference} />
      </SyncoreProvider>
    );

    expect(screen.getByTestId("query-status").textContent).toBe("loading");
    expect(screen.getByTestId("runtime-status").textContent).toBe("starting");

    await act(async () => {
      statusWatch.setResult({
        kind: "ready"
      });
      queryWatch.setResult([{ title: "Loaded" }]);
    });

    expect(screen.getByTestId("query-status").textContent).toBe("success");
    expect(screen.getByTestId("runtime-status").textContent).toBe("ready");
    expect(screen.getByTestId("query-value").textContent).toBe("Loaded");
  });

  it("keeps errors scoped per key in useQueries", async () => {
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

    render(
      <SyncoreProvider client={client}>
        <QueriesProbe
          todosReference={todosReference}
          countReference={countReference}
        />
      </SyncoreProvider>
    );

    await act(async () => {
      failingWatch.setError(new Error("Count failed"));
    });

    expect(screen.getByTestId("todos-status").textContent).toBe("success");
    expect(screen.getByTestId("count-status").textContent).toBe("error");
    expect(screen.getByTestId("count-error").textContent).toBe("Count failed");
  });

  it("concatenates paginated query pages and exposes loadMore state", async () => {
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

    render(
      <SyncoreProvider client={client}>
        <PaginatedProbe reference={reference} />
      </SyncoreProvider>
    );

    expect(screen.getByTestId("page-status").textContent).toBe("ready");
    expect(screen.getByTestId("page-results").textContent).toContain(
      "First page"
    );

    await act(async () => {
      screen.getByRole("button", { name: "load more" }).click();
    });

    expect(screen.getByTestId("page-status").textContent).toBe("loadingMore");

    await act(async () => {
      secondPageWatch.setResult({
        page: [{ title: "Second page" }],
        cursor: null,
        isDone: true
      });
    });

    expect(screen.getByTestId("page-status").textContent).toBe("exhausted");
    expect(screen.getByTestId("page-results").textContent).toContain(
      "First page,Second page"
    );
  });

  it("surfaces runtime status directly through useSyncoreStatus", async () => {
    const statusWatch = createTestWatch<SyncoreRuntimeStatus>({
      kind: "starting",
      reason: "booting"
    });
    const client = createTestClient({
      statusWatch
    });

    render(
      <SyncoreProvider client={client}>
        <StatusProbe />
      </SyncoreProvider>
    );

    expect(screen.getByTestId("status-kind").textContent).toBe("starting");

    await act(async () => {
      statusWatch.setResult({
        kind: "unavailable",
        reason: "disposed"
      });
    });

    expect(screen.getByTestId("status-kind").textContent).toBe("unavailable");
    expect(screen.getByTestId("status-reason").textContent).toBe("disposed");
  });

  it("keeps query consumers safe while the client is booting or unavailable", () => {
    const reference = createFunctionReference<
      "query",
      Record<never, never>,
      Array<{ title: string }>
    >("query", "todos/list");
    const bootingClient = createUnavailableSyncoreClient({
      kind: "starting",
      reason: "booting"
    });
    const unavailableClient = createUnavailableSyncoreClient({
      kind: "unavailable",
      reason: "worker-unavailable"
    });

    const view = render(
      <SyncoreProvider client={bootingClient}>
        <BootFailureProbe reference={reference} />
      </SyncoreProvider>
    );

    expect(screen.getByTestId("boot-runtime").textContent).toBe("starting");
    expect(screen.getByTestId("boot-value").textContent).toBe("loading");

    view.rerender(
      <SyncoreProvider client={unavailableClient}>
        <BootFailureProbe reference={reference} />
      </SyncoreProvider>
    );

    expect(screen.getByTestId("boot-runtime").textContent).toBe("unavailable");
    expect(screen.getByTestId("boot-reason").textContent).toBe(
      "worker-unavailable"
    );
    expect(screen.getByTestId("boot-value").textContent).toBe("loading");
  });
});

function useHookInference() {
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
  const mutationReference = createFunctionReference<
    "mutation",
    { title: string },
    string
  >("mutation", "todos/create");
  const actionReference = createFunctionReference<"action", string, number>(
    "action",
    "todos/measure"
  );

  const todos = useQuery(queryReference);
  const queryState = useQueryState(queryReference);
  const queries = useQueries({
    todos: {
      query: queryReference
    },
    count: {
      query: countReference
    },
    optional: {
      query: countReference,
      args: skip
    }
  });
  const paginated = usePaginatedQuery(
    paginatedReference,
    { list: "all" },
    { initialNumItems: 5 }
  );
  const createTodo = useMutation(mutationReference);
  const measureTodo = useAction(actionReference);

  expectTypeOf(todos).toEqualTypeOf<Array<{ title: string }> | undefined>();
  expectTypeOf(queryState.data).toEqualTypeOf<
    Array<{ title: string }> | undefined
  >();
  expectTypeOf(queries.todos.data).toEqualTypeOf<
    Array<{ title: string }> | undefined
  >();
  expectTypeOf(queries.count.data).toEqualTypeOf<number | undefined>();
  expectTypeOf(paginated.results).toEqualTypeOf<Array<{ title: string }>>();
  expectTypeOf(createTodo).parameters.toEqualTypeOf<
    [args: { title: string }]
  >();
  expectTypeOf(createTodo).returns.toEqualTypeOf<Promise<string>>();
  expectTypeOf(measureTodo).parameters.toEqualTypeOf<[args: string]>();
  expectTypeOf(measureTodo).returns.toEqualTypeOf<Promise<number>>();
}

void useHookInference;

function TodosProbe({
  reference
}: {
  reference: FunctionReference<
    "query",
    Record<never, never>,
    Array<{ title: string }>
  >;
}) {
  const todos = useQuery(reference) ?? [];

  if (todos.length === 0) {
    return <div>empty</div>;
  }

  return <div>{todos[0]?.title}</div>;
}

function QueryStateProbe({
  reference
}: {
  reference: FunctionReference<
    "query",
    Record<never, never>,
    Array<{ title: string }>
  >;
}) {
  const state = useQueryState(reference);
  return (
    <div>
      <div data-testid="query-status">{state.status}</div>
      <div data-testid="runtime-status">{state.runtimeStatus.kind}</div>
      <div data-testid="query-value">{state.data?.[0]?.title ?? "none"}</div>
    </div>
  );
}

function QueriesProbe({
  todosReference,
  countReference
}: {
  todosReference: FunctionReference<
    "query",
    Record<never, never>,
    Array<{ title: string }>
  >;
  countReference: FunctionReference<"query", Record<never, never>, number>;
}) {
  const queries = useQueries({
    todos: {
      query: todosReference
    },
    count: {
      query: countReference
    }
  });

  return (
    <div>
      <div data-testid="todos-status">{queries.todos.status}</div>
      <div data-testid="count-status">{queries.count.status}</div>
      <div data-testid="count-error">{queries.count.error?.message ?? ""}</div>
    </div>
  );
}

function PaginatedProbe({
  reference
}: {
  reference: FunctionReference<
    "query",
    { list: string; paginationOpts: PaginationOptions },
    PaginationResult<{ title: string }>
  >;
}) {
  const state = usePaginatedQuery(
    reference,
    { list: "all" },
    { initialNumItems: 1 }
  );

  return (
    <div>
      <div data-testid="page-status">{state.status}</div>
      <div data-testid="page-results">
        {state.results.map((item) => item.title).join(",")}
      </div>
      <button onClick={() => state.loadMore()}>load more</button>
    </div>
  );
}

function StatusProbe() {
  const status = useSyncoreStatus();
  return (
    <div>
      <div data-testid="status-kind">{status.kind}</div>
      <div data-testid="status-reason">{status.reason ?? ""}</div>
    </div>
  );
}

function BootFailureProbe({
  reference
}: {
  reference: FunctionReference<
    "query",
    Record<never, never>,
    Array<{ title: string }>
  >;
}) {
  const status = useSyncoreStatus();
  const todos = useQuery(reference);

  return (
    <div>
      <div data-testid="boot-runtime">{status.kind}</div>
      <div data-testid="boot-reason">{status.reason ?? ""}</div>
      <div data-testid="boot-value">
        {todos === undefined ? "loading" : todos.length}
      </div>
    </div>
  );
}

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
