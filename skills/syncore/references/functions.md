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

## Prefer Strong Validators

Prefer table-aware ids over plain strings:

```ts
args: {
  id: s.id("tasks"),
  done: s.boolean()
}
```

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
`withSearchIndex(...)`.

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
- add `returns` validators where explicit shape matters to callers
- prefer generated refs over handwritten strings or casts

## Common Pitfalls

1. using `action` for database writes that belong in mutations
2. widening types and breaking `useQuery(api.foo.bar)` inference
3. editing generated API refs instead of source definitions
4. forgetting that scheduled jobs should use typed refs
5. using plain strings where `s.id("table")` better expresses intent
