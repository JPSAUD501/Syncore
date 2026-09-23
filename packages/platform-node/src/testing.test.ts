import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFunctionReference,
  cronJobs,
  defineSchema,
  defineTable,
  mutation,
  query,
  s,
  type MutationCtx,
  type QueryCtx
} from "../../core/src/index.ts";
import { createTestSyncore, InMemoryStorageAdapter } from "./testing.js";

const schema = defineSchema({
  tasks: defineTable({
    text: s.string(),
    done: s.boolean()
  }).searchIndex("search_text", { searchField: "text" })
});

type Schema = typeof schema;

const createTask = createFunctionReference<"mutation", { text: string }, string>(
  "mutation",
  "tasks/create"
);

const functions = {
  "tasks/list": query({
    args: {},
    handler: async (ctx) =>
      (ctx as QueryCtx<Schema>).db.query("tasks").collect()
  }),
  "tasks/search": query({
    args: { text: s.string() },
    handler: async (ctx, args) =>
      (ctx as QueryCtx<Schema>).db
        .query("tasks")
        .withSearchIndex("search_text", (search) =>
          search.search("text", (args as { text: string }).text)
        )
        .collect()
  }),
  "tasks/create": mutation({
    args: { text: s.string() },
    handler: async (ctx, args) =>
      (ctx as MutationCtx<Schema>).db.insert("tasks", {
        text: (args as { text: string }).text,
        done: false
      })
  }),
  "tasks/scheduleCreate": mutation({
    args: { text: s.string(), delayMs: s.number() },
    returns: s.null(),
    handler: async (ctx, args) => {
      const { text, delayMs } = args as { text: string; delayMs: number };
      await (ctx as MutationCtx<Schema>).scheduler.runAfter(
        delayMs,
        createTask,
        { text }
      );
      return null;
    }
  }),
  "tasks/scheduleChain": mutation({
    args: { remaining: s.number() },
    returns: s.null(),
    handler: async (ctx, args) => {
      const { remaining } = args as { remaining: number };
      const typedCtx = ctx as MutationCtx<Schema>;
      await typedCtx.db.insert("tasks", {
        text: `chain ${remaining}`,
        done: false
      });
      if (remaining > 0) {
        await typedCtx.scheduler.runAfter(
          60_000,
          createFunctionReference<"mutation", { remaining: number }, null>(
            "mutation",
            "tasks/scheduleChain"
          ),
          { remaining: remaining - 1 }
        );
      }
      return null;
    }
  }),
  "tasks/fail": mutation({
    args: {},
    handler: async () => {
      throw new Error("boom");
    }
  })
};

const listTasks = createFunctionReference<
  "query",
  Record<never, never>,
  Array<{ text: string; done: boolean }>
>("query", "tasks/list");

