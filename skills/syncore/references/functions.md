# Syncore Functions

## Function Types

| Type       | Use For                       | Database Access                  | External IO |
| ---------- | ----------------------------- | -------------------------------- | ----------- |
| `query`    | Reading reactive state        | Read-only                        | No          |
| `mutation` | Transactional writes          | Read and write                   | No          |
| `action`   | Side effects and integrations | Via `runQuery` and `runMutation` | Yes         |

## Use Generated Server Helpers

Inside `syncore/functions/*.ts`, import from `../_generated/server`:

```ts
import { mutation, query, s } from "../_generated/server";
```

## Prefer Explicit Schema Builders

Prefer table-aware ids over plain strings:

```ts
args: {
  id: s.id("tasks"),
  done: s.boolean()
}
```

Treat `s.*` as part of the data model, not just input validation. Use explicit
fields, `nullable`, `union`, `record`, and `codec` when the document shape
needs them. Keep `s.any()` as an escape hatch, not the default.

## Choosing `s.*`

Use the smallest builder that accurately models the field:

| Need | Builder |
| --- | --- |
| free text, labels, slugs, ids already external to Syncore | `s.string()` |
| numeric timestamps, counters, sort order | `s.number()` |
| flags | `s.boolean()` |
| table foreign key | `s.id("table")` |
| finite states like `"todo" | "done"` | `s.enum([...])` |
| exact discriminator values | `s.literal("note")` |
| repeated items | `s.array(...)` |
| nested structured object | `s.object({ ... })` |
| map with unknown keys | `s.record(key, value)` |
| field may be omitted | `s.optional(...)` |
| field may be null | `s.nullable(...)` |
| variant payloads | `s.union(...)` |
| stored shape differs from app shape | `s.codec(...)` |
| truly unstructured fallback | `s.any()` |

Practical rules:

- Prefer `s.enum([...])` over `s.string()` when the value is a closed set.
- Prefer `s.literal(...)` inside `s.union(...)` members so variants discriminate cleanly.
- Prefer `s.optional(...)` over nullable when absence and null are semantically different.
- Prefer `s.nullable(...)` when the field still exists logically and queries may filter on null.
- Do not hide queryable fields inside `s.any()`.

## Recommended `schema.ts` Pattern

```ts
import { defineSchema, defineTable, s } from "syncorejs";

const isoDate = s.codec(s.string(), {
  storage: s.number(),
  serialize: (value) => Date.parse(value),
  deserialize: (value) => new Date(value).toISOString()
});

export default defineSchema({
  projects: defineTable({
    name: s.string(),
    slug: s.string(),
    archivedAt: s.optional(s.number())
  }).index("by_slug", ["slug"]),

  tasks: defineTable({
    title: s.string(),
    status: s.enum(["todo", "doing", "done"] as const),
    projectId: s.nullable(s.id("projects")),
    dueAt: s.optional(isoDate),
    tags: s.array(s.string()),
    metadata: s.record(s.string(), s.string()),
    payload: s.union(
      s.object({
        kind: s.literal("note"),
        body: s.string()
      }),
      s.object({
        kind: s.literal("checklist"),
        items: s.array(
          s.object({
            text: s.string(),
            done: s.boolean()
          })
        )
      })
    )
  })
    .index("by_status", ["status"])
    .index("by_project_status", ["projectId", "status"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["status", "projectId"]
    })
});
```

## Schema Design Checklist

- Model query patterns first, then add only the indexes needed for them.
- Keep top-level fields explicit when they participate in filters, indexes, or search.
- Use dedicated search fields like `searchText` when full-text input is composed from multiple fields.
- Keep unions discriminated with a `kind` literal field.
- Use codecs for storage concerns, not to hide weak modeling.

## Queries

```ts
import { query, s } from "../_generated/server";

export const list = query({
  args: {},
  returns: s.array(
    s.object({
      _id: s.string(),
      text: s.string(),
      done: s.boolean()
    })
  ),
  handler: async (ctx) =>
    ctx.db.query("tasks").withIndex("by_done").order("desc").collect()
});
```

Define indexes in schema before depending on `withIndex(...)` or
`withSearchIndex(...)`. These builders are typed from the schema, so index names,
search index names, and indexed field paths should line up without casts.

## Mutations

```ts
import { mutation, s } from "../_generated/server";

export const toggleDone = mutation({
  args: {
    id: s.id("tasks"),
    done: s.boolean()
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("tasks", args.id, { done: args.done });
    return null;
  }
});
```

## Actions

```ts
import { action, s } from "../_generated/server";
import { api } from "../_generated/api";

export const exportTasks = action({
  args: {},
  returns: s.number(),
  handler: async (ctx) => {
    const tasks = await ctx.runQuery(api.tasks.list);
    await fetch("https://example.invalid/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tasks)
    });
    return tasks.length;
  }
});
```

## Typed References

```ts
import { createFunctionReference, mutation, s } from "../_generated/server";

export const scheduleCreate = mutation({
  args: { body: s.string(), delayMs: s.number() },
  handler: async (ctx, args) =>
    ctx.scheduler.runAfter(
      args.delayMs,
      createFunctionReference("mutation", "notes/createFromScheduler"),
      { body: args.body, pinned: false },
      { type: "catch_up" }
    )
});
```

## Components and Public APIs

If the app installs components, app code usually consumes:

- `api.*` for root functions
- `components.<alias>.*` for installed component public functions

## Empty Args Ergonomics

```ts
export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("tasks").collect()
});
```

## Best Practices

- use `query` for reads, `mutation` for writes, and `action` for side effects
- keep function changes aligned with schema and generated API output
- add `returns` schema builders where explicit shape matters to callers
- let schema drive `withIndex(...)` and `withSearchIndex(...)`; avoid stringly-typed fallbacks
- prefer generated refs over handwritten strings or casts

## Common Pitfalls

1. using `action` for database writes that belong in mutations
2. widening types and breaking `useQuery(api.foo.bar)` inference
3. editing generated API refs instead of source definitions
4. forgetting that scheduled jobs should use typed refs
5. using plain strings where `s.id("table")` better expresses intent
