---
name: syncore-scheduler-storage
description: Local scheduling, queues, background jobs, reminders, and file storage patterns for Syncore, including recurring jobs, `runAfter`, `runAt`, misfire policies, and storage metadata consistency. Use when building features that depend on durable local jobs, missed-run reconciliation, or device-local file storage.
---

# Syncore Scheduler And Storage

Use this skill when building features that depend on durable local jobs,
missed-run reconciliation, or device-local file storage.

## Documentation Sources

Read these first from the current app or package:

- `syncore/functions/**/*.ts`
- `syncore/_generated/server.ts`
- bootstrap files that configure scheduler or runtime storage
- installed `syncorejs` docs or type declarations

## Instructions

### Scheduler APIs

Mutations and actions can schedule future work through `ctx.scheduler`:

- `runAfter(delayMs, reference, args?, misfirePolicy?)`
- `runAt(timestamp, reference, args?, misfirePolicy?)`
- `cancel(id)`

### Misfire Policies

Common misfire policies include:

- `{ type: "catch_up" }`
- `{ type: "skip" }`
- `{ type: "run_once_if_missed" }`
- `{ type: "windowed", windowMs: number }`

### Scheduling Example

```ts
import { createFunctionReference, mutation, v } from "../_generated/server";

export const scheduleCreateCatchUp = mutation({
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

### Recurring Jobs

When the installed Syncore surface supports recurring jobs, define them through
the scheduler configuration used by the runtime or bootstrap layer.

```ts
import { cronJobs, createFunctionReference } from "syncorejs";

const crons = cronJobs();

crons.interval(
  "create-reminder-note",
  { minutes: 30 },
  createFunctionReference("mutation", "notes/createFromScheduler"),
  { body: "Remember to sync your notes", pinned: false },
  { type: "catch_up" }
);
```

### Storage APIs

Queries, mutations, and actions can use `ctx.storage`:

- `put(...)`
- `get(id)`
- `read(id)`
- `delete(id)`

```ts
import { mutation, query, v } from "../_generated/server";

export const putFile = mutation({
  args: { name: v.string(), body: v.string() },
  handler: async (ctx, args) =>
    ctx.storage.put({
      fileName: args.name,
      contentType: "text/plain",
      data: args.body
    })
});

export const getFile = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const file = await ctx.storage.get(args.id);
    const bytes = await ctx.storage.read(args.id);
    return {
      file,
      body: bytes ? new TextDecoder().decode(bytes) : null
    };
  }
});
```

### Components And Capabilities

If scheduler or storage is used inside a reusable Syncore component, the
component should request and receive the corresponding capability from the host
app.

## Best Practices

- Choose misfire policies deliberately
- Use typed function references for scheduled jobs
- Keep scheduled handlers idempotent where possible
- Configure recurring jobs through explicit runtime or bootstrap setup
- Use the storage API rather than unmanaged side files for app data
- Test restart and offline behavior for features that depend on scheduling or files

## Common Pitfalls

1. Forgetting that jobs may run after restart
2. Scheduling non-idempotent follow-up work without considering retries or restarts
3. Treating file bytes and storage metadata as separate systems instead of one API
4. Assuming recurring jobs are discovered from a magic file automatically
5. Using scheduler or storage inside components without the required capabilities

## References

- `syncore/functions/**/*.ts`
- `syncore/_generated/server.ts`
- runtime or bootstrap files that configure scheduler or storage
