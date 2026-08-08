// Watch Together — Local Agent
// Runs on YOUR machine and is the only thing that can reach both your local
// VLC and the outside world:
//   * Hosts a small local WebSocket server that the UI (client) connects to.
//   * On request, tests/opens a connection to your local VLC HTTP interface.
//   * Once you create/join a room, opens the real connection to the sync
//     server and proxies room traffic to/from the UI, applying incoming
//     playback commands to local VLC and forwarding local VLC changes out.
//
// The link to the sync server auto-reconnects (with backoff) and re-joins the
// room, so a brief network drop doesn't end movie night.
//
// Config via env (put SERVER in agent/.env for a hosted server):
//   LOCAL_PORT  port the UI connects to on this machine (default 8899)
//   SERVER      ws(s) url of the sync server             (default ws://localhost:8787)
//   VLC_PORT    default VLC HTTP port if the UI doesn't send one (default 8080)

import { networkInterfaces } from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import { VlcClient } from "./vlc.js";
import { autoSetupVlc } from "./vlc-setup.js";

// This machine's LAN IP (first non-internal IPv4), for a friend to join by.
function lanIp() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) return a.address;
    }
  }
  return null;
}

const LOCAL_PORT = Number(process.env.LOCAL_PORT) || 8899;
// 127.0.0.1, not "localhost": avoids the Windows IPv6/IPv4 mismatch where the
// UI can't reach the agent because "localhost" resolves to ::1.
const SERVER = process.env.SERVER || "ws://127.0.0.1:8787";
const DEFAULT_VLC_PORT = Number(process.env.VLC_PORT) || 8080;

const wss = new WebSocketServer({ host: "127.0.0.1", port: LOCAL_PORT });
console.log(`Watch Together agent listening for the UI on ws://127.0.0.1:${LOCAL_PORT}`);
console.log(`Will relay to sync server at ${SERVER}`);

// Turn whatever a user typed for a friend's server into a ws(s):// url.
// Blank → our default (the app's own server). Accepts a bare host / host:port
// (LAN, → ws://) or a full http(s):// tunnel url (→ ws(s)://).
function normalizeServer(input) {
  const v = (input || "").trim();
  if (!v) return SERVER;
  if (/^wss?:\/\//i.test(v)) return v;
  if (/^https:\/\//i.test(v)) return v.replace(/^https/i, "wss");
  if (/^http:\/\//i.test(v)) return v.replace(/^http/i, "ws");
  return `ws://${v.includes(":") ? v : v + ":8787"}`;
}

// Readable random password for auto-setup (avoids ambiguous chars).
function genPassword() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  return "wt-" + Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

wss.on("connection", (local) => {
  let session = null; // { vlc, upstream, applying, last, pollTimer }

  const sendLocal = (obj) => local.readyState === WebSocket.OPEN && local.send(JSON.stringify(obj));

  local.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "vlc-test") {
      const vlc = new VlcClient({ port: msg.vlcPort || DEFAULT_VLC_PORT, password: msg.vlcPassword || "" });
      try {
        const s = await vlc.status();
        sendLocal({ type: "vlc-test-result", ok: true, file: s.file, duration: Math.round(s.length) });
      } catch (e) {
        sendLocal({ type: "vlc-test-result", ok: false, error: e.message });
      }
      return;
    }

    // One-click: turn on VLC's web interface for the user (patch config +
    // restart VLC), then hand back the password we set so the UI can connect.
    if (msg.type === "vlc-autosetup") {
      const port = msg.vlcPort || DEFAULT_VLC_PORT;
      const password = msg.vlcPassword || genPassword();
      const ping = () => new VlcClient({ port, password }).ping();
      const r = await autoSetupVlc(password, port, ping);
      sendLocal({ type: "vlc-autosetup-result", ok: r.ok, error: r.error, password });
      return;
    }

    if (msg.type === "create" || msg.type === "join") {
      if (session) return; // one room per agent session
      const vlc = new VlcClient({ port: msg.vlcPort || DEFAULT_VLC_PORT, password: msg.vlcPassword || "" });
      let s = null;
      try { s = await vlc.status(); } catch { /* proceed without VLC */ }
      const size = s ? await vlc.currentFileSize() : null;

      session = {
        vlc, sendLocal, applying: false, scrubbing: false, pollTimer: null, upstream: null,
        last: snapshot(s),                                    // truthful poll baseline
        firstType: msg.type, code: msg.code, joinedOnce: false,
        rejoin: !!msg.rejoin,                        // create the room if missing (recent room / friend)
        serverUrl: normalizeServer(msg.serverUrl),   // blank = host on this app's own server
        reportedFile: s ? s.file : null,             // last file name told to the server
        retries: 0, retryTimer: null, closed: false,
        // Everything the server needs to (re-)admit us to the room. `size` is
        // the real byte count — the server matches on it when both peers have it.
        join: {
          name: msg.name, avatar: msg.avatar, vlcConnected: !!s, appVersion: msg.appVersion,
          file: s ? { name: s.file, size, duration: Math.round(s.length) } : null,
        },
      };
      // Tell the UI whether we're hosting and, if so, the address to hand a
      // friend on the same network.
      const hosting = !(msg.serverUrl && msg.serverUrl.trim());
      sendLocal({ type: "net-info", hosting, hostIp: hosting ? lanIp() : null });
      connectUpstream(session);
      return;
    }

    if (!session) return;

    // Playback the local person triggered from the UI (SyncBar buttons,
    // shortcuts, "Sync both"): apply to our own VLC too, not just to peers.
    if (["play", "pause", "seek", "jump"].includes(msg.type)) await applyToVlc(session, msg.type, msg.time);

    // Forward everything (playback + chat/presence/voice) upstream to peers.
    if (session.upstream?.readyState === WebSocket.OPEN) {
      session.upstream.send(JSON.stringify(msg));
    }
  });

  local.on("close", () => {
    if (!session) return;
    session.closed = true;
    clearInterval(session.pollTimer);
    clearInterval(session.keepAlive);
    clearTimeout(session.retryTimer);
    session.upstream?.close();
    session = null;
  });

  // Open (or re-open) the link to the sync server. First connect uses the
  // original create/join; every reconnect re-joins the resolved room code so a
  // network blip doesn't drop you out of the room your friend is still in.
  function connectUpstream(session) {
    const ws = new WebSocket(session.serverUrl);
    session.upstream = ws;

    ws.on("open", () => {
      const type = session.joinedOnce ? "join" : session.firstType;
      // Recreate the room if it's gone (server restarted) rather than error out —
      // on any reconnect, and on an initial recent-room / friend join.
      ws.send(JSON.stringify({ type, code: session.code, rejoin: session.joinedOnce || session.rejoin, ...session.join }));
      session.retries = 0;
      if (!session.pollTimer) session.pollTimer = setInterval(() => pollVlc(session), 1000);
      // Keepalive: a tiny periodic message (ignored by the server) so a free
      // host doesn't treat a quiet movie stretch as idle and nap mid-session.
      clearInterval(session.keepAlive);
      session.keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "keepalive" }));
      }, 4 * 60 * 1000);
    });

    ws.on("message", async (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      // Clear the "reconnecting" banner only once the server confirms we're
      // actually back in the room, not merely that the socket reopened.
      if (m.type === "joined") { session.code = m.code; session.joinedOnce = true; sendLocal({ type: "link", up: true }); }
      sendLocal(m);
      if (["play", "pause", "seek", "jump"].includes(m.type)) await applyToVlc(session, m.type, m.time);
    });

    ws.on("close", () => { clearInterval(session.keepAlive); scheduleReconnect(session); });
    ws.on("error", () => { /* a close event always follows; reconnect handled there */ });
  }

  function scheduleReconnect(session) {
    if (session.closed) return;
    sendLocal({ type: "link", up: false });
    if (session.retries >= 6) {
      return sendLocal({ type: "error", message: "Lost the sync server. Re-create the room." });
    }
    const delay = Math.min(1000 * 2 ** session.retries, 10000);
    session.retries++;
    session.retryTimer = setTimeout(() => connectUpstream(session), delay);
  }
});

