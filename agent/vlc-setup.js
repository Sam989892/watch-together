// One-click VLC setup: patch VLC's config to turn on its Web (HTTP) interface
// with a known password, then restart VLC so it takes effect. Spares a layman
// the click-through-preferences dance. macOS + Windows + Linux.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function vlcrcPath() {
  const home = homedir();
  if (process.platform === "darwin") return join(home, "Library/Preferences/org.videolan.vlc/vlcrc");
  if (process.platform === "win32") return join(process.env.APPDATA || join(home, "AppData/Roaming"), "vlc/vlcrc");
  return join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "vlc/vlcrc");
}

function vlcBinary() {
  if (process.platform === "darwin") return "/Applications/VLC.app/Contents/MacOS/VLC";
  if (process.platform === "win32") {
    return ["C:/Program Files/VideoLAN/VLC/vlc.exe", "C:/Program Files (x86)/VideoLAN/VLC/vlc.exe"]
      .find(existsSync) || null;
  }
  return "vlc"; // resolved via PATH on Linux
}

// Turn each of these on in vlcrc. The keys already exist (commented) in any
// vlcrc VLC has ever written, so we replace in place and keep section order.
export function patchVlcrc(password, port = 8080) {
  const path = vlcrcPath();
  if (!existsSync(path)) return { ok: false, error: "Open VLC once, then try again — no config file yet." };
  let text = readFileSync(path, "utf8");
  const set = (key, val) => {
    const re = new RegExp(`^#?\\s*${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, `${key}=${val}`) : `${text}\n${key}=${val}`;
  };
  set("extraintf", "http");        // load the HTTP interface at startup
  set("http-password", password);  // Basic-auth password (empty username)
  set("http-port", String(port));
  writeFileSync(path, text);
  return { ok: true };
}

function quitVlc() {
  return new Promise((res) => {
    const done = () => res();
    if (process.platform === "darwin") execFile("osascript", ["-e", 'quit app "VLC"'], done);
    else if (process.platform === "win32") execFile("taskkill", ["/IM", "vlc.exe", "/F"], done);
    else execFile("pkill", ["-x", "vlc"], done);
  });
}

function launchVlc() {
  if (process.platform === "darwin") {
    spawn("open", ["-a", "VLC"], { detached: true, stdio: "ignore" }).unref();
    return true;
  }
  const bin = vlcBinary();
  if (!bin) return false;
  spawn(bin, [], { detached: true, stdio: "ignore" }).unref();
  return true;
}

// Full flow: patch config, restart VLC, wait for its web interface to answer.
// `ping` is supplied by the agent (a VlcClient.ping bound to this password).
export async function autoSetupVlc(password, port, ping) {
  const patched = patchVlcrc(password, port);
  if (!patched.ok) return patched;

  await quitVlc();
  await delay(1500);                 // let it fully exit before relaunch
  if (!launchVlc()) return { ok: false, error: "Couldn't find VLC to relaunch." };

  for (let i = 0; i < 20; i++) {      // up to ~10s for the interface to come up
    await delay(500);
    if (await ping()) return { ok: true };
  }
  return { ok: false, error: "VLC restarted but its web interface didn't answer." };
}
