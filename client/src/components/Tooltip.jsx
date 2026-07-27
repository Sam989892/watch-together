import { useState } from "react";

// Simple hover/focus tooltip with a help affordance.
export default function Tooltip({ text, children, align = "center" }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", cursor: "help" }}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} tabIndex={0}>
      {children ?? <span aria-hidden style={{ color: "var(--text-muted)" }}>ⓘ</span>}
      {open && (
        <span role="tooltip" style={{
          position: "absolute", bottom: "130%",
          left: align === "right" ? "auto" : "50%",
          right: align === "right" ? 0 : "auto",
          transform: align === "right" ? "none" : "translateX(-50%)",
          background: "var(--surface-3)", color: "var(--text-primary)",
          border: "0.5px solid var(--border-strong)", boxShadow: "var(--shadow-popover)",
          borderRadius: "var(--radius)", padding: "7px 9px", fontSize: 11, lineHeight: 1.45,
          width: 180, zIndex: 30, textAlign: "left", fontWeight: 400 }}>
          {text}
        </span>
      )}
    </span>
  );
}
