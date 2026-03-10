const { contextBridge, ipcRenderer } = require("electron");

const channel = "syncore:message";
const listeners = new Map();

contextBridge.exposeInMainWorld("syncoreBridge", {
  postMessage(message) {
    ipcRenderer.send(channel, message);
  },
  onMessage(listener) {
    const wrapped = (_event, payload) => {
      listener(payload);
    };
    listeners.set(listener, wrapped);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.off(channel, wrapped);
      listeners.delete(listener);
    };
  }
});
