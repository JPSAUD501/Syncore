# Next PWA Quickstart

Use this setup when you want a Next app that installs once and then keeps running fully local.

## 1. Install packages

```bash
npm install syncore @syncore/react @syncore/platform-web @syncore/next sql.js
```

## 2. Create the backend

Create:

```text
syncore/
  schema.ts
  functions/
    todos.ts
```

Function files should import from `syncore/_generated/server`, not directly from `syncore`.

Generate typed files:

```bash
npx syncore codegen
```

## 3. Add the worker

`app/syncore.worker.ts`

```ts
/// <reference lib="webworker" />

import { attachWebWorkerRuntime, createWebSyncoreRuntime } from "@syncore/platform-web";
import { resolveSqlJsWasmUrl } from "@syncore/next";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void attachWebWorkerRuntime({
  endpoint: self,
  createRuntime: () =>
    createWebSyncoreRuntime({
      schema,
      functions,
      databaseName: "syncore-next-app",
      persistenceDatabaseName: "syncore-next-app",
      persistenceMode: "opfs",
      locateFile: () => resolveSqlJsWasmUrl()
    })
});
```

## 4. Wrap the app

`app/syncore-provider.tsx`

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

## 5. Use the generated API

```tsx
"use client";

import { useQuery } from "@syncore/react";
import { api } from "../syncore/_generated/api";

export function Todos() {
  const todos = useQuery(api.todos.list) ?? [];
  return <pre>{JSON.stringify(todos, null, 2)}</pre>;
}
```

## 6. Serve the wasm asset and service worker

You must:

- copy `sql-wasm.wasm` into `public/`
- register a service worker
- serve the app as a static/offline-capable build

See `examples/next-pwa` for the exact wiring and smoke-tested setup.
