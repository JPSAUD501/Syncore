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
npm install syncorejs next react react-dom
```

## 3. Scaffold Syncore

```bash
npx syncorejs init --template next
```

This creates `syncore/schema.ts`, `syncore/functions/`, `syncore.config.ts`, and
the initial `syncore/_generated/*` outputs. Skip individual file creation steps
below if `init` already generated them.

## 4. Start the Syncore dev loop

```bash
npx syncorejs dev
```

## 5. Enable the Next integration

`next.config.ts`

```ts
import { withSyncoreNext } from "syncorejs/next/config";

export default withSyncoreNext({
  output: "export"
});
```

## 6. Add the worker runtime

`app/syncore.worker.ts`

```ts
import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/_generated/schema";
import { resolvedComponents } from "../syncore/_generated/components";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  components: resolvedComponents,
  databaseName: "my-syncore-next",
  persistenceDatabaseName: "my-syncore-next",
  storageNamespace: "my-syncore-next-storage",
  // File storage in browser runtimes is OPFS-only.
  persistenceMode: "opfs",
  platform: "browser-worker"
});
```

## 7. Use the generated API

`app/page.tsx`

```tsx
"use client";

import { useQuery, useSyncoreStatus } from "syncorejs/react";
import { SyncoreNextProvider } from "syncorejs/next";
import { api } from "../syncore/_generated/api";

function createWorker() {
  return new Worker(new URL("./syncore.worker.ts", import.meta.url), {
    type: "module"
  });
}

function Todos() {
  const runtime = useSyncoreStatus();
  const tasks = useQuery(api.tasks.list) ?? [];
  if (runtime.kind !== "ready") {
    return <div>Syncore status: {runtime.kind}</div>;
  }
  return (
    <ul>
      {tasks.map((task) => (
        <li key={task._id}>{task.text}</li>
      ))}
    </ul>
  );
}

export default function Page() {
  return (
    <SyncoreNextProvider createWorker={createWorker}>
      <Todos />
    </SyncoreNextProvider>
  );
}
```

`SyncoreNextProvider` should mount cleanly during SSR and only start the worker
after hydration. App shells should read runtime lifecycle through
`useSyncoreStatus()`.

## 8. Run the app

```bash
npm run dev
```
