# Next PWA Quickstart

Use this setup when you want a Next app that installs once and then keeps
running fully local.

## 1. Create the app host

```bash
npx create-next-app@latest my-syncore-next
cd my-syncore-next
```

## 2. Install packages

```bash
npm install syncore @syncore/react @syncore/platform-web @syncore/next sql.js
```

## 3. Start the Syncore dev loop

Run this in one terminal and leave it running:

```bash
npx syncore dev
```

## 4. Enable the Next integration

`next.config.ts`

```ts
import { withSyncoreNext } from "@syncore/next/config";

export default withSyncoreNext({
  output: "export"
});
```

## 5. Add the worker runtime

`app/syncore.worker.ts`

```ts
/// <reference lib="webworker" />

import { createWebWorkerRuntime } from "@syncore/platform-web";
import { resolveSqlJsWasmUrl } from "@syncore/next";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createWebWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  databaseName: "my-syncore-next",
  persistenceDatabaseName: "my-syncore-next",
  persistenceMode: "opfs",
  locateFile: () => resolveSqlJsWasmUrl()
});
```

## 6. Use the generated API

`app/page.tsx`

```tsx
"use client";

import { useQuery } from "@syncore/react";
import { SyncoreNextProvider } from "@syncore/next";
import { api } from "../syncore/_generated/api";

function Todos() {
  const tasks = useQuery(api.tasks.list) ?? [];
  return <pre>{JSON.stringify(tasks, null, 2)}</pre>;
}

export default function Page() {
  return (
    <SyncoreNextProvider
      workerUrl={new URL("./syncore.worker.ts", import.meta.url)}
    >
      <Todos />
    </SyncoreNextProvider>
  );
}
```

## 7. Serve the wasm asset and service worker

Copy `node_modules/sql.js/dist/sql-wasm.wasm` into `public/sql-wasm.wasm` and add a simple `public/sw.js`.

When you use `output: "export"`, Syncore intentionally skips custom Next `headers()`
so the build stays warning-free. The wasm file still works as long as it is copied
into `public/`.

You can optionally preload sample data with:

```bash
npx syncore import --table tasks sampleData.jsonl
```

## 8. Run the app

In a second terminal:

```bash
npm run dev
```

Open the Next URL, confirm the query renders, then test an offline refresh after the service worker has installed.
