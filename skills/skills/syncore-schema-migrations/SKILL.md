---
name: syncore-schema-migrations
description: Schema design and migration workflow for Syncore, including validators, indexes, search indexes, drift detection, stored snapshots, and SQL migration files. Use when changing `syncore/schema.ts`, tables, indexes, search indexes, component-composed schema, or files under `syncore/migrations`.
---

# Syncore Schema And Migrations

Use this skill when changing `syncore/schema.ts`, indexes, search indexes, or
migration files under `syncore/migrations`.

## Documentation Sources

Read these first from the current app:

- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/migrations/*.sql`
- `syncore/migrations/_schema_snapshot.json`
- `syncore/_generated/schema.ts`
- installed `syncorejs` docs or type declarations

## Instructions

### Schema Is The Source Of Truth

Define tables in `syncore/schema.ts` with `defineSchema`, `defineTable`, and
validators from `v`.

```ts
import { defineSchema, defineTable, v } from "syncorejs";

export default defineSchema({
  tasks: defineTable({
    text: v.string(),
    done: v.boolean()
  })
    .index("by_done", ["done"])
    .searchIndex("search_text", { searchField: "text" })
});
```

When the app installs components, the effective runtime schema is the composed
result of root schema plus installed component schemas.

### Migration Flow

1. Change `syncore/schema.ts`
2. Update `syncore/components.ts` if component installs affect the composed schema
3. Run `npx syncorejs migrate:status`
4. If the diff is safe, run `npx syncorejs migrate:generate [name]`
5. Review the generated SQL in `syncore/migrations/*.sql`
6. Apply it with `npx syncorejs migrate:apply`
7. Regenerate typed files with `npx syncorejs codegen` or let `npx syncorejs dev` keep them fresh

### Drift Safety

Expect the CLI to block or warn on changes that can destroy data silently.

### Indexes And Search Indexes

Model them in schema first, then query through the exposed API:

```ts
export default defineSchema({
  notes: defineTable({
    body: v.string(),
    pinned: v.boolean()
  })
    .index("by_pinned", ["pinned"])
    .searchIndex("search_body", { searchField: "body" })
});
```

## Best Practices

- Treat `syncore/schema.ts` as the canonical root data model
- Add indexes and search indexes explicitly in schema definitions
- Run `migrate:status` before generating or applying migrations
- Review generated SQL instead of blindly applying it
- Regenerate code after schema or component-install changes
- Remember that installed components can change the composed schema

## Common Pitfalls

1. Changing schema without regenerating codegen outputs
2. Removing fields without checking migration warnings or destructive changes
3. Updating schema but forgetting the functions and UI that consume it
4. Assuming search indexes exist just because a query needs them
5. Forgetting that `syncore/components.ts` can affect the effective schema

## References

- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/migrations/*.sql`
- `syncore/migrations/_schema_snapshot.json`
- `syncore/_generated/schema.ts`
