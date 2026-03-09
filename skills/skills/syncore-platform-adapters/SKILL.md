---
name: syncore-platform-adapters
displayName: Syncore Platform Adapters
description: Integration patterns for Syncore across Node scripts, Electron, browser workers, Expo, Next PWA, and Svelte while preserving typed client references and local runtime behavior.
version: 1.1.0
author: Syncore
tags: [syncore, platform, electron, web, expo, next]
---

# Syncore Platform Adapters

Use this skill when wiring Syncore into a concrete runtime environment or debugging adapter-specific DX and transport behavior.

## Documentation Sources

Read these first:

- `docs/quickstarts/node-script.md`
- `docs/quickstarts/electron.md`
- `docs/quickstarts/react-web.md`
- `docs/quickstarts/expo.md`
- `docs/quickstarts/next-pwa.md`
- `docs/guides/syncore-vs-convex.md`
- `packages/platform-node/AGENTS.md`
- `packages/platform-web/AGENTS.md`
- `packages/platform-expo/src/index.ts`
- `packages/platform-node/src/index.ts`
- `packages/platform-node/src/ipc-react.tsx`
- `packages/platform-web/src/react.tsx`
- `packages/platform-web/src/worker.ts`
- `packages/next/src/index.tsx`
- `packages/next/src/config.ts`
- `packages/svelte/src/index.ts`
- `examples/browser-esm/main.ts`
- `examples/sveltekit/package.json`

## Instructions

### Core Rule

The Syncore runtime stays local. Adapters only provide environment-specific IO:

- SQLite access
- filesystem or storage APIs
- transport to UI layers
- timers and lifecycle hooks

Keep user functions portable and adapter setup specific.

### Prefer Public Entry Points In App Docs

For app-facing setup, prefer the public `syncore/*` surface:

- `syncore/node`
- `syncore/node/ipc`
- `syncore/node/ipc/react`
- `syncore/browser`
- `syncore/browser/react`
- `syncore/expo`
- `syncore/expo/react`
- `syncore/next`
- `syncore/next/config`
- `syncore/svelte`

Use `@syncore/*` packages mainly when editing the monorepo internals themselves.

### Node Script

For local scripts without a UI shell, use `withNodeSyncoreClient`:

```ts
import path from "node:path";
import { withNodeSyncoreClient } from "syncore/node";
import { api } from "./syncore/_generated/api.ts";
import schema from "./syncore/schema.ts";
import { functions } from "./syncore/_generated/functions.ts";

await withNodeSyncoreClient(
  {
    databasePath: path.join(process.cwd(), ".syncore", "syncore.db"),
    storageDirectory: path.join(process.cwd(), ".syncore", "storage"),
    schema,
    functions
  },
  async (client) => {
    console.log(await client.query(api.tasks.list));
  }
);
```

### Electron

Run Syncore in the main process and expose a narrow bridge to the renderer.

```ts
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  bindElectronWindowToSyncoreRuntime,
  createNodeSyncoreRuntime
} from "syncore/node";
import schema from "../syncore/schema.js";
import { functions } from "../syncore/_generated/functions.js";

const runtime = createNodeSyncoreRuntime({
  databasePath: path.join(app.getPath("userData"), "syncore.db"),
  storageDirectory: path.join(app.getPath("userData"), "storage"),
  schema,
  functions,
  platform: "electron-main"
});
```

In the renderer, use `SyncoreElectronProvider` from `syncore/node/ipc/react`. Keep the preload bridge narrow with `installSyncoreWindowBridge()`.

Do not put SQLite in the renderer process.

### Web Worker

For the web target, host Syncore inside a dedicated worker and talk to it through the managed client.

```ts
/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncore/browser";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  databaseName: "my-syncore-app",
  persistenceMode: "opfs"
});
```

```tsx
import { SyncoreBrowserProvider } from "syncore/browser/react";

<SyncoreBrowserProvider
  workerUrl={new URL("./syncore.worker.ts", import.meta.url)}
>
  {children}
</SyncoreBrowserProvider>;
```

### Expo

Use the bootstrap helper and mount `SyncoreExpoProvider` with a fallback while the local runtime starts.

```ts
import { createExpoSyncoreBootstrap } from "syncore/expo";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

export const syncore = createExpoSyncoreBootstrap({
  schema,
  functions,
  databaseName: "syncore.db",
  storageDirectoryName: "syncore-storage"
});
```

### Next PWA

Use the Next helpers to integrate the worker and serve the SQL.js wasm asset.

Configure `next.config.ts` with `withSyncoreNext`:

```ts
import { withSyncoreNext } from "syncore/next/config";

export default withSyncoreNext({
  output: "export"
});
```

Then wire the provider:

```tsx
"use client";

import { SyncoreNextProvider } from "syncore/next";

export function AppSyncoreProvider({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <SyncoreNextProvider
      workerUrl={new URL("./syncore.worker.ts", import.meta.url)}
    >
      {children}
    </SyncoreNextProvider>
  );
}
```

Remember the current Next flow also expects `sql-wasm.wasm` in `public/`, plus service worker wiring when you want installable offline behavior.

### Browser ESM And Svelte

The repo also demonstrates lower-level browser ESM usage through `createBrowserWorkerClient(...)` and Svelte bindings via `syncore/svelte`.

Reach for those patterns when React is not the UI layer.

## Examples

### Pick The Right Adapter

- Node script -> `syncore/node` with `withNodeSyncoreClient`
- Electron desktop app -> `syncore/node` plus IPC bridge and `syncore/node/ipc/react`
- Browser app with worker isolation -> `syncore/browser` plus `syncore/browser/react`
- Expo app with local SQLite -> `syncore/expo` plus `syncore/expo/react`
- Next installable offline app -> `syncore/next` plus `syncore/next/config`
- Svelte or SvelteKit app -> `syncore/browser` plus `syncore/svelte`

## Best Practices

- Keep the runtime in the environment best suited for local storage and lifecycle control
- Preserve typed references across transports and clients
- Use the official quickstarts and examples for target-specific wiring
- Keep adapter code thin and user functions portable
- Prefer wrapper providers in UI shells instead of hand-rolling provider setup each time
- Validate both runtime behavior and declaration output when touching adapter types

## Common Pitfalls

1. Running Electron storage or SQLite directly in the renderer
2. Breaking worker or IPC type boundaries by overconstraining transport types
3. Forgetting environment-specific assets such as `sql-wasm.wasm`, Next config wiring, or service worker setup
4. Solving adapter typing issues with app-level casts instead of shared fixes
5. Documenting internal `@syncore/*` imports where public `syncore/*` entrypoints are the intended app API

## References

- `docs/quickstarts/node-script.md`
- `docs/quickstarts/electron.md`
- `docs/quickstarts/react-web.md`
- `docs/quickstarts/expo.md`
- `docs/quickstarts/next-pwa.md`
- `packages/platform-node/AGENTS.md`
- `packages/platform-web/AGENTS.md`
- `packages/next/src/config.ts`
- `packages/svelte/src/index.ts`
