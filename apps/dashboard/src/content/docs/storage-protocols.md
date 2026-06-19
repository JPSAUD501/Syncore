# Storage protocols

Syncore can persist your data against different storage backends depending on
which runtime is connected. The protocol shown in the dashboard's data-source
chip tells you **where the bytes actually live** for that target.

## Why more than one protocol?

Local-first apps run on very different environments — a web worker, a main
browser thread, a Node.js server, an Electron main process. Each environment
exposes a different durable storage primitive, so Syncore adapts the backend to
the host instead of forcing a single one.

## The protocols

| Protocol | Host | Backing | Typical use |
| --- | --- | --- | --- |
| `opfs` | Browser (worker/main) | Origin Private File System | A file-backed database local to the browser origin. |
| `indexeddb` | Browser (worker/main) | IndexedDB | A native browser key/value document store. |
| `file` | Node / Electron | A file on disk | A server-side or desktop file-backed database. |

### `opfs` — Origin Private File System

The browser's Origin Private File System. Syncore uses it as a **file-backed
database** private to the origin, which is durable across sessions and survives
page reloads. It's preferred when a worker runtime needs a real file abstraction
rather than a document store.

### `indexeddb` — browser document store

The browser's native indexed key/value store. Syncore models documents on top of
it. It's widely available in workers and the main thread and is the default when
OPFS isn't suitable.

### `file` — Node / Electron database

A database backed by a real file on disk, used by Node.js and Electron
(main-process) runtimes. This is what powers "Project database" and "File
database" labels in the header.

## Related labels in the header

- **Project database** — the shared project target's database (a `file` backend).
- **File database** — a non-project file-backed database.
- **Database** (`db=<label>`) — the logical database label announced by the
  runtime. Multiple data sources can share a host but differ by this label.
- **Data Source id** — a stable public id used to distinguish similar storages
  across sessions even when their labels collide.

## "Storage metadata incomplete"

When the runtime connects without announcing full storage metadata, the
dashboard shows a warning triangle. Some fields (label, protocol, database) may
be unavailable or inferred, so cross-referencing with the runtime itself is
recommended before acting on them.
