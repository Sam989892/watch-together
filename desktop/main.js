// Watch Together — desktop shell (Electron)
// One self-contained app: the main process boots the sync server AND the local
// agent (VLC bridge) in-process, and the window loads the built UI. Opening the
// app is all it takes — nothing else to start.
//   sync server : ws://localhost:8787   (shared room relay)
//   agent       : ws://localhost:8899   (this machine's VLC bridge + UI link)

import { app, BrowserWindow, shell, session } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

const __dirname = dirname(fileURLToPath(import.meta.url));

// By default the agent relays to the sync server running inside this same app,
// so a solo/host machine needs nothing external. Override SERVER to join
// someone else's server instead.
process.env.SERVER = process.env.SERVER || "ws://localhost:8787";

// In dev the pieces live in sibling folders; once packaged, prepack.mjs copies
// them under the app's resources (process.resourcesPath).
const part = (...p) =>
  app.isPackaged ? join(process.resourcesPath, ...p) : join(__dirname, "..", ...p);
const SERVER_ENTRY = part("server", "index.js");
const AGENT_ENTRY = part("agent", "index.js");
const CLIENT_INDEX = app.isPackaged
  ? join(process.resourcesPath, "client", "index.html")
  : join(__dirname, "..", "client", "dist", "index.html");

// Booting each by import starts its listener as a side effect, exactly like
// running it standalone.
const startServer = () => import(pathToFileURL(SERVER_ENTRY).href);
const startAgent = () => import(pathToFileURL(AGENT_ENTRY).href);

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 740,
    minWidth: 720,
    minHeight: 560,
    title: "Watch Together",
    backgroundColor: "#0f0f12",
    webPreferences: { contextIsolation: true },
  });
  // External links open in the real browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => console.error("UI failed to load:", code, desc));
  win.loadFile(CLIENT_INDEX);
}

app.whenReady().then(async () => {
  // Allow the mic (voice chat); deny other permission requests.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "media"));

  await startServer();   // shared room relay on :8787 (this app hosts it)
  await startAgent();    // VLC bridge on :8899, relays to the server above
  createWindow();

  // Auto-update from GitHub Releases: a packaged app checks on launch, downloads
  // a newer version in the background, and installs it on next quit.
  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Mac apps stay open with no windows; elsewhere quitting the last window quits.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
