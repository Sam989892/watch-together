// Keyboard shortcuts overlay (toggle with "?").
const SHORTCUTS = [
  ["Play / pause (both)", "Space"],
  ["Skip back / forward 10s", "← →"],
  ["Jump to timestamp", "G"],
  ["Re-sync everyone to me", "S"],
  ["Toggle mic (push-to-talk)", "M"],
  ["Focus chat", "C"],
  ["Toggle overlay", "H"],
  ["Show this list", "?"],
];

export default function Shortcuts({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface-2)", borderRadius: 12,
        padding: 24, width: 420, maxWidth: "90vw", boxShadow: "var(--shadow-popover)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>⌨ Keyboard shortcuts</span>
          <button aria-label="Close" onClick={onClose} style={{ border: "none", background: "none", fontSize: 16 }}>✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {SHORTCUTS.map(([label, key]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--surface-1)",
                border: "0.5px solid var(--border-strong)", borderRadius: 5, padding: "2px 8px" }}>{key}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
