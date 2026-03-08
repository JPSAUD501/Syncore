# React Web Quickstart

This quickstart uses Vite + React with a dedicated Syncore worker. The app runs fully local in the browser after the first install.

## 1. Install packages

```bash
npm install syncore @syncore/react @syncore/platform-web
```

## 2. Create the Syncore backend

Project layout:

```text
syncore/
  schema.ts
  functions/
    tasks.ts
```

`syncore/schema.ts`

```ts
import { defineSchema, defineTable, v } from "syncore";

export default defineSchema({
  tasks: defineTable({
    text: v.string(),
    done: v.boolean()
  }).index("by_done", ["done"])
});
```

`syncore/functions/tasks.ts`

```ts
import { mutation, query, v } from "../_generated/server";

export const list = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => ctx.db.query("tasks").withIndex("by_done").collect()
});

export const create = mutation({
  args: { text: v.string() },
  returns: v.string(),
  handler: async (ctx, args) =>
    ctx.db.insert("tasks", { text: args.text, done: false })
});
```

Generate the typed API:

```bash
npx syncore codegen
```

## 3. Create the worker runtime

`src/syncore.worker.ts`

```ts
/// <reference lib="webworker" />

import { attachWebWorkerRuntime, createWebSyncoreRuntime } from "@syncore/platform-web";
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

## 4. Mount the client

`src/main.tsx`

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createManagedWebWorkerClient } from "@syncore/platform-web";
import { SyncoreProvider } from "@syncore/react";
import App from "./App";

const syncore = createManagedWebWorkerClient({
  createWorker: () =>
    new Worker(new URL("./syncore.worker.ts", import.meta.url), {
      type: "module"
    })
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SyncoreProvider client={syncore.client}>
      <App />
    </SyncoreProvider>
  </React.StrictMode>
);
```

## 5. Query from React

`src/App.tsx`

```tsx
import { useMutation, useQuery } from "@syncore/react";
import { api } from "../syncore/_generated/api";

export default function App() {
  const tasks = useQuery<{ _id: string; text: string }[]>(api.tasks.list) ?? [];
  const createTask = useMutation<string>(api.tasks.create);

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

## 6. Run the app

```bash
npm run dev
```

If you want a prebuilt example, see `examples/next-pwa` and `examples/electron`.
