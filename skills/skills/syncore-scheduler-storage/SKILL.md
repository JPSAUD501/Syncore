---
name: syncore-scheduler-storage
description: Local scheduling and file storage patterns for Syncore, including recurring jobs, runAfter, runAt, misfire policies, and storage metadata consistency. Use when building features that depend on durable local jobs, missed-run reconciliation, or device-local file storage.
---

# Syncore Scheduler And Storage

Use this skill when building features that depend on durable local jobs,
missed-run reconciliation, or device-local file storage.

## Documentation Sources

Read these first:

- `docs/architecture.md`
- `packages/core/src/runtime/functions.ts`
- `packages/core/src/runtime/runtime.ts`
- `packages/testing/src/runtime-contract.test.ts`
- `examples/expo/lib/syncore.ts`
- `examples/expo/syncore/functions/notes.ts`

## Instructions

### Scheduler APIs

Mutations and actions can schedule future work through `ctx.scheduler`:

- `runAfter(delayMs, reference, args?, misfirePolicy?)`
- `runAt(timestamp, reference, args?, misfirePolicy?)`
- `cancel(id)`

The scheduler persists jobs locally and reconciles missed executions on
restart.

### Misfire Policies

Current misfire policies are:

- `{ type: "catch_up" }`
- `{ type: "skip" }`
- `{ type: "run_once_if_missed" }`
- `{ type: "windowed", windowMs: number }`

Pick the policy based on user expectations after the app has been paused or
closed.

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

Use `cronJobs()` to build a recurring job registry, then pass its `jobs` array
into runtime or bootstrap `scheduler.recurringJobs`.

Available helpers are:

- `crons.interval(...)`
- `crons.daily(...)`
- `crons.weekly(...)`

Syncore currently does not auto-load a special `syncore/crons.ts` file.

```ts
import { createExpoSyncoreBootstrap } from "syncorejs/expo";
import { cronJobs, createFunctionReference } from "syncorejs";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

const crons = cronJobs();

crons.interval(
  "create-reminder-note",
  { minutes: 30 },
  createFunctionReference("mutation", "notes/createFromScheduler"),
  { body: "Remember to sync your notes", pinned: false },
  { type: "catch_up" }
);

export const syncore = createExpoSyncoreBootstrap({
  schema,
  functions,
  scheduler: {
    recurringJobs: crons.jobs,
    pollIntervalMs: 25
  }
});
```

### Storage APIs

Queries, mutations, and actions can use `ctx.storage`:

- `put(...)`
- `get(id)`
- `read(id)`
- `delete(id)`

`put(...)` returns the generated storage id.

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

### Local Consistency Model

Syncore's storage and scheduler are designed for local durability:

- scheduled jobs are persisted in SQLite
- missed jobs are reconciled on restart according to the policy
- storage metadata is tracked in system tables
- orphan cleanup depends on adapter capabilities; adapters that implement `storage.list()` allow fuller reconciliation

## Examples

### Which Misfire Policy To Use

- reminder that must always happen -> `catch_up`
- stale notification that should be dropped -> `skip`
- at-most-once recovery flow -> `run_once_if_missed`
- deadline-sensitive job with tolerance -> `windowed`

## Best Practices

- Choose misfire policies deliberately instead of accepting defaults blindly
- Use typed function references for scheduled jobs
- Keep scheduled handlers idempotent where possible
- Pass recurring jobs through runtime or bootstrap scheduler options instead of assuming a magic file loader
- Use storage metadata APIs rather than writing unmanaged files beside Syncore's storage directory
- Test restart and offline behavior for features that depend on scheduling or files

## Common Pitfalls

1. Forgetting that jobs may run after restart and need sensible misfire behavior
2. Scheduling non-idempotent follow-up work without considering retries or restarts
3. Treating file bytes and storage metadata as separate systems instead of one API
4. Assuming recurring jobs are discovered from `syncore/crons.ts` automatically
5. Testing only the happy path and missing restart recovery behavior

## References

- `docs/architecture.md`
- `packages/core/src/runtime/functions.ts`
- `packages/core/src/runtime/runtime.ts`
- `packages/testing/src/runtime-contract.test.ts`