describe("createTestSyncore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs queries and mutations against an in-memory database", async () => {
    await using t = await createTestSyncore({ schema, functions });

    await t.mutation(createTask, { text: "Write tests" });

    expect(await t.query(listTasks)).toMatchObject([
      { text: "Write tests", done: false }
    ]);
  });

  it("keeps each harness isolated", async () => {
    await using first = await createTestSyncore({ schema, functions });
    await using second = await createTestSyncore({ schema, functions });

    await first.mutation(createTask, { text: "only in first" });

    expect(await first.query(listTasks)).toHaveLength(1);
    expect(await second.query(listTasks)).toEqual([]);
  });

  it("gives run() a full mutation context", async () => {
    await using t = await createTestSyncore({ schema, functions });

    const id = await t.run((ctx) =>
      ctx.db.insert("tasks", { text: "seeded", done: true })
    );
    const stored = await t.run(async (ctx) => {
      const storageId = await ctx.storage.put({
        data: "hello",
        contentType: "text/plain"
      });
      const bytes = await ctx.storage.read(storageId);
      return {
        doc: await ctx.db.get("tasks", id),
        text: bytes ? new TextDecoder().decode(bytes) : null
      };
    });

    expect(stored.doc).toMatchObject({ _id: id, text: "seeded", done: true });
    expect(stored.text).toBe("hello");
  });

  it("rolls back a run() that throws", async () => {
    await using t = await createTestSyncore({ schema, functions });

    await expect(
      t.run(async (ctx) => {
        await ctx.db.insert("tasks", { text: "discarded", done: false });
        throw new Error("abort");
      })
    ).rejects.toThrow("abort");

    expect(await t.query(listTasks)).toEqual([]);
  });

  it("supports full-text search on the in-memory database", async () => {
    await using t = await createTestSyncore({ schema, functions });
    await t.mutation(createTask, { text: "buy oat milk" });
    await t.mutation(createTask, { text: "walk the dog" });

    const results = await t.query(
      createFunctionReference<
        "query",
        { text: string },
        Array<{ text: string }>
      >("query", "tasks/search"),
      { text: "milk" }
    );

    expect(results.map((task) => task.text)).toEqual(["buy oat milk"]);
  });

  it("runs scheduled jobs only when asked, following the clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await using t = await createTestSyncore({ schema, functions });

    await t.mutation(
      createFunctionReference("mutation", "tasks/scheduleCreate"),
      { text: "later", delayMs: 60_000 }
    );

    expect(await t.runScheduledJobs()).toEqual({ executed: 0, failed: 0 });
    expect(await t.query(listTasks)).toEqual([]);

    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    expect(await t.runScheduledJobs()).toEqual({ executed: 1, failed: 0 });
    expect(await t.query(listTasks)).toMatchObject([{ text: "later" }]);
  });

  it("finishes chains of scheduled jobs", async () => {
    await using t = await createTestSyncore({ schema, functions });

    await t.mutation(
      createFunctionReference("mutation", "tasks/scheduleChain"),
      { remaining: 3 }
    );

    expect(await t.finishScheduledJobs()).toEqual({ executed: 3, failed: 0 });
    expect(await t.query(listTasks)).toHaveLength(4);
  });

  it("stops a job that keeps rescheduling itself", async () => {
    await using t = await createTestSyncore({ schema, functions });

    await t.mutation(
      createFunctionReference("mutation", "tasks/scheduleChain"),
      { remaining: 10 }
    );

    await expect(t.finishScheduledJobs({ maxIterations: 3 })).rejects.toThrow(
      "still pending after 3 passes"
    );
  });

  it("counts failed jobs", async () => {
    await using t = await createTestSyncore({ schema, functions });
    await t.run((ctx) =>
      ctx.scheduler.runAfter(
        0,
        createFunctionReference("mutation", "tasks/fail"),
        {}
      )
    );

    expect(await t.finishScheduledJobs()).toEqual({ executed: 0, failed: 1 });
  });

  it("runs recurring jobs on demand without polling", async () => {
    await using t = await createTestSyncore({
      schema,
      functions,
      recurringJobs: cronJobs().interval(
        "heartbeat",
        { minutes: 5 },
        createTask,
        { text: "tick" }
      ).jobs
    });

    // Not due yet, and finishScheduledJobs never runs recurring jobs.
    expect(await t.finishScheduledJobs()).toEqual({ executed: 0, failed: 0 });
    expect(
      await t.runScheduledJobs({ includeFuture: true, includeRecurring: true })
    ).toEqual({ executed: 1, failed: 0 });
    expect(await t.query(listTasks)).toMatchObject([{ text: "tick" }]);
  });

  it("rejects a function registry that uses the reserved name", async () => {
    await expect(
      createTestSyncore({
        schema,
        functions: { ...functions, "__syncore_test__/run": functions["tasks/fail"] }
      })
    ).rejects.toThrow("reserved");
  });

  it("can be disposed more than once", async () => {
    const t = await createTestSyncore({ schema, functions });
    await t.dispose();
    await expect(t.dispose()).resolves.toBeUndefined();
  });
});

describe("InMemoryStorageAdapter", () => {
  it("stores, reads ranges, lists and deletes objects", async () => {
    const adapter = new InMemoryStorageAdapter();
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await expect(adapter.put("a", { data: bytes })).resolves.toMatchObject({
      id: "a",
      size: 4,
      contentType: null
    });
    bytes[0] = 9;

    expect(await adapter.read("a")).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(await adapter.readRange("a", 1, 2)).toEqual(new Uint8Array([2, 3]));
    expect(await adapter.list()).toHaveLength(1);
    await adapter.delete("a");
    expect(await adapter.get("a")).toBeNull();
  });
});
