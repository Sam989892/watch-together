// Watch Together — desktop shell (Electron)
// One self-contained app: the main process boots the sync server AND the local
// agent (VLC bridge) in-process, and the window loads the built UI. Opening the
// app is all it takes — nothing else to start.
//   sync server : ws://localhost:8787   (shared room relay)
//   agent       : ws://localhost:8899   (this machine's VLC bridge + UI link)

import { app, BrowserWindow, shell, session, ipcMain, clipboard, dialog, screen } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// A floating, click-through, always-on-top window that shows incoming chat over
// whatever's playing (even VLC fullscreen), so you don't have to switch apps.
let overlayWin = null;
function createOverlay() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  overlayWin = new BrowserWindow({
    width: 460, height: 96,
    x: Math.round(width / 2 - 230), y: 22,
    frame: false, transparent: true, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, hasShadow: false, show: false,
    webPreferences: { preload: join(__dirname, "overlay-preload.cjs") },
  });
  overlayWin.setAlwaysOnTop(true, "screen-saver");            // above fullscreen apps
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setIgnoreMouseEvents(true);                       // click-through
  overlayWin.loadFile(join(__dirname, "overlay.html"));
}

const REPO = "Sam989892/watch-together";
const DOWNLOAD_PAGE = "https://sam989892.github.io/watch-together/";

// Compare "0.1.2" vs "0.1.1" numerically, part by part.
function isNewer(remote, local) {
  const a = String(remote).split(".").map(Number);
  const b = String(local).split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

// On launch, ask GitHub for the newest release. If it's newer than us, offer to
// open the download page. (A one-click check + download — the reliable path for
// unsigned / zip builds, which can't silently self-replace.)
async function checkForUpdates(win) {
  if (!app.isPackaged) return;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return;
    const rel = await res.json();
    const latest = String(rel.tag_name || "").replace(/^v/, "");
    if (!latest || !isNewer(latest, app.getVersion())) return;
    const { response } = await dialog.showMessageBox(win, {
      type: "info",
      title: "Update available",
      message: `Watch Together ${latest} is available`,
      detail: `You have ${app.getVersion()}. Download the new version, then unzip / open it to replace this one.`,
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) shell.openExternal(DOWNLOAD_PAGE);
  } catch { /* offline or rate-limited — ignore */ }
}

// Everyone relays through the one hosted sync server, so there's no "host it
// yourself" choice to get wrong. (Override SERVER only for local development.)
process.env.SERVER = process.env.SERVER || "wss://watch-together-server-qg6g.onrender.com";

// In dev the pieces live in sibling folders; once packaged, prepack.mjs copies
// them under the app's resources (process.resourcesPath).
const part = (...p) =>
  app.isPackaged ? join(process.resourcesPath, ...p) : join(__dirname, "..", ...p);
const AGENT_ENTRY = part("agent", "index.js");
const CLIENT_INDEX = app.isPackaged
  ? join(process.resourcesPath, "client", "index.html")
  : join(__dirname, "..", "client", "dist", "index.html");

// Booting the agent by import starts its local listener as a side effect,
// exactly like running it standalone.
const startAgent = () => import(pathToFileURL(AGENT_ENTRY).href);

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 740,
    minWidth: 720,
    minHeight: 560,
    title: "Watch Together",
    backgroundColor: "#0f0f12",
    webPreferences: { contextIsolation: true, preload: join(__dirname, "preload.cjs") },
  });
  // External links open in the real browser, not inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("did-fail-load", (_e, code, desc) => console.error("UI failed to load:", code, desc));
  win.loadFile(CLIENT_INDEX);
  return win;
}

// Reliable copy for the UI (see preload.cjs).
ipcMain.handle("clipboard:write", (_e, text) => { clipboard.writeText(String(text)); return true; });

// Chat overlay: the main UI forwards incoming messages here; we pop the floating
// window, hand it the message, and hide it again after it fades.
let overlayEnabled = true;
let overlayHideTimer = null;
ipcMain.on("overlay:enabled", (_e, on) => { overlayEnabled = !!on; if (!on) overlayWin?.hide(); });
ipcMain.on("overlay:notify", (_e, msg) => {
  if (!overlayEnabled || !overlayWin) return;
  overlayWin.showInactive();                    // show without stealing focus
  overlayWin.webContents.send("overlay:chat", msg);
  clearTimeout(overlayHideTimer);
  overlayHideTimer = setTimeout(() => overlayWin?.hide(), 6000);
});

app.whenReady().then(async () => {
  // Allow the mic (voice chat); deny other permission requests.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "media"));

  await startAgent();    // VLC bridge on :8899, relays to the hosted server
  createOverlay();
  const win = createWindow();

  // A few seconds after the window is up, check GitHub for a newer version.
  setTimeout(() => checkForUpdates(win), 4000);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Mac apps stay open with no windows; elsewhere quitting the last window quits.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
