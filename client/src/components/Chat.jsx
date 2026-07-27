import { useEffect, useRef, useState } from "react";
import Tooltip from "./Tooltip.jsx";

// Chat column: grey centered lines for system events (join, pause@time, jump),
// bubbles for messages.
export default function Chat({ messages, onSend }) {
  const [text, setText] = useState("");
  const endRef = useRef(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  function submit() {
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  }

  return (
    <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: 16, flex: 1, minWidth: 0,
      display: "flex", flexDirection: "column", height: 520 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>Chat</p>
        <Tooltip text="Grey lines are auto events (joins, pauses and jumps with timestamps). Bubbles are messages." />
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((m, i) =>
          m.kind === "system" ? (
            <p key={i} style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", margin: 0 }}>{m.text}</p>
          ) : (
            <Bubble key={i} m={m} />
          )
        )}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10, borderTop: "0.5px solid var(--border)", paddingTop: 10 }}>
        <input type="text" placeholder="Message" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()} style={{ flex: 1 }} />
        <button aria-label="Send message" onClick={submit} style={{ width: 36, height: 36, padding: 0 }}>➤</button>
      </div>
    </div>
  );
}

function Bubble({ m }) {
  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "85%" }}>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 2px" }}>{m.avatar} {m.from}</p>
      <div style={{ background: "var(--surface-2)", borderRadius: "var(--radius)", padding: "6px 10px" }}>
        <p style={{ fontSize: 13, margin: 0 }}>{m.text}</p>
      </div>
    </div>
  );
}
