---
name: syncore-schema-migrations
description: Schema design and migration workflow for Syncore, including validators, indexes, search indexes, drift detection, stored snapshots, and SQL migration files. Use when changing `syncore/schema.ts`, indexes, or files under `syncore/migrations`.
---

# Syncore Schema And Migrations

Use this skill when changing `syncore/schema.ts`, indexes, search indexes, or
migration files under `syncore/migrations`.

## Documentation Sources

Read these first:

- `packages/schema/AGENTS.md`
- `packages/cli/AGENTS.md`
- `packages/core/src/cli.ts`
- `README.md`
- `docs/architecture.md`
- `examples/electron/syncore/schema.ts`
- `examples/expo/syncore/schema.ts`
- `examples/next-pwa/syncore/schema.ts`
- `examples/sveltekit/syncore/schema.ts`

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

### Migration Flow

Syncore's migration workflow is local and CLI-driven:

1. Change `syncore/schema.ts`
2. Run `npx syncorejs migrate:status`
3. If the diff is safe, run `npx syncorejs migrate:generate [name]`
4. Review the generated SQL in `syncore/migrations/*.sql`
5. Apply it with `npx syncorejs migrate:apply`
6. Regenerate typed files with `npx syncorejs codegen` or let `npx syncorejs dev` keep them fresh

The CLI stores a schema snapshot in
`syncore/migrations/_schema_snapshot.json` and compares the current schema
against that saved snapshot. Destructive drift is intentionally surfaced early.

### Drift Safety

Expect the CLI to block or warn on changes that can destroy data silently.

Good workflow:

- additive columns or tables
- adding indexes before querying through them
- reviewing generated SQL before applying

Risky workflow:

- deleting or renaming fields without a plan
- assuming generated SQL is always safe without review
- changing data shape without updating functions and examples

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

Define indexes before relying on `withIndex(...)` or `withSearchIndex(...)` in
functions.

### Keep Consumers In Sync

Schema changes usually require updating:

- function args or return validators
- React or other UI code using generated references
- examples used as integration fixtures
- tests covering inference or runtime behavior

`npx syncorejs dev` helps during the inner loop, but explicit migration review
is still required when the schema changes intentionally.

## Examples

### Safe Additive Change

```ts
import { defineSchema, defineTable, v } from "syncorejs";

export default defineSchema({
  todos: defineTable({
    title: v.string(),
    complete: v.boolean(),
    category: v.optional(v.string())
  })
    .index("by_complete", ["complete"])
    .searchIndex("search_title", { searchField: "title" })
});
```

Then run:

```bash
npx syncorejs migrate:status
npx syncorejs migrate:generate add_todo_category
npx syncorejs migrate:apply
npx syncorejs codegen
```

### Search Index Workflow

```ts
export default defineSchema({
  messages: defineTable({
    body: v.string(),
    done: v.boolean()
  })
    .index("by_done", ["done"])
    .searchIndex("search_body", { searchField: "body" })
});
```

Add the index in schema before expecting search-related queries or migration SQL
to work.

## Best Practices

- Treat `syncore/schema.ts` as the canonical data model
- Add indexes and search indexes explicitly in schema definitions
- Run `migrate:status` before generating or applying migrations
- Review generated SQL instead of blindly applying it
- Remember that `migrate:generate` can use the default `auto` name when you do not pass one
- Regenerate code after schema changes so generated APIs stay aligned
- Update examples and tests when a public data shape changes

## Common Pitfalls

1. Changing schema without regenerating codegen outputs
2. Removing fields without checking migration warnings or destructive changes
3. Updating schema but forgetting the functions and UI that consume it
4. Assuming search indexes exist just because a query needs them

## References

- `packages/schema/AGENTS.md`
- `packages/cli/AGENTS.md`
- `packages/core/src/cli.ts`
- `docs/architecture.md`
