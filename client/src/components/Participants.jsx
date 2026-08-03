import Tooltip from "./Tooltip.jsx";

// Participant avatars + room controls (chat alerts, shortcuts).
export default function Participants({ roster, me, alerts, onToggleAlerts, onShortcuts }) {
  const people = roster.length ? roster : [{ name: me.name, avatar: me.avatar, self: true }];

  return (
    <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 12, display: "flex",
      alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: 12 }}>
        {people.map((p) => {
          const self = p.name === me.name;
          return (
            <div key={p.id || p.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", fontSize: 15,
                background: self ? "var(--bg-accent)" : "var(--bg-pro)",
                display: "flex", alignItems: "center", justifyContent: "center" }}>{p.avatar}</div>
              <p style={{ fontSize: 12, fontWeight: 500, margin: 0 }}>{self ? "You" : p.name}</p>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Tooltip text="Voice chat is coming in a future update." align="right">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 36, padding: "0 10px",
            borderRadius: "var(--radius)", border: "0.5px solid var(--border)", background: "var(--surface-2)",
            fontSize: 11, color: "var(--text-muted)" }}>🎙 Voice · soon</span>
        </Tooltip>
        <Tooltip text="Pop-up chat alerts over the video (with a sound). Click to turn off." align="right">
          <button aria-label="Toggle chat alerts" onClick={onToggleAlerts}
            style={{ width: 36, height: 36, padding: 0 }}>{alerts ? "🔔" : "🔕"}</button>
        </Tooltip>
        <Tooltip text="Keyboard shortcuts (?)" align="right">
          <button aria-label="Shortcuts" onClick={onShortcuts}
            style={{ width: 36, height: 36, padding: 0 }}>⌨</button>
        </Tooltip>
      </div>
    </div>
  );
}
