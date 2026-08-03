// Lets the transparent overlay window receive chat messages from the main process.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayApi", {
  onChat: (cb) => ipcRenderer.on("overlay:chat", (_e, msg) => cb(msg)),
});
