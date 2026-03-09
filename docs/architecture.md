# Architecture

## Goals

Syncore provides a Convex-like developer experience for apps that run 100% locally:

- reactive `query`
- transactional `mutation`
- side-effectful `action`
- schema, indexes, and migrations
- local scheduler with explicit missed-run policies
- local file storage with metadata
- devtools protocol and dashboard

## Runtime model

`syncore` owns the product logic:

- function registration and typed references
- argument and return validation
- query dependency tracking
- invalidation and reruns after writes
- scheduler persistence and missed-run reconciliation
- storage metadata tables
- devtools events and snapshots

Platform adapters only provide environment-specific IO:

- SQLite driver
- filesystem or storage APIs
- timers and lifecycle hooks
- transport to UI or devtools

This keeps user functions portable while allowing platform-specific implementations where needed.

Current adapter direction:

- Node/Electron: native SQLite + real filesystem
- Web: dedicated worker + SQLite WASM with selectable OPFS or IndexedDB persistence
- Expo: `expo-sqlite` plus device-local file storage

## Storage model

Each user table is stored as:

- `_id`
- `_creationTime`
- `_json`

Indexes are created over JSON expressions. Search indexes use FTS5 when available and degrade to `LIKE` matching when the runtime SQLite build does not expose FTS5.

System tables currently include:

- `_syncore_migrations`
- `_syncore_schema_state`
- `_storage`
- `_storage_pending`
- `_scheduled_functions`

Storage recovery is two-layered:

- pending metadata rows are cleaned on startup
- orphaned physical files are removed when they do not have committed metadata

This keeps local file storage consistent even if the app dies between the physical write and the final metadata commit.

## Scheduler model

The scheduler is durable within the limits of a local app runtime:

- jobs are persisted in SQLite
- when the app is alive, due jobs run from the polling loop
- when the app restarts, missed jobs are reconciled

Misfire policies are explicit:

- `catch_up`
- `skip`
- `run_once_if_missed`
- `windowed`

## Devtools model

The dashboard is a dev-only surface. Runtimes emit protocol events to a local hub and the dashboard subscribes to the same event stream. Production builds should not include the dashboard codepath.

`syncorejs dev` is the development entrypoint. It:

- regenerates typed files
- validates schema drift
- applies local migrations
- starts the devtools hub
- starts the dashboard shell when available
- watches project inputs and reruns bootstrap work on changes

`syncorejs codegen` is intentionally narrower: it only refreshes generated API files and skips the rest of the local dev bootstrap work.

## Reference policy

`./reference/Convex` remains in this repository during development and is consulted continuously for architecture and DX decisions. Syncore stays a clean implementation designed for local runtimes.
