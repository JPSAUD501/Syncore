import "fake-indexeddb/auto";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFunctionReference,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx
} from "@syncore/core";
import { defineSchema, defineTable, v } from "@syncore/schema";
import { createWebSyncoreRuntime } from "./index.js";
import {
  attachWebWorkerRuntime,
  createWebWorkerClient,
  type SyncoreWorkerMessageEndpoint
} from "./worker.js";

const wasmFilePath = fileURLToPath(
  new URL("../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url)
);

describe("platform-web worker bridge", () => {
  beforeEach(async () => {
    await deleteDatabase("syncore-worker-test");
  });

  afterEach(async () => {
    await deleteDatabase("syncore-worker-test");
  });

  it("proxies reactivity through the worker endpoint", async () => {
    const schema = defineSchema({
      todos: defineTable({
        title: v.string(),
        done: v.boolean()
      })
    });

    const functions = {
      "todos/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("todos").collect()
      }),
      "todos/create": mutation({
        args: { title: v.string() },
        returns: v.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("todos", {
            title: (args as { title: string }).title,
            done: false
          })
      })
    };

    const [clientEndpoint, workerEndpoint] = createEndpointPair();
    const attachedRuntime = attachWebWorkerRuntime({
      endpoint: workerEndpoint,
      createRuntime: () =>
        createWebSyncoreRuntime({
          databaseName: "worker-db",
          persistenceDatabaseName: "syncore-worker-test",
          schema,
          functions,
          locateFile: () => wasmFilePath
        })
    });

    const client = createWebWorkerClient(clientEndpoint);
    await attachedRuntime.ready;

    const watch = client.watchQuery(
      createFunctionReference<
        "query",
        Record<never, never>,
        Array<{ title: string }>
      >("query", "todos/list")
    );

    await waitFor(
      () => Array.isArray(watch.localQueryResult()),
      "watch subscription should emit an initial result"
    );

    await client.mutation(
      createFunctionReference<"mutation", { title: string }, string>(
        "mutation",
        "todos/create"
      ),
      { title: "From worker" }
    );

    await waitFor(
      () => watch.localQueryResult()?.[0]?.title === "From worker",
      "watch subscription should update after a mutation"
    );

    watch.dispose();
    client.dispose();
    await attachedRuntime.dispose();
  });

  it("propagates query failures across the worker boundary", async () => {
    const schema = defineSchema({
      todos: defineTable({
        title: v.string(),
        done: v.boolean()
      })
    });

    const functions = {
      "todos/fail": query({
        args: {},
        handler: async () => {
          throw new Error("Worker query failed");
        }
      })
    };

    const [clientEndpoint, workerEndpoint] = createEndpointPair();
    const attachedRuntime = attachWebWorkerRuntime({
      endpoint: workerEndpoint,
      createRuntime: () =>
        createWebSyncoreRuntime({
          databaseName: "worker-error-db",
          persistenceDatabaseName: "syncore-worker-error-test",
          schema,
          functions,
          locateFile: () => wasmFilePath
        })
    });

    const client = createWebWorkerClient(clientEndpoint);
    await attachedRuntime.ready;

    const failingQuery = createFunctionReference<
      "query",
      Record<never, never>,
      Array<{ title: string }>
    >("query", "todos/fail");

    await expect(client.query(failingQuery)).rejects.toThrow(
      "Worker query failed"
    );

    const watch = client.watchQuery(failingQuery);
    await waitFor(
      () => watch.localQueryError()?.message === "Worker query failed",
      "watch subscription should surface worker query failures"
    );

    watch.dispose();
    client.dispose();
    await attachedRuntime.dispose();
  });
});

function createEndpointPair(): [
  SyncoreWorkerMessageEndpoint,
  SyncoreWorkerMessageEndpoint
] {
  const leftListeners = new Set<(event: MessageEvent<unknown>) => void>();
  const rightListeners = new Set<(event: MessageEvent<unknown>) => void>();

  const createEndpoint = (
    ownListeners: Set<(event: MessageEvent<unknown>) => void>,
    targetListeners: Set<(event: MessageEvent<unknown>) => void>
  ): SyncoreWorkerMessageEndpoint => ({
    postMessage(message) {
      queueMicrotask(() => {
        const event = { data: message } as MessageEvent<unknown>;
        for (const listener of targetListeners) {
          listener(event);
        }
      });
    },
    addEventListener(_type, listener) {
      ownListeners.add(listener);
    },
    removeEventListener(_type, listener) {
      ownListeners.delete(listener);
    }
  });

  return [
    createEndpoint(leftListeners, rightListeners),
    createEndpoint(rightListeners, leftListeners)
  ];
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        request.error ??
          new Error(`Failed to delete IndexedDB database "${name}".`)
      );
    request.onblocked = () => resolve();
  });
}

async function waitFor(
  predicate: () => boolean,
  message: string
): Promise<void> {
  const deadline = Date.now() + 1500;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(message);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
