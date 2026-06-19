# Reactivity & invalidation

Syncore keeps query results and the dashboard in sync with the authoritative
storage. Every time the underlying data changes, an **invalidation** is emitted
describing *why* it changed and *what* it affects.

## Change reasons

The `reason` on a change/invalidation event explains the cause:

| Reason | Meaning |
| --- | --- |
| `commit` | A transaction was committed, producing document changes. |
| `storage-put` | A key/value storage item was written. |
| `storage-delete` | A key/value storage item was deleted. |
| `reconcile` | The local cache was reconciled against the authoritative store. |

`commit` is by far the most common during normal app usage — it's what fires
when a mutation runs. The `storage-*` reasons relate to the separate key/value
storage layer, and `reconcile` fires when the runtime realigns its cache after a
reconnect or divergence.

> The wire `reason` field is typed as a free-form `string`, but these are the
> canonical values the runtime emits.

## Invalidation scope

Invalidations are scoped to limit unnecessary recomputation:

| Scope | Affects |
| --- | --- |
| `database` | Only the document database (queries over documents). |
| `storage` | Only the key/value storage layer. |
| `all` | Both the database and storage. |

Most document changes are `database`-scoped; storage operations are
`storage`-scoped; structural or cross-layer changes can be `all`.

## How this shows up in the dashboard

The activity feed, active queries and data browser all react to these events.
When you see a row "flash" or refresh, it's usually a `commit` with
`database` scope invalidating the relevant query. Understanding the reason helps
you trace *why* a query re-ran, which is especially useful when debugging
unexpected reactivity loops.
