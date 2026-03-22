# Syncore Schema and Migrations

## Schema Is the Source of Truth

Define tables in `syncore/schema.ts` with `defineSchema`, `defineTable`, and
schema builders from `s`:

```ts
import { defineSchema, defineTable, s } from "syncorejs";

export default defineSchema({
  tasks: defineTable({
    text: s.string(),
    done: s.boolean(),
    status: s.enum(["todo", "done"] as const),
    projectId: s.nullable(s.id("projects"))
  })
    .index("by_done", ["done"])
    .index("by_project_status", ["projectId", "status"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["status", "projectId"]
    })
});
```

When the app installs components, the effective runtime schema is the composed
result of root schema plus installed component schemas.

Treat schema as the canonical data model:

- document shape should be explicit
- indexed field paths should be explicit
- codecs should encode storage shape explicitly
- `s.any()` should be a last resort
- do not add Zod to Syncore core for schema modeling

## How To Build `syncore/schema.ts`

Start with one table per real aggregate. Keep the root schema small and
deliberate:

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
    color: s.string(),
    archivedAt: s.optional(s.number())
  }).index("by_slug", ["slug"]),

  tasks: defineTable({
    title: s.string(),
    status: s.enum(["todo", "doing", "done"] as const),
    projectId: s.nullable(s.id("projects")),
    dueAt: s.optional(isoDate),
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

Authoring rules:

- Use top-level fields for data you filter, sort, join, or search.
- Keep dynamic maps behind `s.record(...)`, not ad hoc nested blobs.
- Keep union members discriminated with `s.literal(...)` on `kind`.
- Use `s.optional(...)` for omitted fields and `s.nullable(...)` for explicit null states.
- Use `s.id("table")` for cross-table references.
- Avoid `s.any()` unless the field is intentionally opaque.

## Builder Guide

| Builder | Use when |
| --- | --- |
| `s.string()` | text, slugs, labels, externally managed ids |
| `s.number()` | timestamps, counters, order, numeric values |
| `s.boolean()` | flags |
| `s.id("table")` | foreign keys |
| `s.enum([...])` | closed sets of states |
| `s.literal(value)` | discriminators inside unions |
| `s.array(field)` | ordered collections |
| `s.object({ ... })` | nested fixed shape |
| `s.record(key, value)` | arbitrary keyed maps |
| `s.optional(field)` | field may be absent |
| `s.nullable(field)` | field may be null |
| `s.union(a, b, ...)` | variant payloads |
| `s.codec(value, config)` | stored shape differs from app shape |
| `s.any()` | opaque fallback only |

## Indexing Rules

- Add indexes for actual query patterns, not hypothetical ones.
- Name indexes after access patterns, like `by_status` or `by_project_status`.
- Keep indexed fields explicit and stable.
- Define search indexes only when full-text search exists in app behavior.
- Prefer dedicated search fields when search text is assembled from multiple fields.

## Migration Flow

1. change `syncore/schema.ts`
2. update `syncore/components.ts` if component installs affect the composed schema
3. run `npx syncorejs migrate:status`
4. if the diff is safe, run `npx syncorejs migrate:generate [name]`
5. review the generated SQL in `syncore/migrations/*.sql`
6. apply it with `npx syncorejs migrate:apply`
7. regenerate typed files with `npx syncorejs codegen` or let `npx syncorejs dev` keep them fresh

## Drift Safety

Expect the CLI to block or warn on changes that can destroy data silently.

## Indexes and Search Indexes

Model them in schema first, then query through the exposed API:

```ts
export default defineSchema({
  notes: defineTable({
    body: s.string(),
    pinned: s.boolean(),
    metadata: s.optional(s.record(s.string(), s.string()))
  })
    .index("by_pinned", ["pinned"])
    .searchIndex("search_body", { searchField: "body" })
});
```

The schema snapshot now captures field definitions, field paths, storage
metadata, indexes, and search indexes. The runtime still stores `_json` as the
base payload in this phase, but the schema surface should already be structured
enough to support later projection work without another public redesign.

## Best Practices

- treat `syncore/schema.ts` as the canonical root data model
- add indexes and search indexes explicitly
- keep field paths valid at the type level instead of relying on raw strings
- use codecs when storage shape differs from application shape
- keep unions discriminated and optional/null semantics explicit
- prefer `s.enum([...])` and `s.id("table")` over loose strings when the domain allows it
- run `migrate:status` before generating or applying migrations
- review generated SQL instead of blindly applying it
- regenerate code after schema or component-install changes

## Common Pitfalls

1. changing schema without regenerating codegen outputs
2. removing fields without checking migration warnings or destructive changes
3. updating schema but forgetting functions and UI that consume it
4. assuming search indexes exist just because a query needs them
5. forgetting that `syncore/components.ts` can affect the effective schema
