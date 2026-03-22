---
name: syncore-functions
description: Writing Syncore queries, mutations, and actions with typed validators, query builders, function references, scheduler calls, and inference-friendly patterns. Use when editing `syncore/functions/**/*.ts`, building a local backend, reviewing function typing, or validating generated API behavior against source definitions.
---

# Syncore Functions

Use this skill when writing or reviewing `syncore/functions/**/*.ts` files. The
focus is preserving typed DX from function definitions through generated
references and client APIs.

## Documentation Sources

Read these first from the current app or component package:

- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/_generated/server.ts`
- `syncore/_generated/api.ts`
- `syncore/_generated/functions.ts`
- installed `syncorejs` docs or type declarations

## Instructions

### Function Types Overview

| Type       | Use For                       | Database Access                  | External IO |
| ---------- | ----------------------------- | -------------------------------- | ----------- |
| `query`    | Reading reactive state        | Read-only                        | No          |
| `mutation` | Transactional writes          | Read/Write                       | No          |
| `action`   | Side effects and integrations | Via `runQuery` and `runMutation` | Yes         |

### Use Generated Server Helpers In Function Files

Inside `syncore/functions/*.ts`, import from `../_generated/server`:

```ts
import { mutation, query, v } from "../_generated/server";
```

### Prefer Strong Validators

Use the most specific validators you can. For document ids, prefer table-aware
ids over plain strings:

```ts
args: {
  id: v.id("tasks"),
  done: v.boolean()
}
```

### Queries

Queries are reactive and should read only:

```ts
import { query, v } from "../_generated/server";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      text: v.string(),
      done: v.boolean()
    })
  ),
  handler: async (ctx) =>
    ctx.db.query("tasks").withIndex("by_done").order("desc").collect()
});
```

Define indexes in schema before depending on `withIndex(...)` or
`withSearchIndex(...)`.

### Mutations

Mutations own writes and can schedule follow-up work:

```ts
import { mutation, v } from "../_generated/server";

export const toggleDone = mutation({
  args: {
    id: v.id("tasks"),
    done: v.boolean()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("tasks", args.id, { done: args.done });
    return null;
  }
});
```

### Actions

Actions are the place for side effects or other non-database integrations:

```ts
import { action, v } from "../_generated/server";
import { api } from "../_generated/api";

export const exportTasks = action({
  args: {},
  returns: v.number(),
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

### Typed References

Generated references are preferred in app code:

```ts
import { createFunctionReference, mutation, v } from "../_generated/server";

export const scheduleCreate = mutation({
  args: { body: v.string(), delayMs: v.number() },
  handler: async (ctx, args) =>
    ctx.scheduler.runAfter(
      args.delayMs,
      createFunctionReference("mutation", "notes/createFromScheduler"),
      { body: args.body, pinned: false },
      { type: "catch_up" }
    )
});
```

### Components And Public APIs

If the app installs components, app code usually consumes:

- `api.*` for root functions
- `components.<alias>.*` for installed component public functions

### Empty Args Ergonomics Matter

Preserve empty-args patterns:

```ts
export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("tasks").collect()
});
```

## Best Practices

- Use `query` for reads, `mutation` for writes, and `action` for side effects
- Import helpers from `../_generated/server` inside function files
- Prefer `v.id("table")` over plain `v.string()` for document ids
- Add `returns` validators where explicit shape matters to callers
- Preserve optional args ergonomics for empty-object validators
- Prefer generated references in app code
- Keep function changes aligned with schema and generated API output

## Common Pitfalls

1. Using `action` for ordinary database writes that belong in mutations
2. Breaking `useQuery(api.foo.bar)` inference by widening types unnecessarily
3. Editing generated API references instead of source function definitions
4. Forgetting that scheduled jobs should use typed function references
5. Reaching for plain strings where `v.id("table")` better expresses intent

## References

- `syncore/schema.ts`
- `syncore/functions/**/*.ts`
- `syncore/_generated/server.ts`
- `syncore/_generated/api.ts`
- `syncore/_generated/functions.ts`
