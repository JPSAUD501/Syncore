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

## 4. Add the worker runtime

`src/syncore.worker.ts`

```ts
/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  databaseName: "my-syncore-web",
  persistenceMode: "opfs"
});
```

## 5. Wrap the app

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

## 6. Query from React

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
      {tasks.map((task) => (
        <div key={task._id}>{task.text}</div>
      ))}
    </main>
  );
}
```

For local-first apps, treat worker bootstrap and availability through
`useSyncoreStatus()` instead of hand-rolled boot flags.

## 7. Run the app

```bash
npm run dev
```
