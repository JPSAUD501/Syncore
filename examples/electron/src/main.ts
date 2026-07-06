import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { createElectronSyncoreApp } from "syncorejs/node/ipc";
import schema from "../syncore/_generated/schema.js";
import { functions } from "../syncore/_generated/functions.js";

const rendererHtmlPath = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "renderer",
  "index.html"
);

const developmentDataDirectory = path.join(process.cwd(), ".syncore");
const userDataDirectory =
  process.env.SYNCORE_ELECTRON_USER_DATA_DIR ??
  (app.isPackaged ? app.getPath("userData") : developmentDataDirectory);

app.setPath("userData", userDataDirectory);

const syncore = createElectronSyncoreApp({
  app,
  ipcMain,
  userDataPath: userDataDirectory,
  schema,
  functions
});

let mainWindow: BrowserWindow | null = null;

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

  await syncore.bindWindow(mainWindow).ready;

  const rendererUrl = process.env.SYNCORE_ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadFile(rendererHtmlPath);
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
  void syncore.dispose();
});
