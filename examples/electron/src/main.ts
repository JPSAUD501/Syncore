import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  attachNodeIpcRuntime,
  createNodeIpcMessageEndpoint,
  createNodeSyncoreRuntime,
  type SyncoreIpcMessageEndpoint
} from "@syncore/platform-node";
import schema from "../syncore/schema.js";
import { functions } from "../syncore/_generated/functions.js";

const electronChannel = "syncore:message";
const userDataDirectory =
  process.env.SYNCORE_ELECTRON_USER_DATA_DIR ?? app.getPath("userData");

app.setPath("userData", userDataDirectory);

const runtime = createNodeSyncoreRuntime({
  databasePath: path.join(userDataDirectory, "syncore.db"),
  storageDirectory: path.join(userDataDirectory, "storage"),
  schema,
  functions,
  platform: "electron-main"
});

let mainWindow: BrowserWindow | null = null;
let ipcCleanup: (() => void) | null = null;
let attachedRuntime:
  | {
      ready: Promise<void>;
      dispose(): Promise<void>;
    }
  | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
        width: 1180,
        height: 820,
        show: true,
        webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
          contextIsolation: true
        }
      });

  const endpoint = createElectronMainEndpoint(mainWindow);
  ipcCleanup = () => endpoint.dispose();
  attachedRuntime = attachNodeIpcRuntime({
    endpoint,
    createRuntime: () => runtime
  });
  const currentRuntime = attachedRuntime;
  await currentRuntime.ready;

  const rendererUrl = process.env.SYNCORE_ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(path.join(import.meta.dirname, "..", "renderer", "index.html"));
  }

  mainWindow.on("closed", () => {
    ipcCleanup?.();
    ipcCleanup = null;
    mainWindow = null;
  });
}

void app.whenReady().then(() => createWindow());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  ipcCleanup?.();
  ipcCleanup = null;
});

app.on("will-quit", () => {
  void (async () => {
    await attachedRuntime?.dispose();
    await runtime.stop();
  })();
});

function createElectronMainEndpoint(window: BrowserWindow): SyncoreIpcMessageEndpoint & {
  dispose(): void;
} {
  const handleRendererMessage = (_event: Electron.IpcMainEvent, message: unknown) => {
    for (const listener of runtimeBridgeListeners) {
      listener(message);
    }
  };

  ipcMain.on(electronChannel, handleRendererMessage);
  const endpoint = createNodeIpcMessageEndpoint({
    postMessage(message) {
      if (!window.isDestroyed()) {
        window.webContents.send(electronChannel, message);
      }
    },
    onMessage(listener) {
      runtimeBridgeListeners.add(listener);
      return () => {
        runtimeBridgeListeners.delete(listener);
      };
    }
  });

  return {
    ...endpoint,
    dispose() {
      endpoint.dispose();
      ipcMain.off(electronChannel, handleRendererMessage);
      runtimeBridgeListeners.clear();
    }
  };
}

const runtimeBridgeListeners = new Set<(message: unknown) => void>();
