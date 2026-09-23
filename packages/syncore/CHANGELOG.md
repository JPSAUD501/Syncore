# syncorejs

## 0.4.0

### Minor Changes

- 13f9d80: Object validators now reject fields they do not declare, instead of dropping them silently.
  - Function `args`, `returns`, and `ctx.db.insert/patch/replace` throw a `SyncoreValidationError` (`code: "unknown_field"`) that names the field and the function or table, e.g. `Invalid arguments for mutation "settings/update": args.theme2 is not an allowed field (expected one of: theme, zoom).` Use `isSyncoreValidationError(error)` to check for it, including after it crossed a worker or IPC boundary.
  - New helpers on object validators: `extend`, `pick`, `omit`, and `partial`, so function args can be derived from a table (`schema.tables.settings.validator.omit("key").partial()`) instead of repeating its shape. `withoutSystemFields(doc)` removes `_id` and `_creationTime` from a document.
  - Optional args may be omitted or passed as `undefined` (`InferObjectInput`).
  - Reads stay lenient: stored fields that are no longer in the schema are dropped when read and removed on the next write. Unions read a stored value as the member that matches it exactly.
  - Recurring jobs pick up changed args, targets, and schedules on the next start, and a failing recurring job moves on to its next run instead of stopping.
  - Component config is stored as parsed, `syncorejs import` reports the line of an invalid document and stores codec fields correctly, and the dashboard no longer offers to re-run a function from truncated args.

  ## Breaking changes / Migration
  - A call with an extra argument now fails. Remove the field from the call, or add it to `args`.
  - A `returns` validator for documents read from the database must declare `_id` and `_creationTime`: `schema.tables.tasks.validator.extend({ _id: s.id("tasks"), _creationTime: s.number() })`.
  - `ctx.db.insert` rejects `_id` and `_creationTime`; pass `withoutSystemFields(doc)` when copying a document. `patch` and `replace` accept them only when they equal the stored values.
  - To keep the old behaviour for a specific object, opt out with `s.object(shape, { unknownKeys: "strip" })`.

### Patch Changes

- 76f48b7: Faster startup, a test harness, and scheduler controls.
  - New `syncorejs/testing` entry point with `createTestSyncore({ schema, functions })`. It starts an isolated runtime on an in-memory SQLite database with in-memory storage and no devtools, and gives you `query`/`mutation`/`action`, `run(ctx => …)` for seeding and inspecting data with a full mutation context, `runScheduledJobs()`, `finishScheduledJobs()` and `dispose()` (also `await using`). It does not depend on a test runner. See `skills/syncore/references/testing.md`.
  - The runtime now prepares the database in a single transaction. On a 6-table schema with indexes and search indexes, a cold boot went from about 116 ms to about 20 ms and a warm boot from about 22 ms to about 3 ms (Node, median of 7 runs), and a boot that fails leaves no half-created tables behind. A warm boot no longer writes anything. In the browser, `start()` now saves the sql.js database once instead of after every boot statement (12 saves to 1 in the test schema).
  - Missing FTS5 support is handled inside the boot transaction, so the runtime still boots and falls back to `LIKE` search.
  - `scheduler: { autoRun: false }` turns off background polling, and `runtime.getAdmin().runScheduledJobs({ includeFuture?, includeRecurring? })` runs jobs on demand and returns `{ executed, failed }`.
  - Scheduler runs no longer overlap. Before, a job that took longer than `pollIntervalMs` could be picked up again by the next tick and run twice. `runtime.stop()` now waits for a job that is running before it closes the database.
  - Node runtimes no longer connect to the default devtools URL (`ws://127.0.0.1:4311`) under `NODE_ENV=test` or Vitest, so tests don't retry a server that isn't running. An explicit `devtoolsUrl` or `SYNCORE_DEVTOOLS_URL` still connects. The reconnect timer no longer keeps the process alive.
  - The Node and CLI SQLite drivers set `busy_timeout = 5000`, so a second connection (for example the CLI while the app runs) waits for a write lock instead of failing right away with `SQLITE_BUSY`.
  - `NodeSqliteDriver` creates the database file's folder when it is missing. Before, a new folder only worked because the devtools setup happened to create it.
  - `runtime.start()` failures during database preparation now set the runtime status to `error` and can be retried with another `start()`.

