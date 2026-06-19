# Runtime & targets

The dashboard lets you inspect and command **runtimes** and switch between
**data sources**. These concepts are central to understanding everything else in
the UI.

## Runtime

A **runtime** is a live instance of your application connected to the devtools
hub over WebSocket. A single project can have several runtimes connected at once
(for example, multiple browser tabs, or a worker plus a main thread).

### Platform values

The `platform` field describes the host environment:

| Platform | Meaning |
| --- | --- |
| `browser-worker` | The runtime lives inside a Web Worker. |
| `browser` | The runtime runs on the browser main thread. |
| `node` | A Node.js runtime (server, CLI, script). |
| `electron-main` | An Electron main-process runtime. |

### Runtime session & id

- **Runtime session** — the human label for the connected session, often
  including a parsed browser suffix (e.g. `MyApp (Chrome)`).
- **Runtime id** — a stable public id used to distinguish runtimes on the same
  data source, even across reconnects.
- **Browser** — the browser or host family parsed from the session label.

### Connection

A runtime can be **connected** (live WebSocket to the hub) or **disconnected**.
The dashboard can still show the last-known state of a disconnected runtime, but
commands can only run against connected ones.

## Data source

A **data source** is a logical storage target that one or more runtimes share.
The header's context switcher lets you pick which data source the dashboard is
operating on.

### Client vs project targets (`targetKind`)

Each target has a `targetKind`:

- **`client`** (shown as `T<id>`) — a per-runtime client target. Each runtime
  has its own client target; choosing one scopes activity to that runtime.
- **`project`** (shown as `Project`) — a shared project-level target that all
  client runtimes on the same data source can use.

> When a project target exists, the app is considered **offline-capable**:
  the project target can persist data even when individual clients disconnect.

### Runtime roles (`runtimeRole`)

- **`app`** — a runtime running your application code.
- **`project-target`** — a runtime hosting the shared project target. It is
  administrative: it owns the canonical storage for the data source.

### The "Project" badge

A runtime tagged **Project** is a **Project Target runtime** — the local
administrative runtime that owns project-level capabilities and the canonical
storage. Distinguishing it from regular `app` runtimes matters when you need to
know which side is the source of truth.

## "All runtimes" and the Executor

When a data source has multiple runtimes, you can select **All runtimes** to see
activity from every runtime at once. While in that mode, **commands** (queries,
mutations, etc.) still need a single runtime to run through — that's the
**Executor**.

- **Executor** — the runtime commands will actually run through while
  "All runtimes" is selected. The dashboard picks a sensible default (usually
  the active runtime), but you can override it with **"Use as executor"**.

## SQL capability

A runtime may show a **SQL** badge when it supports read SQL Console commands.
The SQL Console route only appears in the sidebar when the selected target
announces `sqlAvailable`.
