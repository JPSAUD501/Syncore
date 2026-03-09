import "fake-indexeddb/auto";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeSyncoreRuntime } from "@syncore/platform-node";
import { createWebSyncoreRuntime } from "@syncore/platform-web";
import {
  createFunctionReference,
  defineSchema,
  defineTable,
  mutation,
  query,
  v,
  type MutationCtx,
  type QueryCtx,
  type SyncoreRuntime
} from "@syncore/core";

const require = createRequire(import.meta.url);
const wasmFilePath = require.resolve("sql.js/dist/sql-wasm.wasm");

const schema = defineSchema({
  todos: defineTable({
    title: v.string(),
    complete: v.boolean()
  })
    .index("by_complete", ["complete"])
    .searchIndex("search_title", { searchField: "title" })
});

const functions = {
  "todos/list": query({
    args: {},
    handler: async (ctx: QueryCtx<typeof schema>) =>
      ctx.db.query("todos").order("desc").collect()
  }),
  "todos/create": mutation({
    args: { title: v.string() },
    handler: async (ctx: MutationCtx<typeof schema>, args: { title: string }) =>
      ctx.db.insert("todos", {
        title: args.title,
        complete: false
      })
  }),
  "todos/scheduleCreate": mutation({
    args: { title: v.string(), delayMs: v.number() },
    handler: async (
      ctx: MutationCtx<typeof schema>,
      args: { title: string; delayMs: number }
    ) => {
      await ctx.scheduler.runAfter(
        args.delayMs,
        createFunctionReference<"mutation", { title: string }, string>(
          "mutation",
          "todos/create"
        ),
        { title: args.title }
      );
      return null;
    }
  }),
  "files/put": mutation({
    args: {
      name: v.string(),
      body: v.string()
    },
    handler: async (
      ctx: MutationCtx<typeof schema>,
      args: { name: string; body: string }
    ) =>
      ctx.storage.put({
        fileName: args.name,
        contentType: "text/plain",
        data: args.body
      })
  }),
  "files/get": query({
    args: {
      id: v.string()
    },
    handler: async (ctx: QueryCtx<typeof schema>, args: { id: string }) => {
      const file = await ctx.storage.get(args.id);
      const bytes = await ctx.storage.read(args.id);
      return {
        file,
        body: bytes ? new TextDecoder().decode(bytes) : null
      };
    }
  })
};

type ContractSchema = typeof schema;
const listTodos = createFunctionReference<
  "query",
  Record<never, never>,
  Array<{ _id: string; title: string; complete: boolean }>
>("query", "todos/list");
const createTodo = createFunctionReference<
  "mutation",
  { title: string },
  string
>("mutation", "todos/create");
const scheduleTodo = createFunctionReference<
  "mutation",
  { title: string; delayMs: number },
  null
>("mutation", "todos/scheduleCreate");
const putFile = createFunctionReference<
  "mutation",
  { name: string; body: string },
  string
>("mutation", "files/put");
const getFile = createFunctionReference<
  "query",
  { id: string },
  {
    file: { id: string; size: number; contentType: string | null } | null;
    body: string | null;
  }
>("query", "files/get");

type RuntimeFactory = {
  label: string;
  createRuntime(): Promise<SyncoreRuntime<ContractSchema>>;
  dispose(): Promise<void>;
  createDestructiveRuntime(
    destructiveSchema: typeof schema
  ): Promise<SyncoreRuntime<ContractSchema>>;
};

type NodeFactory = RuntimeFactory & {
  databasePath: string;
  storageDirectory: string;
  rootDirectory: string;
};

type WebFactory = RuntimeFactory & {
  databaseName: string;
  persistenceDatabaseName: string;
};

