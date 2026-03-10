# Next PWA example

This example now treats Next as the shell for a fuller Syncore-powered planner workspace:

- first visit installs the app shell for offline reloads
- Syncore runs in a dedicated browser worker
- SQLite persists locally through `sql.js`
- planner artifacts are written through Syncore storage APIs
- reminders use the local Syncore scheduler
- the UI exercises `useQuery`, `useMutation`, and `useAction`

The product is intentionally local-first and product-led: no hosted backend, no
technical runtime panel, just a planner that keeps working on-device.

## Important

When using `syncorejs/browser` with `sql.js`, the app must serve `sql-wasm.wasm`.
The helper below copies it into `public/sql-wasm.wasm`:

```bash
bun run --filter syncore-example-next-pwa copy:sqljs-wasm
```

Useful commands:

```bash
bun run --filter syncore-example-next-pwa dev
bun run --filter syncore-example-next-pwa test
bun run --filter syncore-example-next-pwa build
bun run --filter syncore-example-next-pwa clean
```
