import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createFunctionReference,
  type FunctionReference,
  type SyncoreClient,
  type SyncoreWatch
} from "syncore";
import { SyncoreProvider, useAction, useMutation, useQuery } from "./index.js";

describe("@syncore/react", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rerenders query consumers when a watch updates", async () => {
    const watch = createTestWatch<Array<{ title: string }>>();
    const client = createTestClient(watch);
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

    expect(screen.getByText("empty").textContent).toBe("empty");

    await act(async () => {
      watch.setResult([{ title: "Offline task" }]);
    });

    expect(screen.getByText("Offline task").textContent).toBe("Offline task");

    view.unmount();

    expect(watch.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes the previous watch when the query reference changes", async () => {
    const firstWatch = createTestWatch<Array<{ title: string }>>();
    const secondWatch = createTestWatch<Array<{ title: string }>>();
    const queuedWatches = [firstWatch, secondWatch];
    const client = {
      query: vi.fn(),
      mutation: vi.fn(),
      action: vi.fn(),
      watchQuery: (() => {
        const nextWatch = queuedWatches.shift();
        if (!nextWatch) {
          throw new Error("Expected a queued watch for the test client.");
        }
        return nextWatch;
      }) as SyncoreClient["watchQuery"]
    } satisfies SyncoreClient;
    const firstReference = createFunctionReference<
      "query",
      Record<never, never>,
      Array<{ title: string }>
    >("query", "todos/list");
    const secondReference = createFunctionReference<
      "query",
      Record<never, never>,
      Array<{ title: string }>
    >("query", "todos/listArchived");

    const view = render(
      <SyncoreProvider client={client}>
        <TodosProbe reference={firstReference} />
      </SyncoreProvider>
    );

    view.rerender(
      <SyncoreProvider client={client}>
        <TodosProbe reference={secondReference} />
      </SyncoreProvider>
    );

    view.unmount();

    expect(firstWatch.dispose).toHaveBeenCalledTimes(1);
    expect(secondWatch.dispose).toHaveBeenCalledTimes(1);
  });
});

function useHookInference() {
  const queryReference = createFunctionReference<
    "query",
    Record<never, never>,
    Array<{ title: string }>
  >("query", "todos/list");
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
  const createTodo = useMutation(mutationReference);
  const measureTodo = useAction(actionReference);

  expectTypeOf(todos).toEqualTypeOf<Array<{ title: string }> | undefined>();
  expectTypeOf(createTodo).parameters.toEqualTypeOf<[args: { title: string }]>();
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

function createTestClient<TResult>(
  watch: TestWatch<TResult>
): SyncoreClient {
  const watchQuery = vi.fn(
    () => watch as unknown as SyncoreWatch<unknown>
  ) as SyncoreClient["watchQuery"];

  return {
    query: vi.fn(),
    mutation: vi.fn(),
    action: vi.fn(),
    watchQuery
  };
}

type TestWatch<TResult> = SyncoreWatch<TResult> & {
  setResult(value: TResult): void;
  setError(error: Error): void;
  dispose: ReturnType<typeof vi.fn>;
};

function createTestWatch<TResult>(): TestWatch<TResult> {
  const listeners = new Set<() => void>();
  let result: TResult | undefined;
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
