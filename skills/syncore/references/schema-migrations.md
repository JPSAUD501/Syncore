# Syncore Schema and Migrations

## Schema Is the Source of Truth

Define tables in `syncore/schema.ts` with `defineSchema`, `defineTable`, and
builders from `s`:

```ts
import { defineSchema, defineTable, s } from "syncorejs";

export default defineSchema({
  tasks: defineTable({
    text: s.string(),
    done: s.boolean()
  })
    .index("by_done", ["done"])
    .searchIndex("search_text", { searchField: "text" })
});
```

When the app installs components, the effective runtime schema is the composed
result of root schema plus installed component schemas.

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
    pinned: s.boolean()
  })
    .index("by_pinned", ["pinned"])
    .searchIndex("search_body", { searchField: "body" })
});
```

## Best Practices

- treat `syncore/schema.ts` as the canonical root data model
- add indexes and search indexes explicitly
- run `migrate:status` before generating or applying migrations
- review generated SQL instead of blindly applying it
- regenerate code after schema or component-install changes

## Common Pitfalls

1. changing schema without regenerating codegen outputs
2. removing fields without checking migration warnings or destructive changes
3. updating schema but forgetting functions and UI that consume it
4. assuming search indexes exist just because a query needs them
5. forgetting that `syncore/components.ts` can affect the effective schema
