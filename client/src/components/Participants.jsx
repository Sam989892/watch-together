import Tooltip from "./Tooltip.jsx";

// Participant avatars with mic status + mic/invite/shortcut controls.
export default function Participants({ roster, me, micOn, onToggleMic, onShortcuts }) {
  const people = roster.length ? roster : [{ name: me.name, avatar: me.avatar, micOn, self: true }];

  return (
    <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 12, display: "flex",
      alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: 12 }}>
        {people.map((p) => {
          const self = p.name === me.name;
          const speaking = self ? micOn : p.micOn;
          return (
            <div key={p.id || p.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", fontSize: 15,
                background: self ? "var(--bg-accent)" : "var(--bg-pro)",
                display: "flex", alignItems: "center", justifyContent: "center" }}>{p.avatar}</div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, margin: 0 }}>{self ? "You" : p.name}</p>
                <p style={{ fontSize: 11, margin: 0, color: speaking ? "var(--text-secondary)" : "var(--text-muted)" }}>
                  {speaking ? "🎙 speaking" : "muted"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Tooltip text="Mute or unmute your voice chat. (Shortcut: M)" align="right">
          <button aria-label="Toggle microphone" onClick={onToggleMic}
            style={{ width: 36, height: 36, padding: 0 }}>{micOn ? "🎙" : "🔇"}</button>
        </Tooltip>
        <Tooltip text="Copy an invite link to add more people." align="right">
          <button aria-label="Invite" style={{ width: 36, height: 36, padding: 0 }}>＋</button>
        </Tooltip>
        <Tooltip text="Keyboard shortcuts (?)" align="right">
          <button aria-label="Shortcuts" onClick={onShortcuts}
            style={{ width: 36, height: 36, padding: 0 }}>⌨</button>
        </Tooltip>
      </div>
    </div>
  );
}
