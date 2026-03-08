---
name: syncore-platform-adapters
displayName: Syncore Platform Adapters
description: Integration patterns for Syncore across Node or Electron, web workers, Expo, and Next PWA while preserving typed client references and local runtime behavior.
version: 1.0.0
author: Syncore
tags: [syncore, platform, electron, web, expo, next]
---

# Syncore Platform Adapters

Use this skill when wiring Syncore into a concrete runtime environment or debugging adapter-specific DX and transport behavior.

## Documentation Sources

Read these first:

- `docs/quickstarts/electron.md`
- `docs/quickstarts/react-web.md`
- `docs/quickstarts/expo.md`
- `docs/quickstarts/next-pwa.md`
- `packages/platform-node/AGENTS.md`
- `packages/platform-web/AGENTS.md`
- `packages/platform-expo/src/index.ts`
- `packages/platform-node/src/index.ts`
- `packages/platform-web/src/worker.ts`

## Instructions

### Core Rule

The Syncore runtime stays local. Adapters only provide environment-specific IO:

- SQLite access
- filesystem or storage APIs
- transport to UI layers
- timers and lifecycle hooks

Keep user functions portable and adapter setup specific.

### Electron Or Node

Run Syncore in the main process and expose a narrow bridge to the renderer.

```ts
import path from "node:path";
import { createNodeSyncoreRuntime } from "@syncore/platform-node";
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

Do not put SQLite in the renderer process.

### Web Worker

For the web target, host Syncore inside a dedicated worker and talk to it through the managed client.

```ts
/// <reference lib="webworker" />

import {
  attachWebWorkerRuntime,
  createManagedWebWorkerClient,
  createWebSyncoreRuntime
} from "@syncore/platform-web";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void attachWebWorkerRuntime({
  endpoint: self,
  createRuntime: () =>
    createWebSyncoreRuntime({
      schema,
      functions,
      databaseName: "my-syncore-app",
      persistenceMode: "opfs"
    })
});
```

```ts
const syncore = createManagedWebWorkerClient({
  createWorker: () =>
    new Worker(new URL("./syncore.worker.ts", import.meta.url), {
      type: "module"
    })
});
```

### Expo

Use the bootstrap helper and await `getClient()` before mounting the provider.

```ts
import { createExpoSyncoreBootstrap } from "@syncore/platform-expo";
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

Use the Next helper package to integrate the worker and serve the SQL.js wasm asset.

```tsx
"use client";

import { useCallback, type ReactNode } from "react";
import { SyncoreNextProvider } from "@syncore/next";

export function AppSyncoreProvider({ children }: { children: ReactNode }) {
  const createWorker = useCallback(
    () =>
      new Worker(new URL("./syncore.worker.ts", import.meta.url), {
        type: "module"
      }),
    []
  );

  return (
    <SyncoreNextProvider createWorker={createWorker} serviceWorkerUrl="/sw.js">
      {children}
    </SyncoreNextProvider>
  );
}
```

## Examples

### Pick The Right Adapter

- Electron desktop app -> `@syncore/platform-node` plus IPC bridge
- Browser app with worker isolation -> `@syncore/platform-web`
- Expo app with local SQLite -> `@syncore/platform-expo`
- Next installable offline app -> `@syncore/next` plus `@syncore/platform-web`

## Best Practices

- Keep the runtime in the environment best suited for local storage and lifecycle control
- Preserve typed references across transports and clients
- Use the official quickstarts and examples for target-specific wiring
- Keep adapter code thin and user functions portable
- Validate both runtime behavior and declaration output when touching adapter types

## Common Pitfalls

1. Running Electron storage or SQLite directly in the renderer
2. Breaking worker or IPC type boundaries by overconstraining transport types
3. Forgetting environment-specific assets such as `sql-wasm.wasm` or service worker wiring
4. Solving adapter typing issues with app-level casts instead of shared fixes

## References

- `docs/quickstarts/electron.md`
- `docs/quickstarts/react-web.md`
- `docs/quickstarts/expo.md`
- `docs/quickstarts/next-pwa.md`
- `packages/platform-node/AGENTS.md`
- `packages/platform-web/AGENTS.md`
