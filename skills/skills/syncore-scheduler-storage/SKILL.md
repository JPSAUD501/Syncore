---
name: syncore-scheduler-storage
displayName: Syncore Scheduler And Storage
description: Local scheduling and file storage patterns for Syncore, including cron jobs, runAfter, runAt, misfire policies, and storage metadata consistency.
version: 1.0.0
author: Syncore
tags: [syncore, scheduler, storage, cron, offline]
---

# Syncore Scheduler And Storage

Use this skill when building features that depend on durable local jobs, missed-run reconciliation, or device-local file storage.

## Documentation Sources

Read these first:

- `docs/architecture.md`
- `packages/core/src/runtime/functions.ts`
- `packages/core/src/runtime/runtime.ts`
- `packages/testing/src/runtime-contract.test.ts`
- `examples/expo/syncore/functions/notes.ts`

## Instructions

### Scheduler APIs

Mutations and actions can schedule future work through `ctx.scheduler`:

- `runAfter(delayMs, reference, args?, misfirePolicy?)`
- `runAt(timestamp, reference, args?, misfirePolicy?)`
- `cancel(id)`

The scheduler persists jobs locally and reconciles missed executions on restart.

### Misfire Policies

Current misfire policies are:

- `{ type: "catch_up" }`
- `{ type: "skip" }`
- `{ type: "run_once_if_missed" }`
- `{ type: "windowed", windowMs: number }`

Pick the policy based on user expectations after the app has been paused or closed.

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

### Cron Jobs

Use `cronJobs()` to define recurring jobs in `syncore/crons.ts`:

```ts
import { cronJobs, createFunctionReference } from "syncore";

const crons = cronJobs();

crons.interval(
  "create-reminder-note",
  { minutes: 30 },
  createFunctionReference("mutation", "notes/createFromScheduler"),
  { body: "Remember to sync your notes", pinned: false },
  { type: "catch_up" }
);

export default crons;
```

### Storage APIs

Queries and mutations can use `ctx.storage`:

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

### Local Consistency Model

Syncore's storage and scheduler are designed for local durability:

- scheduled jobs are persisted in SQLite
- missed jobs are reconciled on restart according to the policy
- storage metadata is tracked in system tables
- startup cleanup removes pending or orphaned storage artifacts

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
- Use storage metadata APIs rather than writing unmanaged files beside Syncore's storage directory
- Test restart and offline behavior for features that depend on scheduling or files

## Common Pitfalls

1. Forgetting that jobs may run after restart and need sensible misfire behavior
2. Scheduling non-idempotent follow-up work without considering retries or restarts
3. Treating file bytes and storage metadata as separate systems instead of one API
4. Testing only the happy path and missing restart recovery behavior

## References

- `docs/architecture.md`
- `packages/core/src/runtime/functions.ts`
- `packages/core/src/runtime/runtime.ts`
- `packages/testing/src/runtime-contract.test.ts`
