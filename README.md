# Watch Together

A **synced watch-party app** that controls the VLC each person already has, so two
(or more) people can watch the same local video file in perfect sync — pause, play,
seek, and a manual "jump to timestamp" all mirror across everyone's machine.

Because real VLC does the playback, **every format and every subtitle just works**
(MKV, AVI, H.265, embedded subs, multiple audio tracks) on both macOS and Windows.
This app is only the "sync brain" + room + chat + voice + avatars.

> Prior art: [Syncplay](https://syncplay.pl) proves the VLC-control approach works.
> This project differentiates with cute avatars, built-in voice chat, timestamped
> chat events, a file-match check, and an auto-hiding overlay.

---

## Why this approach (not a browser player)

A browser `<video>` tag only reliably plays MP4/WebM and cannot read subtitles
embedded inside an MKV. Building a full in-browser player means compiling ffmpeg to
WASM — slow and stuttery for a full movie. Instead we let VLC play, and our app
sends it remote-control commands over VLC's built-in HTTP interface. No format
limits, no subtitle extraction, far less code.

---

## Architecture

```
   Machine A                         Machine B
 ┌───────────┐                     ┌───────────┐
 │  VLC (A)  │◀── HTTP :8080 ──┐   │  VLC (B)  │◀── HTTP :8080 ──┐
 └───────────┘                 │   └───────────┘                 │
 ┌─────────────────────────┐   │   ┌─────────────────────────┐   │
 │  Agent + UI (A)         │───┘   │  Agent + UI (B)         │───┘
 │  - polls local VLC      │       │  - polls local VLC      │
 │  - renders React UI     │       │  - renders React UI     │
 └───────────┬─────────────┘       └───────────┬─────────────┘
             │        WebSocket                 │
             └──────────────┬───────────────────┘
                            ▼
                 ┌────────────────────┐
                 │   Sync Server      │  (hosted once, tiny)
                 │  - rooms + codes   │
                 │  - relays events   │
                 │  - chat + presence │
                 └────────────────────┘
```

- **Sync Server** (`/server`) — a small Node + WebSocket relay. Holds room state,
  relays play/pause/seek/jump events, chat messages, presence, and runs the
  file-match check. No video ever passes through it — only tiny JSON messages.
- **Agent** (`/agent`) — runs on each user's machine, talks to their **local** VLC
  over HTTP (read position, send play/pause/seek), and bridges VLC ↔ sync server.
  In v1 the agent also serves the UI locally. Later this becomes the Electron main
  process so it ships as one Mac/Windows app.
- **Client** (`/client`) — the React UI (Lobby, Room, overlay, chat, shortcuts),
  styled with the Claude Design System tokens so it can be refined in Claude Design.

### Why VLC can't be called straight from the browser
VLC's HTTP interface lives on `localhost` with digest auth and no CORS headers, so a
web page can't call it directly. The **agent** (Node / Electron main process) makes
those calls. That's why the project is split into `agent` + `client` rather than a
pure website.

---

## Screens (designed, ready to build against)

1. **Lobby** — pick avatar + name, connect VLC, create or join a room by code.
2. **VLC setup helper** — one-time: enable VLC's Web (HTTP) interface, set password.
3. **Room** — now-playing status panel (connected to VLC ✓, file name, subs, audio),
   synced scrub bar, manual "jump to timestamp → Sync both", participants with mic
   status, and a chat column.
4. **File mismatch** — if the two files differ (size/duration), show both and offer
   Google Drive / WeTransfer transfer guidance so they end up byte-identical.
5. **Auto-hiding overlay** — when watching, the UI rides on top of VLC and fades out
   after 3s of no movement; mouse move or any keypress brings it back.

### Keyboard shortcuts
| Action | Key |
|---|---|
| Play / pause (both) | `Space` |
| Skip back / forward 10s | `←` `→` |
| Jump to timestamp | `G` |
| Re-sync everyone to me | `S` |
| Toggle mic (push-to-talk) | `M` |
| Focus chat | `C` |
| Toggle overlay | `H` |
| Show shortcuts | `?` |

---

## Run it (dev)

```bash
npm run install:all     # installs server + agent + client

# 1. Sync server (one terminal)
npm run server          # http+ws on :8787, health check at GET /

# 2. The local pair — agent + client UI (another terminal)
npm run dev             # agent on :8899, client on http://localhost:5173
```

To connect VLC, either click **"⚡ Set up VLC for me"** in the Lobby (it turns on
VLC's Web interface and restarts VLC for you), or do it by hand: **VLC → Settings →
Interface → enable Web (HTTP)**, set a password, then paste it in "Connect VLC".

---

## Run as one desktop app (no terminals)

The `desktop/` folder wraps the agent + UI in Electron, so it launches as a single
window instead of separate commands.

```bash
cd desktop && npm install
npm start                # dev: opens the app window, agent runs inside it

npm run pack             # build an unpacked .app (unsigned, for local testing)
npm run dist             # build installers (.dmg / .exe / AppImage)
```

`npm run dist` needs your own signing certificate (Apple Developer ID on macOS) to
produce a distributable, notarized build; unsigned `pack` output runs locally.
Set the sync-server URL the app ships with via `SERVER` when building.

---

## Playing with a friend

The desktop app **carries its own sync server**, so no separate hosting is needed —
one person hosts, the other points at them.

**Host (you):** open the app, connect VLC, leave the server field blank, and
**Create a new room**. You're now hosting on your own machine. Share two things:
your **server address** and the **room code**.

**Join (your friend):** open the app, connect VLC, type your address in
**"Friend's server address"**, enter the room code, **Join**.

What address to share depends on where your friend is:

- **Same Wi-Fi / LAN:** your machine's local IP, e.g. `192.168.1.5` (the app fills in
  the port). Easiest, nothing to install.
- **Over the internet:** expose your server port (8787) with a tunnel and share the
  `https://…` URL — the app converts it to a secure `wss://` automatically.

Prefer an **always-on** server instead of hosting from your own app? The `server/`
folder is a plain Node app (reads `PORT`, has a health check and a `Dockerfile`):
deploy it to Railway / Render / Fly, then every viewer types that URL as the address.

> Rooms live in the host's memory — if the host closes the app, re-create the room.
> The agent auto-reconnects and re-joins across brief network blips.

---

## Using with Claude Code + Claude Design

- Open this folder in **Claude Code**.
- Run `/design-sync` to pull these design tokens into Claude Design, so screens you
  generate/edit on the canvas use the real components in `/client/src`.
- The design tokens live in `client/src/theme.css` — that's the source of truth the
  sync reads from.

---

## Roadmap
- [x] v1: real VLC control (play/pause/seek/jump), live status, chat, file-match
- [x] Auto-reconnect + re-join across network blips
- [x] Deployable sync server (HTTP health, `PORT`, Dockerfile)
- [ ] Two-machine test over the internet (needs a hosted server + a second person)
- [ ] Voice chat (WebRTC via the sync server for signaling + public STUN)
- [ ] Auto-hiding overlay wired to real VLC fullscreen
- [ ] Package agent + client as one Electron app (Mac + Windows installers)
- [ ] More than 2 participants
- [ ] Optional: YouTube sync (IFrame Player API) as a separate mode