/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncore/browser";
import {
  defineSchema,
  defineTable,
  mutation,
  query,
  v,
  type MutationCtx,
  type QueryCtx
} from "syncore";

const schema = defineSchema({
  tasks: defineTable({
    text: v.string(),
    done: v.boolean()
  })
});

const functions = {
  "tasks/list": query({
    args: {},
    returns: v.array(v.any()),
    handler: async (ctx) =>
      (ctx as QueryCtx<typeof schema>).db.query("tasks").collect()
  }),
  "tasks/create": mutation({
    args: { text: v.string() },
    returns: v.string(),
    handler: async (ctx, args) =>
      (ctx as MutationCtx<typeof schema>).db.insert("tasks", {
        text: (args as { text: string }).text,
        done: false
      })
  })
};

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  databaseName: "syncore-browser-esm",
  persistenceDatabaseName: "syncore-browser-esm",
  locateFile: () => "/sql-wasm.wasm"
});
