// Exposes a reliable clipboard to the UI. Browser clipboard APIs are flaky in
// Electron (non-secure origin, focus rules), so copying goes through the main
// process instead.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appClipboard", {
  write: (text) => ipcRenderer.invoke("clipboard:write", String(text)),
});
