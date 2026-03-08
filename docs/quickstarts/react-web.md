# React Web Quickstart

This quickstart starts from a fresh Vite app and uses `npx syncore dev` as the
main happy path. If Syncore is missing, `syncore dev` scaffolds the local
backend automatically.

## 1. Create the app host

```bash
npm create vite@latest my-syncore-web -- --template react-ts
cd my-syncore-web
```

## 2. Install packages

```bash
npm install syncore @syncore/react @syncore/platform-web
```

## 3. Start the Syncore dev loop

Run this in one terminal and leave it running:

```bash
npx syncore dev
```

If this is a fresh app, Syncore scaffolds a minimal local backend for you:

```text
syncore/
  schema.ts
  functions/tasks.ts
  migrations/
  _generated/
syncore.config.ts
```

`syncore dev` also regenerates `syncore/_generated/*`, checks schema drift,
applies local migrations, and watches `syncore/` for changes.

## 4. Add the worker runtime

`src/syncore.worker.ts`

```ts
/// <reference lib="webworker" />

import { createWebWorkerRuntime } from "@syncore/platform-web";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createWebWorkerRuntime({
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
import { SyncoreWebProvider } from "@syncore/platform-web";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SyncoreWebProvider
      workerUrl={new URL("./syncore.worker.ts", import.meta.url)}
    >
      <App />
    </SyncoreWebProvider>
  </React.StrictMode>
);
```

## 6. Query from React

`src/App.tsx`

```tsx
import { useMutation, useQuery } from "@syncore/react";
import { api } from "../syncore/_generated/api";

export default function App() {
  const tasks = useQuery(api.tasks.list) ?? [];
  const createTask = useMutation(api.tasks.create);

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

## 7. Run the app

In a second terminal:

```bash
npm run dev
```

Open the Vite URL, click the button, and confirm the task list updates reactively.

To preload sample data from JSONL, use:

```bash
npx syncore import --table tasks sampleData.jsonl
```

Use `npx syncore codegen` only when you need a one-off generation pass without the full dev loop.
