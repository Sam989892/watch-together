// VLC control module
// Talks to VLC's built-in HTTP interface (enable: VLC > Settings > Interface >
// "Web" / Lua HTTP). VLC uses HTTP Basic auth with an EMPTY username and the
// password you set. Default port 8080.

import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Pull the currently-playing item's uri out of VLC's playlist tree.
function findCurrentUri(node) {
  if (!node || typeof node !== "object") return null;
  if (node.current && node.uri) return node.uri;
  for (const child of node.children || []) {
    const found = findCurrentUri(child);
    if (found) return found;
  }
  return null;
}
//
// Endpoints used:
//   GET /requests/status.json                          -> current state
//   GET /requests/status.json?command=pl_pause         -> toggle pause
//   GET /requests/status.json?command=pl_play          -> play
//   GET /requests/status.json?command=seek&val=<sec>   -> seek to seconds

export class VlcClient {
  constructor({ host = "127.0.0.1", port = 8080, password = "" } = {}) {
    this.base = `http://${host}:${port}`;
    this.auth = "Basic " + Buffer.from(`:${password}`).toString("base64");
  }

  async _get(path) {
    let res;
    try {
      res = await fetch(this.base + path, { headers: { Authorization: this.auth } });
    } catch {
      throw new Error("Can't reach VLC — is it running with Web (HTTP) enabled on this port?");
    }
    if (res.status === 401) throw new Error("VLC auth failed — check the password.");
    if (!res.ok) throw new Error(`VLC HTTP ${res.status}`);
    return res.json();
  }

  // Returns normalized playback state, or throws if VLC isn't reachable.
  async status() {
    const s = await this._get("/requests/status.json");
    const meta = s.information?.category?.meta || {};
    return {
      playing: s.state === "playing",
      time: s.time ?? 0,            // seconds
      length: s.length ?? 0,        // seconds
      position: s.position ?? 0,    // 0..1
      file: meta.filename || null,
      // subtitle / audio track info lives in s.information.category.* streams
      raw: s,
    };
  }

  // Real byte size of the currently-playing local file, so the room can tell
  // two people apart on same-length-but-different files. Returns null for
  // streams or anything we can't stat.
  async currentFileSize() {
    try {
      const pl = await this._get("/requests/playlist.json");
      const uri = findCurrentUri(pl);
      if (!uri || !uri.startsWith("file://")) return null;
      return statSync(fileURLToPath(uri)).size;
    } catch { return null; }
  }

  async play()  { return this._get("/requests/status.json?command=pl_play"); }
  async pause() { return this._get("/requests/status.json?command=pl_pause"); }
  async seek(seconds) {
    return this._get(`/requests/status.json?command=seek&val=${Math.max(0, Math.floor(seconds))}`);
  }

  // Convenience: force a specific playing state + time (used by "Sync both").
  async apply({ playing, time }) {
    if (typeof time === "number") await this.seek(time);
    const s = await this.status();
    if (playing && !s.playing) await this.play();
    if (!playing && s.playing) await this.pause();
  }

  async ping() {
    try { await this.status(); return true; } catch { return false; }
  }
}
