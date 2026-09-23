# @syncore/schema

## 0.3.0

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

- a9b4335: Schema snapshots written by syncorejs < 0.3 are upgraded instead of failing with "Invalid schema snapshot file."
  - `migrate status`, `migrate generate`, `doctor`, and `dev` read the old format (format 3 / planner 2) and upgrade it in memory, keeping pending schema changes. `migrate status` prints a notice (`legacySnapshotUpgraded` in `--json` output).
  - `doctor` reports the new `snapshot-legacy` state, and `doctor --fix` saves the upgraded snapshot in place. Before, `doctor` blamed the generated schema and `--fix` did nothing.
  - A snapshot that cannot be read (invalid JSON, too old, or written by a newer syncorejs) fails with a `validation` error that says which case applies and how to recover, and `doctor` reports `snapshot-invalid`.
  - The runtime upgrades schema state stored by syncorejs < 0.3 too, so destructive schema changes are still detected on the first start after upgrading. Before, that check was skipped silently.
  - New exports: `readSchemaSnapshot`, `upgradeSchemaSnapshot`, and `SchemaSnapshotFormatError`.

## 0.2.0

### Minor Changes

- 47b6b6e: Improvements
