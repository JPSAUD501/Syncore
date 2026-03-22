import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFunctionReference,
  defineSchema,
  defineTable,
  mutation,
  query,
  s,
  type MutationCtx,
  type QueryCtx,
  type SyncoreCapabilities,
  type SyncoreRuntime
} from "@syncore/core";
import type { SyncoreSchema } from "@syncore/core";

const schema = defineSchema({
  todos: defineTable({
    title: s.string(),
    complete: s.boolean()
  }),
  runtime_state: defineTable({
    label: s.string()
  })
});

const functions = {
  "todos/list": query({
    args: {},
    handler: async (ctx: QueryCtx<typeof schema>) =>
      ctx.db.query("todos").order("desc").collect()
  }),
  "todos/create": mutation({
    args: { title: s.string() },
    handler: async (ctx: MutationCtx<typeof schema>, args: { title: string }) =>
      ctx.db.insert("todos", {
        title: args.title,
        complete: false
      })
  }),
  "todos/scheduleCreate": mutation({
    args: { title: s.string(), delayMs: s.number() },
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
      name: s.string(),
      body: s.string()
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
    args: { id: s.string() },
    handler: async (ctx: QueryCtx<typeof schema>, args: { id: string }) => {
      const file = await ctx.storage.get(args.id);
      const bytes = await ctx.storage.read(args.id);
      return {
        file,
        body: bytes ? new TextDecoder().decode(bytes) : null
      };
    }
  }),
  "runtime/readCapabilities": query({
    args: {},
    returns: s.object({
      platformProvided: s.string()
    }),
    handler: async (ctx: QueryCtx<typeof schema>) => {
      const capabilities = ctx.capabilities as Record<string, string>;
      return {
        platformProvided: capabilities.platformProvided
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
const readCapabilities = createFunctionReference<
  "query",
  Record<never, never>,
  { platformProvided: string }
>("query", "runtime/readCapabilities");

type ExpoFactory = {
  label: "expo";
  databaseName: string;
  databaseDirectory: string;
  storageDirectoryName: string;
  createRuntime(options?: {
    capabilities?: SyncoreCapabilities;
  }): Promise<SyncoreRuntime<ContractSchema>>;
  createDestructiveRuntime(
    destructiveSchema: SyncoreSchema<any>
  ): Promise<SyncoreRuntime<SyncoreSchema<any>>>;
  dispose(): Promise<void>;
};

describe("expo adapter contracts", () => {
  const factories: ExpoFactory[] = [];

  afterEach(async () => {
    while (factories.length > 0) {
      await factories.pop()?.dispose();
    }
  });

  it("reactively invalidates watched queries after mutations", async () => {
    const factory = await createExpoFactory();
    factories.push(factory);

    const runtime = await factory.createRuntime();
    await runtime.start();

    const client = runtime.createClient();
    const watch = client.watchQuery(listTodos);
    const unsubscribe = watch.onUpdate(() => undefined);
    await waitFor(() => Array.isArray(watch.localQueryResult()));

    await client.mutation(createTodo, {
      title: "expo-reactive"
    });

    await waitFor(() =>
      (watch.localQueryResult() ?? []).some(
        (todo) => todo.title === "expo-reactive"
      )
    );

    unsubscribe();
    watch.dispose?.();
    await runtime.stop();
  });

  it("reconciles scheduled work after restart", async () => {
    const factory = await createExpoFactory();
    factories.push(factory);

    const firstRuntime = await factory.createRuntime();
    await firstRuntime.start();
    await firstRuntime.createClient().mutation(scheduleTodo, {
      title: "expo-scheduled",
      delayMs: 20
    });
    await firstRuntime.stop();

    await wait(60);

    const secondRuntime = await factory.createRuntime();
    await secondRuntime.start();
    await waitFor(async () => {
      const rows = await secondRuntime.createClient().query(listTodos);
      return rows.some((todo) => todo.title === "expo-scheduled");
    });
    await secondRuntime.stop();
  });

  it("persists file metadata and contents across runtime restarts", async () => {
    const factory = await createExpoFactory();
    factories.push(factory);

    const firstRuntime = await factory.createRuntime();
    await firstRuntime.start();
    const fileId = await firstRuntime.createClient().mutation(putFile, {
      name: "expo.txt",
      body: "hello-expo"
    });
    await firstRuntime.stop();

    const secondRuntime = await factory.createRuntime();
    await secondRuntime.start();
    const stored = await secondRuntime.createClient().query(getFile, {
      id: fileId
    });

    expect(stored.file?.id).toBe(fileId);
    expect(stored.file?.size).toBeGreaterThan(0);
    expect(stored.body).toBe("hello-expo");

    await secondRuntime.stop();
  });

  it("exposes runtime capabilities inside function contexts", async () => {
    const factory = await createExpoFactory();
    factories.push(factory);

    const runtime = await factory.createRuntime({
      capabilities: {
        platformProvided: "expo-platform"
      }
    });

    await runtime.start();
    await expect(runtime.createClient().query(readCapabilities)).resolves.toEqual({
      platformProvided: "expo-platform"
    });
    await runtime.stop();
  });

  it("supports lazy bootstrap start and reset", async () => {
    const factory = await createExpoFactory();
    factories.push(factory);

    const { createExpoSyncoreBootstrap } = await import("@syncore/platform-expo");
    const bootstrap = createExpoSyncoreBootstrap({
      schema,
      functions,
      databaseName: factory.databaseName,
      databaseDirectory: factory.databaseDirectory,
      storageDirectoryName: factory.storageDirectoryName,
      platform: "contract-expo"
    });

    const client = await bootstrap.getClient();
    await client.mutation(createTodo, {
      title: "expo-bootstrap"
    });

    await bootstrap.stop();

    const restartedClient = await bootstrap.getClient();
    await expect(restartedClient.query(listTodos)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "expo-bootstrap"
        })
      ])
    );

    await bootstrap.reset();
  });
});

async function createExpoFactory(): Promise<ExpoFactory> {
  const rootDirectory = await mkdtemp(
    path.join(os.tmpdir(), "syncore-contract-expo-")
  );
  const databaseDirectory = path.join(rootDirectory, "databases");
  const databaseName = "syncore.db";
  const storageDirectoryName = "storage";
  const activeRuntimes = new Set<
    SyncoreRuntime<SyncoreSchema<any>>
  >();

  return {
    label: "expo",
    databaseName,
    databaseDirectory,
    storageDirectoryName,
    async createRuntime(options) {
      const { createExpoSyncoreRuntime } = await import("@syncore/platform-expo");
      const runtime = createExpoSyncoreRuntime({
        databaseName,
        databaseDirectory,
        storageDirectoryName,
        schema,
        functions,
        platform: "contract-expo",
        scheduler: {
          pollIntervalMs: 10
        },
        ...(options?.capabilities ? { capabilities: options.capabilities } : {})
      });
    activeRuntimes.add(
      runtime as SyncoreRuntime<SyncoreSchema<any>>
    );
      return runtime;
    },
    async createDestructiveRuntime(destructiveSchema) {
      const { createExpoSyncoreRuntime } = await import("@syncore/platform-expo");
      const runtime = createExpoSyncoreRuntime({
        databaseName,
        databaseDirectory,
        storageDirectoryName,
        schema: destructiveSchema,
        functions,
        platform: "contract-expo",
        scheduler: {
          pollIntervalMs: 10
        }
      });
      activeRuntimes.add(runtime);
      return runtime;
    },
    async dispose() {
      for (const runtime of activeRuntimes) {
        await runtime.stop().catch(() => undefined);
      }
      activeRuntimes.clear();
      await rm(rootDirectory, { recursive: true, force: true });
    }
  };
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
  throw new Error("Timed out waiting for Expo contract condition.");
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

