// Exposes a reliable clipboard to the UI. Browser clipboard APIs are flaky in
// Electron (non-secure origin, focus rules), so copying goes through the main
// process instead.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appClipboard", {
  write: (text) => ipcRenderer.invoke("clipboard:write", String(text)),
});

// Floating chat overlay (shows incoming messages over VLC).
contextBridge.exposeInMainWorld("appOverlay", {
  notify: (msg) => ipcRenderer.send("overlay:notify", msg),
  setEnabled: (on) => ipcRenderer.send("overlay:enabled", !!on),
});

// App version, for display + the peer version check.
contextBridge.exposeInMainWorld("appInfo", {
  version: ipcRenderer.sendSync("app:version"),
});
