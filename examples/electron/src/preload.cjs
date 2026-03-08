const { contextBridge, ipcRenderer } = require("electron");

const electronChannel = "syncore:message";
const listeners = new Map();

contextBridge.exposeInMainWorld("syncoreBridge", {
  postMessage(message) {
    ipcRenderer.send(electronChannel, message);
  },
  onMessage(listener) {
    const wrapped = (_event, payload) => {
      listener(payload);
    };
    listeners.set(listener, wrapped);
    ipcRenderer.on(electronChannel, wrapped);
    return () => {
      ipcRenderer.off(electronChannel, wrapped);
      listeners.delete(listener);
    };
  }
});
