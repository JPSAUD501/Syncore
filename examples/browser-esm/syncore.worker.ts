/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncorejs/browser";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import {
  defineSchema,
  defineTable,
  mutation,
  query,
  s,
  type MutationCtx,
  type QueryCtx
} from "syncorejs";

const schema = defineSchema({
  contacts: defineTable({
    name: s.string(),
    email: s.string(),
    company: s.string(),
    color: s.string(),
    favorite: s.optional(s.boolean()),
    createdAt: s.number()
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
    returns: s.array(s.any()),
    handler: async (ctx) =>
      (ctx as Ctx).db
        .query("contacts")
        .withIndex("by_created")
        .order("desc")
        .collect()
  }),
  "contacts/stats": query({
    args: {},
    returns: s.any(),
    handler: async (ctx) => {
      const contacts = await (ctx as Ctx).db
        .query("contacts")
        .withIndex("by_created")
        .collect();
      const companies = new Set(
        contacts
          .map((contact) => contact.company)
          .filter((company): company is string => Boolean(company))
      );
      return {
        total: contacts.length,
        companies: companies.size,
        favorites: contacts.filter((contact) => contact.favorite === true)
          .length,
        newestAt:
          contacts.length === 0
            ? null
            : Math.max(...contacts.map((contact) => contact.createdAt))
      };
    }
  }),
  "contacts/search": query({
    args: { query: s.string() },
    returns: s.array(s.any()),
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
    args: { name: s.string(), email: s.string(), company: s.string() },
    returns: s.string(),
    handler: async (ctx, args) => {
      const a = args as { name: string; email: string; company: string };
      return (ctx as MCtx).db.insert("contacts", {
        name: a.name,
        email: a.email,
        company: a.company,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
        favorite: false,
        createdAt: Date.now()
      });
    }
  }),
  "contacts/toggleFavorite": mutation({
    args: { id: s.string() },
    returns: s.null(),
    handler: async (ctx, args) => {
      const id = (args as { id: string }).id;
      const contact = await (ctx as MCtx).db.get("contacts", id);
      if (!contact) return null;
      await (ctx as MCtx).db.patch("contacts", id, {
        favorite: contact.favorite !== true
      });
      return null;
    }
  }),
  "contacts/seedDemo": mutation({
    args: {},
    returns: s.number(),
    handler: async (ctx) => {
      const existing = await (ctx as MCtx).db.query("contacts").collect();
      if (existing.length > 0) return 0;
      const samples = [
        ["Maya Chen", "maya@example.test", "Northstar Labs"],
        ["Rafael Costa", "rafael@example.test", "Orbit Studio"],
        ["Iris Novak", "iris@example.test", "FieldKit"],
        ["Sam Rivera", "sam@example.test", "Northstar Labs"]
      ] as const;
      const now = Date.now();
      for (const [index, sample] of samples.entries()) {
        await (ctx as MCtx).db.insert("contacts", {
          name: sample[0],
          email: sample[1],
          company: sample[2],
          color: COLORS[index % COLORS.length]!,
          favorite: index === 0,
          createdAt: now - index * 90_000
        });
      }
      return samples.length;
    }
  }),
  "contacts/remove": mutation({
    args: { id: s.string() },
    returns: s.null(),
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
  locateFile: () => sqlWasmUrl
});
