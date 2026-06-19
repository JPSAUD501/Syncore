# Active queries

The Active Queries page shows every **live query subscription** currently held
open by connected runtimes. Each row is a running or recently-completed query
execution.

## Status

| Status | Meaning |
| --- | --- |
| `running` | The query is currently executing. |
| `done` | The query completed successfully. |
| `error` | The query failed during execution. |
| `cancelled` | The query was cancelled before completing. |

A query that is `running` for a long time is worth investigating — it may be
scanning un-indexed data or blocked behind a slow mutation.

## Columns

- **Duration** — how long the query took (or has been taking, if still running).
  Long durations relative to other queries usually point to a missing index or
  an expensive scan.
- **Rows** — the number of rows/documents the query returned. A query returning
  far more rows than expected may have an over-broad filter.
- **Function** — the query function this execution belongs to.
- **Query ID** — the unique id of this subscription/execution.

## Why a query re-runs

A live query re-runs whenever an [invalidation](/docs/change-reasons) affects
the data it reads. If you see the same query executing repeatedly, check the
activity feed for the change reason driving the invalidation.
