# Next PWA example

This example treats Next as the application shell and client runtime host after you have the quickstart flow working:

- first visit downloads the app
- a service worker keeps assets available offline
- Syncore runtime lives in a dedicated worker
- SQLite runs via `sql.js`
- database and file blobs stay local in browser storage

The example intentionally keeps the UI small and focuses on wiring and expectations.

It uses the short-form `SyncoreNextProvider` directly in the page tree instead of
adding extra local provider boilerplate.

## Important

When using `syncorejs/browser` with `sql.js`, the app must serve `sql-wasm.wasm`.
The simplest setup is copying `node_modules/sql.js/dist/sql-wasm.wasm` into `public/sql-wasm.wasm`.

This example includes a helper script for that:

```bash
bun run --filter syncore-example-next-pwa copy:sqljs-wasm
```

Useful commands:

```bash
bun run --filter syncore-example-next-pwa dev
bun run --filter syncore-example-next-pwa build
bun run --filter syncore-example-next-pwa clean
```
