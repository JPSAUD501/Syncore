import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import {
  bindElectronWindowToSyncoreRuntime,
  createNodeSyncoreRuntime
} from "syncore/node";
import schema from "../syncore/schema.js";
import { functions } from "../syncore/_generated/functions.js";

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
let attachedRuntime: {
  ready: Promise<void>;
  dispose(): Promise<void>;
} | null = null;

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

  attachedRuntime = bindElectronWindowToSyncoreRuntime({
    runtime,
    window: mainWindow,
    ipcMain
  });
  const currentRuntime = attachedRuntime;
  if (!currentRuntime) {
    throw new Error("Failed to attach the Electron Syncore runtime.");
  }
  await currentRuntime.ready;

  const rendererUrl = process.env.SYNCORE_ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(
      path.join(import.meta.dirname, "..", "renderer", "index.html")
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => createWindow());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  void (async () => {
    await attachedRuntime?.dispose();
    await runtime.stop();
  })();
});
