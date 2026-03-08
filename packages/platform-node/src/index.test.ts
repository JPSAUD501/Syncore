import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
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
import {
  bindElectronWindowToSyncoreRuntime,
  createManagedNodeSyncoreClient,
  createNodeSyncoreRuntime
} from "./index.js";

describe("Node Syncore runtime", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "syncore-node-"));
  });

  afterEach(async () => {
    // Temporary directories are left to the OS cleanup to keep the test simple.
  });

  it("runs mutations and reactive queries", async () => {
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
        .index("by_done", ["done"])
        .searchIndex("search_text", { searchField: "text" })
    });

    const functions = {
      "tasks/list": query({
        args: {},
        handler: async (ctx: QueryCtx<typeof schema>) =>
          ctx.db.query("tasks").order("desc").collect()
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
      }),
      "tasks/markDone": mutation({
        args: { id: v.string() },
        handler: async (
          ctx: MutationCtx<typeof schema>,
          args: { id: string }
        ) => {
          await ctx.db.patch("tasks", args.id, { done: true });
          return null;
        }
      })
    };

    const runtime = createNodeSyncoreRuntime({
      databasePath: path.join(rootDir, "syncore.db"),
      storageDirectory: path.join(rootDir, "storage"),
      schema,
      functions
    });

    await runtime.start();
    const client = runtime.createClient();
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

    const watch = client.watchQuery(listTasks);
    await client.mutation(createTask, {
      text: "Ship Syncore"
    });

    const tasks = await client.query(listTasks);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.text).toBe("Ship Syncore");
    expect(watch.localQueryResult()).toBeDefined();

    await runtime.stop();
  });

  it("streams runtime events to the devtools hub", async () => {
    const httpServer = createServer();
    const websocketServer = new WebSocketServer({ server: httpServer });
    const messages: string[] = [];
    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });
    const address = httpServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to get test server address.");
    }
    websocketServer.on("connection", (socket) => {
      socket.on("message", (payload) => {
        const rawPayload =
          typeof payload === "string"
            ? payload
            : payload instanceof Buffer
              ? payload.toString("utf8")
              : Array.isArray(payload)
                ? Buffer.concat(payload).toString("utf8")
                : payload instanceof ArrayBuffer
                  ? Buffer.from(payload).toString("utf8")
                  : Buffer.from(
                      payload.buffer,
                      payload.byteOffset,
                      payload.byteLength
                    ).toString("utf8");
        messages.push(rawPayload);
      });
    });

    const runtimeSchema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
    });

    const runtime = createNodeSyncoreRuntime({
      databasePath: path.join(rootDir, "devtools.db"),
      storageDirectory: path.join(rootDir, "storage"),
      schema: runtimeSchema,
      functions: {
        "tasks/list": query({
          args: {},
          handler: async (ctx: QueryCtx<typeof runtimeSchema>) =>
            ctx.db.query("tasks").collect()
        })
      },
      devtoolsUrl: `ws://127.0.0.1:${address.port}`
    });

    await runtime.start();
    await runtime
      .createClient()
      .query(
        createFunctionReference<
          "query",
          Record<never, never>,
          Array<{ _id: string; text: string; done: boolean }>
        >("query", "tasks/list")
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
    await runtime.stop();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(messages.some((message) => message.includes('"type":"hello"'))).toBe(
      true
    );
    expect(messages.some((message) => message.includes('"type":"event"'))).toBe(
      true
    );
    expect(
      messages.some((message) => message.includes('"type":"snapshot"'))
    ).toBe(true);

    websocketServer.close();
    httpServer.close();
  });

  it("binds an electron-style window with one helper", async () => {
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
    });
    const runtime = createNodeSyncoreRuntime({
      databasePath: path.join(rootDir, "electron.db"),
      storageDirectory: path.join(rootDir, "electron-storage"),
      schema,
      functions: {
        "tasks/list": query({
          args: {},
          handler: async (ctx: QueryCtx<typeof schema>) =>
            ctx.db.query("tasks").collect()
        })
      }
    });

    const listeners = new Set<(message: unknown) => void>();
    const sentMessages: unknown[] = [];
    const binding = bindElectronWindowToSyncoreRuntime({
      runtime,
      window: {
        isDestroyed: () => false,
        webContents: {
          send(_channel: string, message: unknown) {
            sentMessages.push(message);
          }
        }
      },
      onRendererMessage(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    });

    await binding.ready;
    expect(sentMessages).toContainEqual({ type: "runtime.ready" });
    await binding.dispose();
  });

  it("creates a managed node client for scripts", async () => {
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
    });
    const managed = await createManagedNodeSyncoreClient({
      databasePath: path.join(rootDir, "managed.db"),
      storageDirectory: path.join(rootDir, "managed-storage"),
      schema,
      functions: {
        "tasks/list": query({
          args: {},
          handler: async (ctx: QueryCtx<typeof schema>) =>
            ctx.db.query("tasks").collect()
        })
      }
    });

    const tasks = await managed.client.query(
      createFunctionReference<
        "query",
        Record<never, never>,
        Array<{ _id: string; text: string; done: boolean }>
      >("query", "tasks/list")
    );
    expect(tasks).toEqual([]);
    await managed.dispose();
  });
});
