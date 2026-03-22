# Electron Quickstart

In Electron, Syncore should live in the main process. The renderer only talks
to typed functions through the IPC bridge.

## 1. Create the app host

Start from an Electron app that already builds:

- `src/main.ts`
- a preload script
- a React renderer

## 2. Install packages

```bash
npm install syncorejs react react-dom electron
```

## 3. Start the Syncore dev loop

```bash
npx syncorejs dev
```

Project-local operational commands typically target `project`.

## 4. Start the runtime in the main process

`src/main.ts`

```ts
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  bindElectronWindowToSyncoreRuntime,
  createNodeSyncoreRuntime
} from "syncorejs/node";
import schema from "../syncore/_generated/schema.js";
import { resolvedComponents } from "../syncore/_generated/components.js";
import { functions } from "../syncore/_generated/functions.js";

const runtime = createNodeSyncoreRuntime({
  databasePath: path.join(app.getPath("userData"), "syncore.db"),
  storageDirectory: path.join(app.getPath("userData"), "storage"),
  schema,
  functions,
  components: resolvedComponents,
  platform: "electron-main"
});

async function createWindow() {
  const window = new BrowserWindow({
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true
    }
  });

  const binding = bindElectronWindowToSyncoreRuntime({
    runtime,
    window,
    ipcMain
  });

  await binding.ready;
  await window.loadURL("http://localhost:5173");

  window.on("closed", () => {
    void binding.dispose();
  });
}

void app.whenReady().then(createWindow);
```

## 5. Keep preload narrow

`src/preload.cjs`

```js
const { installSyncoreWindowBridge } = require("syncorejs/node/ipc");

eval(installSyncoreWindowBridge());
```

## 6. Use the renderer provider

`src/renderer/App.tsx`

```tsx
import { SyncoreElectronProvider } from "syncorejs/node/ipc/react";
import { useQuery, useSyncoreStatus } from "syncorejs/react";
import { api } from "../../syncore/_generated/api";

export function App() {
  return (
    <SyncoreElectronProvider>
      <Tasks />
    </SyncoreElectronProvider>
  );
}

function Tasks() {
  const runtime = useSyncoreStatus();
  const tasks = useQuery(api.tasks.list) ?? [];
  if (runtime.kind !== "ready") {
    return <div>Syncore status: {runtime.kind}</div>;
  }
  return <pre>{JSON.stringify(tasks, null, 2)}</pre>;
}
```

If the preload bridge is missing or invalid, treat that as runtime lifecycle
state in the renderer rather than inventing a second IPC boot flag.

## 7. Run the app

Start your renderer dev server, then Electron. Keep all SQLite and file-storage
access in the main process and let the renderer talk only through the Syncore
IPC bridge.
