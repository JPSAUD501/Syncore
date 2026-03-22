# React Web Quickstart

Use this setup when starting from a fresh Vite app and treating
`npx syncorejs dev` as the main happy path.

## 1. Create the app host

```bash
npm create vite@latest my-syncore-web -- --template react-ts
cd my-syncore-web
```

## 2. Install packages

```bash
npm install syncorejs react react-dom sql.js
```

## 3. Start the Syncore dev loop

```bash
npx syncorejs dev
```

For web apps, operational commands run against connected `client:<id>` targets,
not a project-local database.

## 4. Copy the SQL.js wasm asset

Copy `node_modules/sql.js/dist/sql-wasm.wasm` into `public/sql-wasm.wasm`.

## 5. Add the worker runtime

`src/syncore.worker.ts`

```ts
/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/_generated/schema";
import { resolvedComponents } from "../syncore/_generated/components";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  components: resolvedComponents,
  databaseName: "my-syncore-web",
  persistenceDatabaseName: "my-syncore-web",
  persistenceMode: "opfs",
  locateFile: () => "/sql-wasm.wasm",
  platform: "browser-worker"
});
```

## 6. Wrap the app

`src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { SyncoreBrowserProvider } from "syncorejs/browser/react";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SyncoreBrowserProvider
      workerUrl={new URL("./syncore.worker.ts", import.meta.url)}
    >
      <App />
    </SyncoreBrowserProvider>
  </React.StrictMode>
);
```

## 7. Query and mutate from React

`src/App.tsx`

```tsx
import {
  useMutation,
  useQuery,
  useSyncoreStatus
} from "syncorejs/react";
import { api } from "../syncore/_generated/api";

export default function App() {
  const runtime = useSyncoreStatus();
  const tasks = useQuery(api.tasks.list) ?? [];
  const createTask = useMutation(api.tasks.create);

  if (runtime.kind !== "ready") {
    return <main>Syncore status: {runtime.kind}</main>;
  }

  return (
    <main>
      <button onClick={() => void createTask({ text: "Work offline" })}>
        Add task
      </button>
      <ul>
        {tasks.map((task) => (
          <li key={task._id}>{task.text}</li>
        ))}
      </ul>
    </main>
  );
}
```

For local-first apps, treat worker bootstrap and availability through
`useSyncoreStatus()` instead of hand-rolled boot flags.

## 8. Run the app

```bash
npm run dev
```
