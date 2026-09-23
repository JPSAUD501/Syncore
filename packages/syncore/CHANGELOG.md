# syncorejs

## 0.3.3

### Patch Changes

- cd005e3: Authenticate local CLI hub connections with the active devtools session token so targets, doctor, and remote commands can discover connected client runtimes.

## 0.3.2

### Patch Changes

- d79e743: Normalize boolean SQL parameters to SQLite integer bindings in the Node runtime.

## 0.3.1

### Patch Changes

- 12e06a4: Keep the Electron renderer client alive during React Strict Mode effect replay, share it safely across providers in the same renderer window, and derive the CLI version from package metadata.

## 0.3.0

### Minor Changes

- 47b6b6e: Schema migrations now describe each change, and Electron apps get a one-call setup. (This entry was rewritten after the release; it originally said only "Improvements".)

  - `migrate status` and `migrate generate` report structured changes (tables, fields and indexes added, removed or changed) with a severity, and the generated SQL includes them.
  - `createElectronSyncoreApp` in `syncorejs/node/ipc` sets up the runtime, IPC bridge and window binding for an Electron main process.
  - `Doc`, `DocInput`, `DocPatch`, `PatchValue` and `PatchValueForTable` are exported from `syncorejs`.

  ### Breaking changes

  - Schema snapshots (`syncore/migrations/_schema_snapshot.json`) moved to format version 4 (planner version 3). Snapshots written by syncorejs 0.2.x are rejected with `Invalid schema snapshot file.`, and the runtime stops comparing against schema state stored by 0.2.x.

## 0.2.8

### Patch Changes

- Fix packaged dashboard root resolution for CLI runtime startup.

## 0.2.7

### Patch Changes

- Fix the release workflow configuration so Syncore publishes through Changesets.

## 0.2.6

### Patch Changes

- Auto-generated patch release for published Syncore package changes.

## 0.2.5

### Patch Changes

- Auto-generated patch release for published Syncore package changes.

## 0.2.4

### Patch Changes

- Auto-generated patch release for published Syncore package changes.

## 0.2.3

### Patch Changes

- Auto-generated patch release for published Syncore package changes.

## 0.2.2

### Patch Changes

- Publish the accumulated Syncore package changes since `0.2.1`.

## 0.2.1

### Patch Changes

- Patch release for repository maintenance updates that improve CI, release
  automation, and published-package validation.

## 0.2.0

### Minor Changes

- 54a644d: Prepare the first public `syncorejs` npm release with a single-package distribution,
  CLI entrypoint, and validated subpath exports for browser, React, Node, Next,
  Expo, and Svelte consumers.
