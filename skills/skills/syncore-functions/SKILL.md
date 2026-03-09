---
name: syncore-functions
displayName: Syncore Functions
description: Writing Syncore queries, mutations, and actions with typed validators, richer query builders, function references, scheduler calls, and inference-friendly patterns.
version: 1.1.0
author: Syncore
tags: [syncore, functions, query, mutation, action, types]
---

# Syncore Functions

Use this skill when writing or reviewing `syncore/functions/**/*.ts` files. The focus is preserving typed DX from function definitions through generated references and client APIs.

## Documentation Sources

Read these repo-local references first:

- `packages/core/src/runtime/functions.ts`
- `packages/core/src/runtime/runtime.ts`
- `packages/schema/src/validators.ts`
- `packages/core/AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `examples/electron/syncore/functions/tasks.ts`
- `examples/expo/syncore/functions/notes.ts`
- `examples/next-pwa/syncore/functions/todos.ts`

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

This keeps app code aligned with current codegen output and shared validator types.

### Prefer Strong Validators

Use the most specific validators you can. For document ids, prefer table-aware ids over plain strings:

```ts
args: {
  id: v.id("tasks"),
  done: v.boolean()
}
```

That keeps intent clear and improves downstream typing.

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

The current query builder surface includes:

- `withIndex(...)`
- `withSearchIndex(...)`
- `filter(...)`
- `collect()`
- `take(count)`
- `first()`
- `unique()`
- `paginate({ cursor, numItems })`

Use indexes and search indexes from schema before depending on those query paths in functions.

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

Mutations have `ctx.db`, `ctx.storage`, `ctx.scheduler`, `ctx.runQuery`, `ctx.runMutation`, and `ctx.runAction`.

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

Actions also have access to `ctx.storage` and `ctx.scheduler`.

### Typed References

There are two main reference flows:

- generated client references via `syncore/_generated/api`
- direct references via `createFunctionReference` or `createFunctionReferenceFor`

Generated references are preferred in app code. Direct references are useful for scheduler jobs and low-level runtime tests.

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

### Empty Args Ergonomics Matter

Syncore intentionally supports optional call signatures for empty-object args. Preserve these patterns:

```ts
export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("tasks").collect()
});
```

That enables client usage like:

```tsx
const tasks = useQuery(api.tasks.list) ?? [];
```

Do not introduce type changes that force useless `{}` arguments at every callsite unless the public API is intentionally changing.

## Examples

### Complete Function File

```ts
import {
  createFunctionReference,
  mutation,
  query,
  v
} from "../_generated/server";

export const listPinned = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("notes").withIndex("by_pinned").order("asc").collect()
});

export const searchNotes = query({
  args: { term: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("notes")
      .withSearchIndex("search_body", (search) =>
        search.search("body", args.term).eq("pinned", false)
      )
      .take(20)
});

export const create = mutation({
  args: { body: v.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("notes", { body: args.body, pinned: false })
});

export const createFromScheduler = mutation({
  args: { body: v.string(), pinned: v.boolean() },
  handler: async (ctx, args) =>
    ctx.db.insert("notes", { body: args.body, pinned: args.pinned })
});

export const scheduleCreateSkip = mutation({
  args: { body: v.string(), delayMs: v.number() },
  handler: async (ctx, args) =>
    ctx.scheduler.runAfter(
      args.delayMs,
      createFunctionReference("mutation", "notes/createFromScheduler"),
      { body: args.body, pinned: false },
      { type: "skip" }
    )
});
```

## Best Practices

- Use `query` for reads, `mutation` for writes, and `action` for side effects
- Import helpers from `../_generated/server` inside function files
- Prefer `v.id("table")` over plain `v.string()` for document ids
- Add `returns` validators where explicit shape matters to callers
- Preserve optional args ergonomics for empty-object validators
- Prefer generated references in app code and explicit references in low-level runtime flows
- Keep type changes aligned across core, codegen, React, and adapters

## Common Pitfalls

1. Using `action` for ordinary database writes that belong in mutations
2. Breaking `useQuery(api.foo.bar)` inference by widening reference types
3. Editing generated API references instead of source function definitions
4. Forgetting that scheduler APIs accept typed function references and optional misfire policies
5. Reaching for plain strings where `v.id("table")` better expresses intent

## References

- `packages/core/src/runtime/functions.ts`
- `packages/core/src/runtime/runtime.ts`
- `packages/schema/src/validators.ts`
- `packages/core/AGENTS.md`
- `examples/expo/syncore/functions/notes.ts`
