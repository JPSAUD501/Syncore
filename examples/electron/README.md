# Electron example

This example shows the intended desktop setup after the quickstart, with a fuller smoke-tested integration:

- Syncore runtime in the Electron main process
- renderer talks to Syncore through a safe preload bridge
- SQLite and file storage stay local on disk
- optional devtools connection goes to `ws://127.0.0.1:4311`
- the main process uses the short-form `bindElectronWindowToSyncoreRuntime({ ipcMain, ... })` helper

## Files

- [`package.json`](package.json)
- [`src/main.ts`](src/main.ts)
- [`src/preload.cjs`](src/preload.cjs)
- [`src/renderer/App.tsx`](src/renderer/App.tsx)
- [`syncore/schema.ts`](syncore/schema.ts)
- [`syncore/functions/entries.ts`](syncore/functions/entries.ts)

The renderer uses `SyncoreElectronProvider`, so app code no longer needs to
manually create and dispose the renderer client.

## Commands

```bash
npm run build --workspace syncore-example-electron
npm run dev --workspace syncore-example-electron
npm run test:smoke:electron --workspace @syncore/testing
```

The smoke test launches the built Electron app, writes local state through the renderer bridge,
restarts the app, and verifies the state is still on disk.
