// Thin WebSocket wrapper for the local agent + shared helpers.
// The browser never talks to the sync server directly — it can't reach VLC
// (no CORS, digest auth), so the local agent is the bridge for everything.

// Use 127.0.0.1, not "localhost": on Windows "localhost" can resolve to IPv6
// (::1) while the agent binds IPv4, so the UI silently fails to connect.
export const AGENT_URL = import.meta.env.VITE_AGENT || "ws://127.0.0.1:8899";

// The app's version (from Electron); "dev" when run in a plain browser.
export const APP_VERSION = (typeof window !== "undefined" && window.appInfo?.version) || "dev";
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

// Copy with a fallback for when the async clipboard API is blocked (common in
// Electron / non-secure contexts).
export async function copyText(text) {
  // Electron: go through the main process (most reliable). See preload.cjs.
  try { if (window.appClipboard) { await window.appClipboard.write(text); return true; } } catch {}
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
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
