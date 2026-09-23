# Testing Syncore Apps

Use `createTestSyncore` from `syncorejs/testing` to test functions against a
real runtime. Each call starts an isolated runtime with:

- an in-memory SQLite database (`node:sqlite`, so Node 22+),
- in-memory file storage,
- no devtools connection,
- a scheduler that runs jobs only when the test asks.

It does not depend on a test runner, so it works with Vitest, Jest or
`node:test`.

## Basic Test

```ts
import { expect, test } from "vitest";
import { createTestSyncore } from "syncorejs/testing";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";
import { api } from "../syncore/_generated/api";

test("creates a task", async () => {
  await using t = await createTestSyncore({ schema, functions });

  await t.mutation(api.tasks.create, { text: "Write tests" });

  expect(await t.query(api.tasks.list)).toMatchObject([
    { text: "Write tests" }
  ]);
});
```

`await using` disposes the runtime when the test ends. Without it, call
`await t.dispose()` yourself (for example in `afterEach`).

Pass `components` when the app installs Syncore components, and
`capabilities` for values your handlers read from `ctx.capabilities`.

## Seeding and Inspecting Data

`t.run(callback)` runs the callback inside a mutation with the full
`MutationCtx` (`ctx.db`, `ctx.storage`, `ctx.scheduler`). Use it for setup and
for checks that no public function exposes:

```ts
const id = await t.run((ctx) =>
  ctx.db.insert("tasks", { text: "seeded", done: false })
);
const doc = await t.run((ctx) => ctx.db.get("tasks", id));
```

If the callback throws, its writes are rolled back.

## Scheduled Jobs

Jobs never run on their own inside a test harness.

- `t.runScheduledJobs()` runs the jobs that are due now and returns
  `{ executed, failed }`. It reads `Date.now()`, so fake timers work: move the
  clock with `vi.setSystemTime(...)`, then call it.
- `t.finishScheduledJobs()` runs every pending one-off job, including jobs
  scheduled for later and jobs those jobs schedule, until none are left. It
  throws after `maxIterations` passes (default 100) so a job that keeps
  rescheduling itself fails the test instead of hanging it.
- Recurring jobs (`recurringJobs` option) only run through
  `t.runScheduledJobs({ includeFuture: true })`, once per call.

```ts
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-01-01T09:00:00Z"));
await t.mutation(api.reminders.scheduleIn, { minutes: 5 });

vi.setSystemTime(new Date("2026-01-01T09:05:00Z"));
expect(await t.runScheduledJobs()).toEqual({ executed: 1, failed: 0 });
```

## Testing Without the Harness

If a test needs a real database file or a custom driver, build the runtime
yourself and keep it quiet and deterministic:

- set `scheduler: { autoRun: false }` and call
  `runtime.getAdmin().runScheduledJobs()`,
- pass `devtools: false` to `createNodeSyncoreRuntime`. Under `NODE_ENV=test`
  or Vitest the default devtools URL is already skipped; an explicit
  `devtoolsUrl` or `SYNCORE_DEVTOOLS_URL` still connects.
