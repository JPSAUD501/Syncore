# Syncore Scheduler and Storage

## Scheduler APIs

Mutations and actions can schedule future work through `ctx.scheduler`:

- `runAfter(delayMs, reference, args?, misfirePolicy?)`
- `runAt(timestamp, reference, args?, misfirePolicy?)`
- `cancel(id)`

## Misfire Policies

Common misfire policies:

- `{ type: "catch_up" }`
- `{ type: "skip" }`
- `{ type: "run_once_if_missed" }`
- `{ type: "windowed", windowMs: number }`

Choose them deliberately based on what should happen after restart, background,
or missed execution windows.

## Scheduling Example

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

## Recurring Jobs

When the installed Syncore surface supports recurring jobs, define them through
explicit runtime or bootstrap scheduler configuration:

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

Syncore does not auto-discover a magic `syncore/crons.ts` file.

## Storage APIs

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

## Components and Capabilities

If scheduler or storage is used inside a reusable Syncore component, the
component should request and receive the corresponding capability from the host
app.

## Best Practices

- choose misfire policies deliberately
- use typed function refs for scheduled jobs
- keep scheduled handlers idempotent where possible
- configure recurring jobs through explicit runtime or bootstrap setup
- use the storage API rather than unmanaged side files for app data
- test restart and offline behavior for features that depend on scheduling or files
