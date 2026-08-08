// Local, on-device persistence: identity, recent rooms, and friends.
// Everything is in localStorage — no accounts, no server storage.

const K = { id: "wt-uid", recent: "wt-recent", friends: "wt-friends" };

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// Stable per-install id, shown as the shareable "friend code".
export function myId() {
  let id = null;
  try { id = localStorage.getItem(K.id); } catch {}
  if (!id) {
    id = "wt-" + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
    try { localStorage.setItem(K.id, id); } catch {}
  }
  return id;
}

// Recent room codes, most-recent first, capped.
export function recentRooms() { return read(K.recent, []); }
export function addRecentRoom(code) {
  if (!code) return;
  write(K.recent, [code, ...recentRooms().filter((c) => c !== code)].slice(0, 6));
}

// Friends: [{ id, name }].
export function friends() { return read(K.friends, []); }
export function addFriend(id, name) {
  id = (id || "").trim();
  if (!id || id === myId()) return friends();
  const list = [{ id, name: (name || "").trim() || id }, ...friends().filter((f) => f.id !== id)].slice(0, 30);
  write(K.friends, list);
  return list;
}
export function removeFriend(id) {
  const list = friends().filter((f) => f.id !== id);
  write(K.friends, list);
  return list;
}

// A room code both friends compute identically from their two ids, so "watch
// with X" lands you both in the same room with nothing to share.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function sharedRoomCode(a, b) {
  const key = [String(a), String(b)].sort().join("|");
  let h1 = 2166136261 >>> 0, h2 = 5381 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h1 = Math.imul(h1 ^ key.charCodeAt(i), 16777619) >>> 0;
    h2 = (Math.imul(h2, 33) ^ key.charCodeAt(i)) >>> 0;
  }
  const out = [];
  for (let i = 0; i < 3; i++) { out.push(ALPHABET[h1 % ALPHABET.length]); h1 = Math.floor(h1 / ALPHABET.length); }
  for (let i = 0; i < 3; i++) { out.push(ALPHABET[h2 % ALPHABET.length]); h2 = Math.floor(h2 / ALPHABET.length); }
  return out.slice(0, 3).join("") + "-" + out.slice(3, 6).join("");
}
