import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFunctionReference,
  defineSchema,
  defineTable,
  mutation,
  query,
  v,
  type MutationCtx,
  type QueryCtx
} from "syncore";
import { createNodeSyncoreRuntime } from "./index.js";
import {
  attachNodeIpcRuntime,
  createRendererSyncoreClient,
  createRendererSyncoreWindowClient,
  installSyncoreWindowBridge,
  SyncoreElectronProvider,
  type SyncoreIpcMessageEndpoint
} from "./ipc.js";

describe("Node IPC bridge", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "syncore-node-ipc-"));
  });

  afterEach(() => {
    // Temporary directories are left to the OS cleanup to keep the test simple.
  });

  it("proxies queries, mutations, and reactivity through the main-process runtime", async () => {
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
    });

    const functions = {
      "tasks/list": query({
        args: {},
        handler: async (ctx: QueryCtx<typeof schema>) =>
          ctx.db.query("tasks").collect()
      }),
      "tasks/create": mutation({
        args: { text: v.string() },
        handler: async (
          ctx: MutationCtx<typeof schema>,
          args: { text: string }
        ) =>
          ctx.db.insert("tasks", {
            text: args.text,
            done: false
          })
      })
    };

    const [rendererEndpoint, mainEndpoint] = createEndpointPair();
    const attachedRuntime = attachNodeIpcRuntime({
      endpoint: mainEndpoint,
      createRuntime: () =>
        createNodeSyncoreRuntime({
          databasePath: path.join(rootDir, "syncore.db"),
          storageDirectory: path.join(rootDir, "storage"),
          schema,
          functions,
          platform: "electron-main"
        })
    });

    const rendererClient = createRendererSyncoreClient(rendererEndpoint);
    await attachedRuntime.ready;
    const listTasks = createFunctionReference<
      "query",
      Record<never, never>,
      Array<{ _id: string; text: string; done: boolean }>
    >("query", "tasks/list");
    const createTask = createFunctionReference<
      "mutation",
      { text: string },
      string
    >("mutation", "tasks/create");

    const watch = rendererClient.watchQuery(listTasks);

    await waitFor(
      () => Array.isArray(watch.localQueryResult()),
      "watch subscription should emit an initial result"
    );

    await rendererClient.mutation(createTask, { text: "IPC task" });

    await waitFor(
      () => watch.localQueryResult()?.[0]?.text === "IPC task",
      "watch subscription should update after a mutation"
    );

    const tasks = await rendererClient.query(listTasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.text).toBe("IPC task");

    watch.dispose();
    rendererClient.dispose();
    await attachedRuntime.dispose();
  });

  it("propagates query failures to both direct invocations and reactive watches", async () => {
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
    });

    const functions = {
      "tasks/fail": query({
        args: {},
        handler: async () => {
          throw new Error("IPC query failed");
        }
      })
    };

    const [rendererEndpoint, mainEndpoint] = createEndpointPair();
    const attachedRuntime = attachNodeIpcRuntime({
      endpoint: mainEndpoint,
      createRuntime: () =>
        createNodeSyncoreRuntime({
          databasePath: path.join(rootDir, "syncore-errors.db"),
          storageDirectory: path.join(rootDir, "storage-errors"),
          schema,
          functions,
          platform: "electron-main"
        })
    });

    const rendererClient = createRendererSyncoreClient(rendererEndpoint);
    await attachedRuntime.ready;

    const failingQuery = createFunctionReference<
      "query",
      Record<never, never>,
      Array<{ _id: string; text: string; done: boolean }>
    >("query", "tasks/fail");

    await expect(rendererClient.query(failingQuery)).rejects.toThrow(
      "IPC query failed"
    );

    const watch = rendererClient.watchQuery(failingQuery);
    await waitFor(
      () => watch.localQueryError()?.message === "IPC query failed",
      "watch subscription should surface query failures"
    );

    watch.dispose();
    rendererClient.dispose();
    await attachedRuntime.dispose();
  });

  it("creates a renderer client from window.syncoreBridge", () => {
    const dispose = () => undefined;
    const windowObject = {
      syncoreBridge: {
        postMessage() {},
        onMessage() {
          return dispose;
        }
      }
    } as unknown as Window & typeof globalThis;

    const client = createRendererSyncoreWindowClient(windowObject);
    expect(client).toBeDefined();
    client.dispose();
  });

  it("renders a preload bridge installer snippet", () => {
    expect(installSyncoreWindowBridge()).toContain(
      "contextBridge.exposeInMainWorld"
    );
  });

  it("renders the short-form Electron provider", () => {
    const windowObject = {
      syncoreBridge: {
        postMessage() {},
        onMessage() {
          return () => undefined;
        }
      }
    } as unknown as Window & typeof globalThis;

    const html = renderToStaticMarkup(
      <SyncoreElectronProvider windowObject={windowObject}>
        <div>renderer</div>
      </SyncoreElectronProvider>
    );

    expect(html).toContain("renderer");
  });
});

function createEndpointPair(): [
  SyncoreIpcMessageEndpoint,
  SyncoreIpcMessageEndpoint
] {
  const leftListeners = new Set<(event: MessageEvent<unknown>) => void>();
  const rightListeners = new Set<(event: MessageEvent<unknown>) => void>();

  const createEndpoint = (
    ownListeners: Set<(event: MessageEvent<unknown>) => void>,
    targetListeners: Set<(event: MessageEvent<unknown>) => void>
  ): SyncoreIpcMessageEndpoint => ({
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
