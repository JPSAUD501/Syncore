/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncorejs/browser";
import {
  defineSchema,
  defineTable,
  mutation,
  query,
  v,
  type MutationCtx,
  type QueryCtx
} from "syncorejs";

const schema = defineSchema({
  contacts: defineTable({
    name: v.string(),
    email: v.string(),
    company: v.string(),
    color: v.string(),
    createdAt: v.number()
  })
    .index("by_created", ["createdAt"])
    .searchIndex("search_name", { searchField: "name" })
});

type Ctx = QueryCtx<typeof schema>;
type MCtx = MutationCtx<typeof schema>;

const COLORS = [
  "#5DE4C7",
  "#7C93F3",
  "#F2A65A",
  "#E06C75",
  "#C68FDD",
  "#57C785"
];

const functions = {
  "contacts/list": query({
    args: {},
    returns: v.array(v.any()),
    handler: async (ctx) =>
      (ctx as Ctx).db
        .query("contacts")
        .withIndex("by_created")
        .order("desc")
        .collect()
  }),
  "contacts/search": query({
    args: { query: v.string() },
    returns: v.array(v.any()),
    handler: async (ctx, args) => {
      const q = (args as { query: string }).query.trim();
      if (!q) return [];
      return (ctx as Ctx).db
        .query("contacts")
        .withSearchIndex("search_name", (s) => s.search("name", q))
        .collect();
    }
  }),
  "contacts/create": mutation({
    args: { name: v.string(), email: v.string(), company: v.string() },
    returns: v.string(),
    handler: async (ctx, args) => {
      const a = args as { name: string; email: string; company: string };
      return (ctx as MCtx).db.insert("contacts", {
        name: a.name,
        email: a.email,
        company: a.company,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
        createdAt: Date.now()
      });
    }
  }),
  "contacts/remove": mutation({
    args: { id: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
      await (ctx as MCtx).db.delete("contacts", (args as { id: string }).id);
      return null;
    }
  })
};

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  databaseName: "syncore-contacts-demo",
  persistenceDatabaseName: "syncore-contacts-demo",
  locateFile: () => "/sql-wasm.wasm"
});
