import "fake-indexeddb/auto";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFunctionReference,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx
} from "syncore";
import { defineSchema, defineTable, v } from "@syncore/schema";
import { createWebSyncoreRuntime } from "./index.js";

const wasmFilePath = path.resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm");

describe("platform-web sql.js runtime", () => {
  beforeEach(async () => {
    await deleteDatabase("syncore-web-test");
  });

  afterEach(async () => {
    await deleteDatabase("syncore-web-test");
  });

  it("persists sqlite state into IndexedDB between runtime instances", async () => {
    const schema = defineSchema({
      todos: defineTable({
        title: v.string(),
        complete: v.boolean()
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
            complete: false
          })
      })
    };

    const firstRuntime = await createWebSyncoreRuntime({
      databaseName: "todos",
      persistenceDatabaseName: "syncore-web-test",
      schema,
      functions,
      locateFile: () => wasmFilePath
    });
    await firstRuntime.start();
    await firstRuntime.createClient().mutation(
      createFunctionReference("mutation", "todos/create"),
      { title: "Persist me" }
    );
    await firstRuntime.stop();

    const secondRuntime = await createWebSyncoreRuntime({
      databaseName: "todos",
      persistenceDatabaseName: "syncore-web-test",
      schema,
      functions,
      locateFile: () => wasmFilePath
    });
    await secondRuntime.start();
    const rows = await secondRuntime.createClient().query(
      createFunctionReference<
        "query",
        Record<never, never>,
        Array<{ title: string }>
      >(
        "query",
        "todos/list"
      )
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Persist me");
    await secondRuntime.stop();
  });
});

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error(`Failed to delete IndexedDB database "${name}".`));
    request.onblocked = () => resolve();
  });
}
