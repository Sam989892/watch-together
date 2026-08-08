// Watch Together — Sync Server
// A tiny WebSocket relay. Holds room state and forwards sync/chat/presence
// events between members of a room. No video data ever touches this server.

import { createServer } from "http";
import { WebSocketServer } from "ws";

const PORT = process.env.PORT || 8787;

// Plain HTTP server so hosting platforms (Railway/Render/Fly) get a 200 on
// their health check; the WebSocket relay shares the same port via upgrade.
const http = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Watch Together sync server — ok\n");
});
const wss = new WebSocketServer({ server: http });

/** @type {Map<string, Room>} */
const rooms = new Map();

// Match room codes forgivingly: ignore case, spaces, and the hyphen, so
// "abc def", "ABCDEF" and "ABC-DEF" all find the same room.
const norm = (c) => (c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function makeCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const pick = (n) => Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join("");
  return `${pick(3)}-${pick(3)}`;
}

class Room {
  constructor(code) {
    this.code = code;
    this.members = new Map(); // socketId -> member
    this.hostId = null;       // whoever controls playback source-of-truth
    this.playback = { playing: false, time: 0, updatedAt: Date.now() };
  }
  broadcast(obj, exceptId = null) {
    const msg = JSON.stringify(obj);
    for (const m of this.members.values()) {
      if (m.id !== exceptId && m.socket.readyState === 1) m.socket.send(msg);
    }
  }
  roster() {
    return [...this.members.values()].map((m) => ({
      id: m.id, name: m.name, avatar: m.avatar,
      micOn: m.micOn, vlcConnected: m.vlcConnected,
      file: m.file, appVersion: m.appVersion, isHost: m.id === this.hostId,
    }));
  }
}

let nextId = 1;

wss.on("connection", (socket) => {
  const id = String(nextId++);
  let room = null;
  const self = { id, socket, name: "Guest", avatar: "🦊", micOn: false, vlcConnected: false, file: null, appVersion: null };

  const send = (obj) => socket.readyState === 1 && socket.send(JSON.stringify(obj));

  socket.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "create": {
        let code = makeCode();
        while (rooms.has(norm(code))) code = makeCode();
        room = new Room(code);
        rooms.set(norm(code), room);   // keyed by normalized code; room.code stays pretty
        joinRoom(msg);
        break;
      }
      case "join": {
        room = rooms.get(norm(msg.code));
        if (!room) {
          // A reconnecting client re-creates its room if the server restarted and
          // lost it, so a watch party survives a server restart. A fresh join with
          // a wrong code still gets "not found".
          if (msg.rejoin && msg.code) {
            room = new Room(msg.code);
            rooms.set(norm(msg.code), room);
          } else {
            return send({ type: "error", code: "no_room", message: "Room not found — check the code." });
          }
        }
        joinRoom(msg);
        break;
      }
      // Playback control — relayed to everyone else + kept as room state.
      case "play":
      case "pause":
      case "seek":
      case "jump": {
        if (!room) return;
        room.playback = { playing: msg.type !== "pause", time: msg.time ?? room.playback.time, updatedAt: Date.now() };
        room.broadcast({ type: msg.type, time: msg.time, by: self.name, at: fmt(msg.time) }, self.id);
        // System event line for the chat column
        room.broadcast(sysEvent(msg, self.name));
        break;
      }
      case "chat": {
        if (!room || !msg.text) return;
        room.broadcast({ type: "chat", id: self.id, from: self.name, avatar: self.avatar, text: String(msg.text).slice(0, 500), ts: Date.now() });
        break;
      }
      case "presence": {
        // mic toggle, vlc status, current file — update + re-broadcast roster
        if (typeof msg.micOn === "boolean") self.micOn = msg.micOn;
        if (typeof msg.vlcConnected === "boolean") self.vlcConnected = msg.vlcConnected;
        if (msg.file) self.file = msg.file; // { name, size, duration }
        if (!room) return;
        room.broadcast({ type: "roster", members: room.roster() });
        checkFileMatch();
        break;
      }
      case "voice": {
        // WebRTC signaling passthrough (offer/answer/candidate) to a target peer
        if (!room || !msg.to) return;
        const target = room.members.get(msg.to);
        if (target) target.socket.send(JSON.stringify({ ...msg, from: self.id }));
        break;
      }
    }
  });

  socket.on("close", () => {
    if (!room) return;
    room.members.delete(self.id);
    room.broadcast(sysLine(`${self.name} left the room`));
    if (room.hostId === self.id) room.hostId = [...room.members.keys()][0] || null;
    if (room.members.size === 0) rooms.delete(norm(room.code));
    else room.broadcast({ type: "roster", members: room.roster() });
  });

  function joinRoom(msg) {
    self.name = (msg.name || "Guest").slice(0, 24);
    self.avatar = msg.avatar || "🦊";
    self.vlcConnected = !!msg.vlcConnected;
    self.file = msg.file || null;
    self.appVersion = msg.appVersion || null;
    room.members.set(self.id, self);
    if (!room.hostId) room.hostId = self.id;
    send({ type: "joined", code: room.code, youId: self.id, playback: room.playback });
    room.broadcast({ type: "roster", members: room.roster() });
    room.broadcast(sysLine(`${self.name} joined the room`), self.id);
    checkFileMatch();
  }

  function checkFileMatch() {
    if (!room || room.members.size < 2) return;
    const files = [...room.members.values()].map((m) => m.file).filter(Boolean);
    if (files.length < 2) return;
    const [a, b] = files;
    const match = a.size && b.size ? a.size === b.size : Math.abs((a.duration || 0) - (b.duration || 0)) < 2;
    room.broadcast({ type: "filecheck", match, files });
  }
});

function fmt(t) {
  if (t == null) return "";
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

function sysEvent(msg, who) {
  const at = fmt(msg.time);
  const text = {
    play: `${who} resumed the video at ${at}`,
    pause: `${who} paused the video at ${at}`,
    seek: `${who} scrubbed to ${at}`,
    jump: `${who} jumped everyone to ${at}`,
  }[msg.type];
  return sysLine(text);
}

const sysLine = (text) => ({ type: "system", text, ts: Date.now() });

// Bind all interfaces so a friend on the same network can reach this host by IP.
http.listen(PORT, "0.0.0.0", () => console.log(`Watch Together sync server on port ${PORT}`));
