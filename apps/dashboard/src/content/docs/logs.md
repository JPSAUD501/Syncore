# Logs

The Logs page shows structured log entries emitted by connected runtimes.

## Level

The **Level** column is the severity of an entry:

- `error` — something failed.
- `warn` — something unexpected but non-fatal.
- `info` — informational.
- `debug` / `trace` — verbose diagnostic output (when enabled).

The header shows count chips (**N errors** / **N warnings**) so you can jump
straight to the entries that matter most.

## Scope

The **Scope** column is the logical component or function the entry originated
from. Filtering by scope is the fastest way to narrow logs to a specific part of
your app (for example, a particular mutation or a background task).

## Tips

- Use the level filter to hide `debug`/`trace` noise while triaging.
- Pair scope filtering with the Active Queries page: a failing query's
  **Function** often matches the **Scope** of the erroring log entries.
- The "Hide dashboard events" setting (in Settings) excludes activity that
  originates from the dashboard itself, so the logs reflect only your app.
