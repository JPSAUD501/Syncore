# Schema & documents

Your data model is defined as **schema document types** with typed fields,
references and indexes. The dashboard's Data view renders this model and lets
you inspect documents field by field.

## Ownership (`owner`)

Schema fields and stores have an `owner`:

- **`root`** — owned at the root scope. The field/store lives on the top-level
  schema and is shared across the whole app.
- **`component`** — owned by a component scope. The field/store belongs to an
  installed component and is namespaced under it.

Understanding ownership matters when you see two fields with similar names: one
may be a root field and the other a component-scoped field that happens to share
a name.

## Field kinds

Each value in a document is rendered with an inferred **kind**:

- `string`, `number`, `boolean` — primitives.
- `date` — a timestamp rendered in a readable format.
- `empty` — a field with no value (shown as `—`).
- Color values — a hex color may be rendered with a swatch.
- References — foreign keys to documents in other tables (see below).

## References

A **reference** is a typed foreign key from a document in one table to a
document in another. The document inspector shows the referenced table as a
badge and lets you navigate to the target document.

- **`missing`** badge — the referenced document does not exist (a broken
  reference). This is usually a sign of a deleted document still being pointed
  to, or a reference written before the target existed.

## Indexes

**Indexes** accelerate queries on a table. The Indexes viewer lists the indexed
fields, their ordering and the index type. Indexes trade write cost for read
speed: the more indexes a table has, the faster its indexed queries are — but
mutations that touch indexed fields do more work.

## Where this appears

- The **Schema viewer** shows document types, their fields and types.
- The **Indexes viewer** shows the indexes defined per table.
- The **Document inspector** renders a single document's fields with their
  inferred kinds, references and color swatches.
