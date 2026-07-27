import { fmtTime } from "../lib/room.js";

// Shown when the two players don't have the same file. Offers transfer guidance
// so they end up byte-identical.
export default function FileMismatch({ files = [] }) {
  const gb = (b) => (b ? (b / 1e9).toFixed(2) + " GB" : "—");
  return (
    <div style={{ background: "var(--surface-2)", border: "0.5px solid var(--border-warning)",
      borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 4px" }}>⚠ Different files</p>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 12px" }}>
        You two aren't playing the same file, so sync would drift.
      </p>

      {files.map((f, i) => (
        <div key={i} style={{ background: "var(--surface-1)", border: "0.5px solid var(--border)",
          borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 8 }}>
          <p style={{ fontSize: 12, fontWeight: 500, margin: 0, wordBreak: "break-all" }}>{f.name}</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0", fontFamily: "var(--font-mono)" }}>
            {gb(f.size)} · {fmtTime(f.duration)}
          </p>
        </div>
      ))}

      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "8px 0" }}>
        To fix it, one of you sends the exact file to the other:
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <button style={{ textAlign: "left" }}>Share via Google Drive</button>
        <button style={{ textAlign: "left" }}>Share via WeTransfer</button>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12 }}>
        Tip: send the file rather than each downloading separately — that guarantees a byte-identical match.
      </p>
    </div>
  );
}
