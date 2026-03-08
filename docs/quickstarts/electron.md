# Electron Quickstart

In Electron, Syncore should live in the main process. The renderer only talks to
typed functions through the IPC bridge.

## 1. Create the app host

Start from an Electron app that already builds a `src/main.ts`, a preload script,
and a React renderer.

## 2. Install packages

```bash
npm install syncore @syncore/react @syncore/platform-node react react-dom electron
```

## 3. Start the Syncore dev loop

Run this in one terminal and leave it running:

```bash
npx syncore dev
```

If this is a fresh app, Syncore scaffolds a minimal local backend for you and
keeps `syncore/_generated/*` up to date.

## 4. Start the runtime in the main process

`src/main.ts`

```ts
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  bindElectronWindowToSyncoreRuntime,
  createNodeSyncoreRuntime
} from "@syncore/platform-node";
import schema from "../syncore/schema.js";
import { functions } from "../syncore/_generated/functions.js";

const runtime = createNodeSyncoreRuntime({
  databasePath: path.join(app.getPath("userData"), "syncore.db"),
  storageDirectory: path.join(app.getPath("userData"), "storage"),
  schema,
  functions,
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
const { installSyncoreWindowBridge } = require("@syncore/platform-node/ipc");

eval(installSyncoreWindowBridge());
```

## 6. Use the renderer provider

`src/renderer/App.tsx`

```tsx
import { SyncoreElectronProvider } from "@syncore/platform-node/ipc";
import { useQuery } from "@syncore/react";
import { api } from "../../syncore/_generated/api";

export function App() {
  return (
    <SyncoreElectronProvider>
      <Tasks />
    </SyncoreElectronProvider>
  );
}

function Tasks() {
  const tasks = useQuery(api.tasks.list) ?? [];
  return <pre>{JSON.stringify(tasks, null, 2)}</pre>;
}
```

## 7. Run the app

In a second terminal, start your renderer dev server and then Electron. Confirm
that tasks read and write through the main-process runtime.

To preload sample data from JSONL, use:

```bash
npx syncore import --table tasks sampleData.jsonl
```