// Timestamped view of VLC state. `at` lets the poll loop tell real seeks
// apart from time simply advancing while the video plays.
const snapshot = (s) => ({
  playing: s ? s.playing : false,
  time: s ? s.time : 0,
  at: Date.now(),
});

// Apply a play/pause/seek/jump command to local VLC, guarding the poll loop
// so it doesn't read our own just-applied change as a new local event.
async function applyToVlc(session, type, time) {
  session.applying = true;
  try {
    if (type === "pause") await session.vlc.pause();
    else if (type === "play") await session.vlc.apply({ playing: true, time });
    else await session.vlc.apply({ playing: undefined, time }); // seek / jump
    // Resync `last` to the real post-apply state so the next poll tick
    // doesn't mistake our own change for a fresh local event and re-send it.
    session.last = snapshot(await session.vlc.status());
  } catch (e) { console.error("VLC apply failed:", e.message); }
  setTimeout(() => { session.applying = false; }, 400);
}

// Poll local VLC: push the real state to our own UI every tick, and forward
// genuine user actions (play/pause/seek made inside VLC itself) to the room.
async function pollVlc(session) {
  let s;
  try { s = await session.vlc.status(); } catch { return; }

  // Our UI renders straight from this every tick — even while the upstream
  // link is down — so local playback info never goes stale.
  session.sendLocal({ type: "vlc-status", playing: s.playing, time: s.time, duration: s.length, file: s.file });

  const up = session.upstream;
  if (session.applying || up?.readyState !== WebSocket.OPEN) { session.last = snapshot(s); return; }

  // If the open file changed, re-report it so the room's file-match check
  // re-runs (fixes a stale "files don't match" after both open the same file).
  if (s.file !== session.reportedFile) {
    session.reportedFile = s.file;
    const size = s.file ? await session.vlc.currentFileSize() : null;
    up.send(JSON.stringify({
      type: "presence",
      file: s.file ? { name: s.file, size, duration: Math.round(s.length) } : null,
    }));
  }

  const { last } = session;
  // While playing, time is *supposed* to advance by the elapsed wall clock;
  // only a departure from that is a real seek (this ignores normal playback
  // and poll jitter). A drag spans several ticks, so we don't fire per tick —
  // we wait for the position to settle and then send ONE final seek.
  const elapsed = (Date.now() - last.at) / 1000;
  const expected = last.playing ? elapsed : 0;
  const jumped = Math.abs(s.time - last.time - expected) > 2;

  if (s.playing !== last.playing) {
    up.send(JSON.stringify({ type: s.playing ? "play" : "pause", time: s.time }));
    session.scrubbing = false; // the play/pause already carries the new position
  } else if (jumped) {
    session.scrubbing = true;  // mid-drag — hold off until it stops moving
  } else if (session.scrubbing) {
    up.send(JSON.stringify({ type: "seek", time: s.time })); // settled → final spot
    session.scrubbing = false;
  }
  session.last = snapshot(s);
}
