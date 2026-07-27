import { useState } from "react";
import { fmtTime } from "../lib/room.js";
import Tooltip from "./Tooltip.jsx";

// Synced scrub bar + manual "jump to timestamp" control.
export default function SyncBar({ playing, time, duration, onToggle, onSeek, onJump }) {
  // Structured h : m : s entry — clearer than a free-text box for a layman.
  const [hms, setHms] = useState({ h: "", m: "", s: "" });
  const setPart = (k) => (e) => setHms((p) => ({ ...p, [k]: e.target.value.replace(/\D/g, "").slice(0, 2) }));

  function submitJump() {
    const secs = (+hms.h || 0) * 3600 + (+hms.m || 0) * 60 + (+hms.s || 0);
    onJump(String(secs));            // Room clamps to the video length
    setHms({ h: "", m: "", s: "" });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Tooltip text="Pause or play — it happens on both VLCs at once.">
          <button aria-label={playing ? "Pause" : "Play"} onClick={onToggle}
            style={{ border: "none", background: "none", padding: 0, fontSize: 18 }}>
            {playing ? "⏸" : "▶"}
          </button>
        </Tooltip>
        <input type="range" min={0} max={duration || 1} value={time} disabled={!duration}
          onChange={(e) => onSeek(Number(e.target.value))} style={{ flex: 1 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fmtTime(time)}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{fmtTime(duration)}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, background: "var(--surface-2)",
        border: "0.5px solid var(--border)", borderRadius: "var(--radius)", padding: "6px 8px" }}>
        <Tooltip text="Enter an exact time and everyone's video jumps there. Great for rewinds." />
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Jump to</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }} onKeyDown={(e) => e.key === "Enter" && submitJump()}>
          <TimeBox label="hh" value={hms.h} onChange={setPart("h")} />
          <Colon />
          <TimeBox label="mm" value={hms.m} onChange={setPart("m")} />
          <Colon />
          <TimeBox label="ss" value={hms.s} onChange={setPart("s")} />
        </div>
        <button onClick={submitJump} style={{ fontSize: 12, padding: "4px 10px", height: 28, marginLeft: "auto" }}>
          Sync both
        </button>
      </div>
    </>
  );
}

// Two-digit time field (hours / minutes / seconds).
function TimeBox({ label, value, onChange }) {
  return (
    <input type="text" inputMode="numeric" placeholder={label} value={value} onChange={onChange}
      aria-label={label} style={{ width: 34, textAlign: "center", padding: "4px 0", height: 28,
        fontFamily: "var(--font-mono)", fontSize: 13 }} />
  );
}

const Colon = () => <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>:</span>;
