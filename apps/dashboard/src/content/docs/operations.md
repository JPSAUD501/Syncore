# Operations

When data changes, the dashboard shows the **operation** that produced the
change. There are two families: **mutation operations** on documents, and
**storage operations** on key/value items.

## Mutation operations

These appear in the Data view's change log and the document change preview.
They describe how a single document was modified within a transaction.

| Operation | Effect |
| --- | --- |
| `insert` | A new document was created. |
| `patch` | An existing document was partially updated (some fields changed). |
| `replace` | An entire document was replaced wholesale. |
| `delete` | A document was removed. |

`patch` vs `replace` is the distinction worth remembering: a `patch` changes
only the specified fields, while a `replace` overwrites the whole document.

## Storage operations

These appear in the Storage view and describe changes to the separate key/value
storage layer (not the document database).

| Operation | Effect |
| --- | --- |
| `put` | A key/value item was written (created or overwritten). |
| `delete` | A key/value item was removed. |

Storage is a simpler model than documents: opaque keys and values, no schema,
no references. It's used for blobs, caches and other data that doesn't fit the
document model.

## Relation to change reasons

Storage operations are the cause behind the `storage-put` and `storage-delete`
[change reasons](/docs/change-reasons); document mutations are the cause behind
`commit`. Seeing an operation code tells you the *what*, while the change reason
tells you the *why* at the reactivity level.
