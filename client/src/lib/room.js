// Thin WebSocket wrapper for the local agent + shared helpers.
// The browser never talks to the sync server directly — it can't reach VLC
// (no CORS, digest auth), so the local agent is the bridge for everything.

export const AGENT_URL = import.meta.env.VITE_AGENT || "ws://localhost:8899";
export const AVATARS = ["🦊", "🐼", "🐸", "🐙", "🦉", "🐢", "🦝", "🐱"];

export function fmtTime(t) {
  if (t == null || isNaN(t)) return "0:00";
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

// Parse "1:04:30" / "12:04" / "90" into seconds.
export function parseTime(str) {
  if (!str) return null;
  const parts = String(str).trim().split(":").map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function connect(onMessage) {
  const ws = new WebSocket(AGENT_URL);
  const pending = [];
  ws.addEventListener("message", (e) => {
    try { onMessage(JSON.parse(e.data)); } catch {}
  });
  // Anything sent before the socket opens is queued, not dropped — otherwise a
  // click landing during connect silently does nothing.
  ws.addEventListener("open", () => {
    while (pending.length) ws.send(pending.shift());
  });
  return {
    ws,
    send: (obj) => {
      const data = JSON.stringify(obj);
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
      else if (ws.readyState === WebSocket.CONNECTING) pending.push(data);
    },
    ready: () => new Promise((res) => (ws.readyState === 1 ? res() : ws.addEventListener("open", res))),
    close: () => ws.close(),
  };
}