- a9b4335: Schema snapshots written by syncorejs < 0.3 are upgraded instead of failing with "Invalid schema snapshot file."
  - `migrate status`, `migrate generate`, `doctor`, and `dev` read the old format (format 3 / planner 2) and upgrade it in memory, keeping pending schema changes. `migrate status` prints a notice (`legacySnapshotUpgraded` in `--json` output).
  - `doctor` reports the new `snapshot-legacy` state, and `doctor --fix` saves the upgraded snapshot in place. Before, `doctor` blamed the generated schema and `--fix` did nothing.
  - A snapshot that cannot be read (invalid JSON, too old, or written by a newer syncorejs) fails with a `validation` error that says which case applies and how to recover, and `doctor` reports `snapshot-invalid`.
  - The runtime upgrades schema state stored by syncorejs < 0.3 too, so destructive schema changes are still detected on the first start after upgrading. Before, that check was skipped silently.
  - New exports: `readSchemaSnapshot`, `upgradeSchemaSnapshot`, and `SchemaSnapshotFormatError`.

- 6b781ec: Browser runtimes using OPFS persistence no longer fail to start after a page reload interrupts a file write. An empty `.meta.json` left by the interrupted write made every later boot throw `Unexpected end of JSON input`; the metadata is now treated as missing and the file is still readable.

## 0.3.3

### Patch Changes

- cd005e3: Authenticate local CLI hub connections with the active devtools session token so targets, doctor, and remote commands can discover connected client runtimes.

## 0.3.2

### Patch Changes

- d79e743: Normalize boolean SQL parameters to SQLite integer bindings in the Node runtime.

## 0.3.1

### Patch Changes

- 12e06a4: Keep the Electron renderer client alive during React Strict Mode effect replay, share it safely across providers in the same renderer window, and derive the CLI version from package metadata.

## 0.3.0

### Minor Changes

- 47b6b6e: Schema migrations now describe each change, and Electron apps get a one-call setup. (This entry was rewritten after the release; it originally said only "Improvements".)
  - `migrate status` and `migrate generate` report structured changes (tables, fields and indexes added, removed or changed) with a severity, and the generated SQL includes them.
  - `createElectronSyncoreApp` in `syncorejs/node/ipc` sets up the runtime, IPC bridge and window binding for an Electron main process.
  - `Doc`, `DocInput`, `DocPatch`, `PatchValue` and `PatchValueForTable` are exported from `syncorejs`.

  ### Breaking changes
  - Schema snapshots (`syncore/migrations/_schema_snapshot.json`) moved to format version 4 (planner version 3). Snapshots written by syncorejs 0.2.x are rejected with `Invalid schema snapshot file.`, and the runtime stops comparing against schema state stored by 0.2.x.

## 0.2.8

### Patch Changes

- Fix packaged dashboard root resolution for CLI runtime startup.

## 0.2.7

### Patch Changes

- Fix the release workflow configuration so Syncore publishes through Changesets.

## 0.2.6

### Patch Changes

- Auto-generated patch release for published Syncore package changes.

## 0.2.5

### Patch Changes

- Auto-generated patch release for published Syncore package changes.

## 0.2.4

### Patch Changes

- Auto-generated patch release for published Syncore package changes.

## 0.2.3

### Patch Changes

- Auto-generated patch release for published Syncore package changes.

## 0.2.2

### Patch Changes

- Publish the accumulated Syncore package changes since `0.2.1`.

## 0.2.1

### Patch Changes

- Patch release for repository maintenance updates that improve CI, release
  automation, and published-package validation.

## 0.2.0

### Minor Changes

- 54a644d: Prepare the first public `syncorejs` npm release with a single-package distribution,
  CLI entrypoint, and validated subpath exports for browser, React, Node, Next,
  Expo, and Svelte consumers.
