import { useEffect, useState } from "react";
import { fmtTime, parseTime, copyText } from "../lib/room.js";
import Tooltip from "../components/Tooltip.jsx";
import Chat from "../components/Chat.jsx";
import Participants from "../components/Participants.jsx";
import SyncBar from "../components/SyncBar.jsx";
import Shortcuts from "../components/Shortcuts.jsx";
import FileMismatch from "../components/FileMismatch.jsx";

// Main room. Shows the now-playing status panel, sync controls, participants,
// and the chat column. Wires keyboard shortcuts to sync actions.
export default function Room({ me, roomCode, roster, messages, fileCheck, vlc, net, alerts, onToggleAlerts, onLeave, send }) {
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Playback state is whatever local VLC actually reports (via the agent).
  const { playing, time, duration } = vlc;

  // Send a command; the agent applies it to VLC and the next status push
  // renders the result. No optimistic state to drift out of sync.
  function control(type, t = time) {
    send({ type, time: t });
  }

  function jumpTo(str) {
    const t = parseTime(str);
    if (t == null) return;
    control("jump", Math.min(t, duration));
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "INPUT") return;
      switch (e.key) {
        case " ": e.preventDefault(); control(playing ? "pause" : "play"); break;
        case "ArrowLeft": control("seek", Math.max(0, time - 10)); break;
        case "ArrowRight": control("seek", Math.min(duration, time + 10)); break;
        case "s": case "S": control("jump", time); break;
        case "?": setShowShortcuts((v) => !v); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, time]);

  return (
    <div style={{ minHeight: "100vh", padding: 20 }}>
      <div style={{ display: "flex", gap: 12, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: 20, flex: 1.4, minWidth: 0 }}>
          <Header roomCode={roomCode} onLeave={onLeave} />

          <Share roomCode={roomCode} />

          {fileCheck && !fileCheck.match ? (
            <FileMismatch files={fileCheck.files} />
          ) : (
            <NowPlaying file={vlc.file} duration={duration} />
          )}

          <SyncBar
            playing={playing} time={time} duration={duration}
            onToggle={() => control(playing ? "pause" : "play")}
            onSeek={(t) => control("seek", t)}
            onJump={jumpTo}
          />

          <Participants roster={roster} me={me} alerts={alerts} onToggleAlerts={onToggleAlerts}
            onShortcuts={() => setShowShortcuts(true)} />
        </div>

        <Chat messages={messages} onSend={(text) => send({ type: "chat", text })} />
      </div>

      {showShortcuts && <Shortcuts onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}

function Header({ roomCode, onLeave }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <span style={{ fontSize: 14, fontWeight: 500 }}>🎬 Movie night</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--surface-2)",
          border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "4px 10px" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>room</span>
          <span style={{ fontSize: 12, fontWeight: 500, fontFamily: "var(--font-mono)" }}>{roomCode}</span>
          <CopyButton value={roomCode} label="room code" />
        </div>
        <Tooltip text="Leave this room and go back." align="right">
          <button onClick={onLeave} style={{ fontSize: 12, padding: "5px 10px", height: 28 }}>Leave</button>
        </Tooltip>
      </div>
    </div>
  );
}

// A small "copy" button that actually confirms it copied (with a fallback for
// contexts where the async clipboard API is blocked).
function CopyButton({ value, label }) {
  const [ok, setOk] = useState(false);
  return (
    <Tooltip text={`Copy the ${label} and send it to your friend.`} align="right">
      <button aria-label={`Copy ${label}`}
        onClick={async () => { if (await copyText(value)) { setOk(true); setTimeout(() => setOk(false), 1200); } }}
        style={{ border: "none", background: "none", padding: 0, fontSize: 13, color: ok ? "var(--fill-success)" : "inherit" }}>
        {ok ? "✓" : "⧉"}
      </button>
    </Tooltip>
  );
}

// Everyone's on the same hosted server, so joining needs only the room code.
function Share({ roomCode }) {
  return (
    <div style={{ background: "var(--bg-accent, var(--surface-2))", border: "0.5px solid var(--border-accent, var(--border))",
      borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
      <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 8px" }}>Send your friend this code so they can join:</p>
      <ShareChip label="Room code" value={roomCode} copyable />
    </div>
  );
}

function ShareChip({ label, value, copyable }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-1)",
      border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "5px 10px" }}>
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, fontFamily: "var(--font-mono)" }}>{value}</span>
      {copyable && <CopyButton value={value} label={label.toLowerCase()} />}
    </div>
  );
}

function NowPlaying({ file, duration }) {
  return (
    <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--text-secondary)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fill-success)" }} />
          Connected to VLC
          <Tooltip text="The app controls your local VLC. Playback happens in VLC, so any format and subtitle works." />
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--bg-success)",
          borderRadius: "var(--radius)", padding: "3px 8px", fontSize: 11, color: "var(--text-success)" }}>
          ✓ both in sync
        </span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 2px" }}>Now playing in VLC</p>
      <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 4px" }}>{file || "Nothing open in VLC yet"}</p>
      {duration > 0 && (
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>{fmtTime(duration)} long</p>
      )}
    </div>
  );
}
