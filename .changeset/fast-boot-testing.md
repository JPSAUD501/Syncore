---
"@syncore/core": minor
"@syncore/platform-node": minor
"@syncore/cli": patch
"syncorejs": minor
---

Faster startup, a test harness, and scheduler controls.

- New `syncorejs/testing` entry point with `createTestSyncore({ schema, functions })`. It starts an isolated runtime on an in-memory SQLite database with in-memory storage and no devtools, and gives you `query`/`mutation`/`action`, `run(ctx => …)` for seeding and inspecting data with a full mutation context, `runScheduledJobs()`, `finishScheduledJobs()` and `dispose()` (also `await using`). It does not depend on a test runner. See `skills/syncore/references/testing.md`.
- The runtime now prepares the database in a single transaction. On a 6-table schema with indexes and search indexes, a cold boot went from about 116 ms to about 20 ms and a warm boot from about 22 ms to about 3 ms (Node, median of 7 runs), and a boot that fails leaves no half-created tables behind. A warm boot no longer writes anything. In the browser, `start()` now saves the sql.js database once instead of after every boot statement (12 saves to 1 in the test schema).
- Missing FTS5 support is handled inside the boot transaction, so the runtime still boots and falls back to `LIKE` search.
- `scheduler: { autoRun: false }` turns off background polling, and `runtime.getAdmin().runScheduledJobs({ includeFuture?, includeRecurring? })` runs jobs on demand and returns `{ executed, failed }`.
- Scheduler runs no longer overlap. Before, a job that took longer than `pollIntervalMs` could be picked up again by the next tick and run twice. `runtime.stop()` now waits for a job that is running before it closes the database.
- Node runtimes no longer connect to the default devtools URL (`ws://127.0.0.1:4311`) under `NODE_ENV=test` or Vitest, so tests don't retry a server that isn't running. An explicit `devtoolsUrl` or `SYNCORE_DEVTOOLS_URL` still connects. The reconnect timer no longer keeps the process alive.
- The Node and CLI SQLite drivers set `busy_timeout = 5000`, so a second connection (for example the CLI while the app runs) waits for a write lock instead of failing right away with `SQLITE_BUSY`.
- `NodeSqliteDriver` creates the database file's folder when it is missing. Before, a new folder only worked because the devtools setup happened to create it.
- `runtime.start()` failures during database preparation now set the runtime status to `error` and can be retried with another `start()`.
