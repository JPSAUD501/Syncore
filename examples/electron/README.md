# Electron example

This example shows the intended desktop setup after the quickstart, with a fuller smoke-tested integration:

- Syncore runtime in the Electron main process
- renderer talks to Syncore through a safe preload bridge
- SQLite and file storage stay local on disk
- optional devtools connection goes to `ws://127.0.0.1:4311`
- the main process uses the short-form `bindElectronWindowToSyncoreRuntime({ ipcMain, ... })` helper

## Files

- [`package.json`](D:\GitHub\Syncore\examples\electron\package.json)
- [`src/main.ts`](D:\GitHub\Syncore\examples\electron\src\main.ts)
- [`src/preload.cjs`](D:\GitHub\Syncore\examples\electron\src\preload.cjs)
- [`src/renderer/App.tsx`](D:\GitHub\Syncore\examples\electron\src\renderer\App.tsx)
- [`syncore/schema.ts`](D:\GitHub\Syncore\examples\electron\syncore\schema.ts)
- [`syncore/functions/tasks.ts`](D:\GitHub\Syncore\examples\electron\syncore\functions\tasks.ts)

The renderer uses `SyncoreElectronProvider`, so app code no longer needs to
manually create and dispose the renderer client.

## Commands

```bash
bun run --filter syncore-example-electron build
bun run --filter syncore-example-electron dev
bun run --filter @syncore/testing test:smoke:electron
```

The smoke test launches the built Electron app, writes local state through the renderer bridge,
restarts the app, and verifies the state is still on disk.
