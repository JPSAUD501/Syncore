# Next PWA example

This example now treats Next as the shell for a fuller Syncore-powered planner workspace:

- first visit installs the app shell for offline reloads
- Syncore runs in a dedicated browser worker
- SQLite persists locally through the Syncore web adapter
- planner artifacts are written through Syncore storage APIs
- reminders use the local Syncore scheduler
- the UI exercises `useQuery`, `useMutation`, and `useAction`

The product is intentionally local-first and product-led: no hosted backend, no
technical runtime panel, just a planner that keeps working on-device.

Useful commands:

```bash
npm run dev --workspace syncore-example-next-pwa
npm run test --workspace syncore-example-next-pwa
npm run build --workspace syncore-example-next-pwa
npm run clean --workspace syncore-example-next-pwa
```
