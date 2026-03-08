# Electron Quickstart

In Electron, Syncore should live in the main process. The renderer only talks to typed functions through IPC.

## 1. Install packages

```bash
npm install syncore @syncore/react @syncore/platform-node react react-dom
```

## 2. Create the backend

Create:

```text
syncore/
  schema.ts
  functions/
    tasks.ts
```

Generate the typed API:

```bash
npx syncore codegen
```

## 3. Start the runtime in the main process

`src/main.ts`

```ts
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  attachNodeIpcRuntime,
  createNodeIpcMessageEndpoint,
  createNodeSyncoreRuntime
} from "@syncore/platform-node";
import schema from "../syncore/schema.js";
import { functions } from "../syncore/_generated/functions.js";

const channel = "syncore:message";
const runtime = createNodeSyncoreRuntime({
  databasePath: path.join(app.getPath("userData"), "syncore.db"),
  storageDirectory: path.join(app.getPath("userData"), "storage"),
  schema,
  functions,
  platform: "electron-main"
});

function bindWindow(window: BrowserWindow) {
  const listeners = new Set<(message: unknown) => void>();
  const endpoint = createNodeIpcMessageEndpoint({
    postMessage(message) {
      window.webContents.send(channel, message);
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });

  ipcMain.on(channel, (_event, message) => {
    for (const listener of listeners) {
      listener(message);
    }
  });

  return attachNodeIpcRuntime({
    endpoint,
    createRuntime: () => runtime
  });
}
```

## 4. Use the renderer helper

`src/renderer/App.tsx`

```tsx
import { createRendererSyncoreBridgeClient } from "@syncore/platform-node/ipc";
import { SyncoreProvider, useQuery } from "@syncore/react";
import { api } from "../../syncore/_generated/api";

declare global {
  interface Window {
    syncoreBridge: {
      postMessage(message: unknown): void;
      onMessage(listener: (message: unknown) => void): () => void;
    };
  }
}

const client = createRendererSyncoreBridgeClient(window.syncoreBridge);

export function App() {
  return (
    <SyncoreProvider client={client}>
      <Tasks />
    </SyncoreProvider>
  );
}

function Tasks() {
  const tasks = useQuery(api.tasks.list) ?? [];
  return <pre>{JSON.stringify(tasks, null, 2)}</pre>;
}
```

## 5. Keep the preload narrow

Expose only the bridge methods the renderer needs. Do not put SQLite in the renderer process.

See `examples/electron` for the full working setup and smoke-tested path.
