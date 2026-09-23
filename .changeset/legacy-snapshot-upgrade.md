---
"@syncore/schema": patch
"@syncore/core": patch
"@syncore/cli": patch
"syncorejs": patch
---

Schema snapshots written by syncorejs < 0.3 are upgraded instead of failing with "Invalid schema snapshot file."

- `migrate status`, `migrate generate`, `doctor`, and `dev` read the old format (format 3 / planner 2) and upgrade it in memory, keeping pending schema changes. `migrate status` prints a notice (`legacySnapshotUpgraded` in `--json` output).
- `doctor` reports the new `snapshot-legacy` state, and `doctor --fix` saves the upgraded snapshot in place. Before, `doctor` blamed the generated schema and `--fix` did nothing.
- A snapshot that cannot be read (invalid JSON, too old, or written by a newer syncorejs) fails with a `validation` error that says which case applies and how to recover, and `doctor` reports `snapshot-invalid`.
- The runtime upgrades schema state stored by syncorejs < 0.3 too, so destructive schema changes are still detected on the first start after upgrading. Before, that check was skipped silently.
- New exports: `readSchemaSnapshot`, `upgradeSchemaSnapshot`, and `SchemaSnapshotFormatError`.