describe("adapter runtime contracts", () => {
  const factories: RuntimeFactory[] = [];

  beforeEach(async () => {
    factories.push(await createNodeFactory());
    factories.push(createWebFactory());
  });

  afterEach(async () => {
    while (factories.length > 0) {
      const factory = factories.pop();
      if (!factory) {
        continue;
      }
      await factory.dispose();
    }
  });

  for (const label of ["node", "web"] as const) {
    describe(label, () => {
      const getFactory = () => {
        const factory = factories.find((entry) => entry.label === label);
        if (!factory) {
          throw new Error(`Missing test factory for ${label}.`);
        }
        return factory;
      };

      it("reactively invalidates watched queries after mutations", async () => {
        const runtime = await getFactory().createRuntime();
        await runtime.start();
        const client = runtime.createClient();
        const watch = client.watchQuery(listTodos);
        const unsubscribe = watch.onUpdate(() => undefined);
        await waitFor(() => Array.isArray(watch.localQueryResult()));

        await client.mutation(createTodo, {
          title: `${label}-reactive`
        });

        await waitFor(() =>
          (watch.localQueryResult() ?? []).some(
            (todo) => todo.title === `${label}-reactive`
          )
        );

        const rows = await client.query(listTodos);
        expect(rows.some((todo) => todo.title === `${label}-reactive`)).toBe(
          true
        );

        unsubscribe();
        watch.dispose?.();
        await runtime.stop();
      });

      it("reconciles scheduled work after restart with catch_up semantics", async () => {
        const factory = getFactory();
        const firstRuntime = await factory.createRuntime();
        await firstRuntime.start();

        await firstRuntime.createClient().mutation(scheduleTodo, {
          title: `${label}-scheduled`,
          delayMs: 20
        });

        await firstRuntime.stop();
        await wait(60);

        const secondRuntime = await factory.createRuntime();
        await secondRuntime.start();
        await waitFor(async () => {
          const rows = await secondRuntime.createClient().query(listTodos);
          return rows.some((todo) => todo.title === `${label}-scheduled`);
        });
        await secondRuntime.stop();
      });

      it("persists file metadata and contents across runtime restarts", async () => {
        const factory = getFactory();
        const firstRuntime = await factory.createRuntime();
        await firstRuntime.start();

        const fileId = await firstRuntime.createClient().mutation(putFile, {
          name: `${label}.txt`,
          body: `hello-${label}`
        });

        await firstRuntime.stop();

        const secondRuntime = await factory.createRuntime();
        await secondRuntime.start();
        const stored = await secondRuntime
          .createClient()
          .query(getFile, { id: fileId });

        expect(stored.file?.id).toBe(fileId);
        expect(stored.file?.size).toBeGreaterThan(0);
        expect(stored.body).toBe(`hello-${label}`);

        await secondRuntime.stop();
      });

      it("fails fast on destructive schema drift after restart", async () => {
        const factory = getFactory();
        const runtime = await factory.createRuntime();
        await runtime.start();
        await runtime.stop();

        const destructiveSchema = defineSchema({
          todos: defineTable({
            title: v.string(),
            complete: v.boolean()
          })
        });

        const destructiveRuntime =
          label === "node"
            ? await (getFactory() as NodeFactory).createDestructiveRuntime(
                destructiveSchema
              )
            : await (getFactory() as WebFactory).createDestructiveRuntime(
                destructiveSchema
              );

        await expect(destructiveRuntime.start()).rejects.toThrow(
          /manual migration/i
        );
        await destructiveRuntime.stop().catch(() => undefined);
      });
    });
  }
});

async function createNodeFactory(): Promise<NodeFactory> {
  const rootDirectory = await mkdtemp(
    path.join(os.tmpdir(), "syncore-contract-node-")
  );
  const databasePath = path.join(rootDirectory, "syncore.db");
  const storageDirectory = path.join(rootDirectory, "storage");
  return {
    label: "node",
    rootDirectory,
    databasePath,
    storageDirectory,
    async createRuntime() {
      return createNodeSyncoreRuntime({
        databasePath,
        storageDirectory,
        schema,
        functions,
        platform: "contract-node",
        scheduler: {
          pollIntervalMs: 10
        }
      });
    },
    async createDestructiveRuntime(destructiveSchema) {
      return createNodeSyncoreRuntime({
        databasePath,
        storageDirectory,
        schema: destructiveSchema,
        functions,
        platform: "contract-node",
        scheduler: {
          pollIntervalMs: 10
        }
      });
    },
    async dispose() {
      await rm(rootDirectory, { recursive: true, force: true });
    }
  };
}

function createWebFactory(): WebFactory {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const databaseName = `syncore-contract-web-${suffix}`;
  const persistenceDatabaseName = `syncore-contract-idb-${suffix}`;

  return {
    label: "web",
    databaseName,
    persistenceDatabaseName,
    async createRuntime() {
      return createWebSyncoreRuntime({
        databaseName,
        persistenceDatabaseName,
        schema,
        functions,
        persistenceMode: "indexeddb",
        locateFile: () => wasmFilePath,
        platform: "contract-web",
        scheduler: {
          pollIntervalMs: 10
        }
      });
    },
    async createDestructiveRuntime(destructiveSchema) {
      return createWebSyncoreRuntime({
        databaseName,
        persistenceDatabaseName,
        schema: destructiveSchema,
        functions,
        persistenceMode: "indexeddb",
        locateFile: () => wasmFilePath,
        platform: "contract-web",
        scheduler: {
          pollIntervalMs: 10
        }
      });
    },
    async dispose() {
      await deleteIndexedDbDatabase(databaseName);
      await deleteIndexedDbDatabase(persistenceDatabaseName);
    }
  };
}

async function deleteIndexedDbDatabase(name: string): Promise<void> {
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
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await wait(20);
  }
  throw new Error("Timed out waiting for runtime contract condition.");
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
