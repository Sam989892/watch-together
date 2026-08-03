import { useEffect, useState } from "react";
import { AVATARS } from "../lib/room.js";
import Tooltip from "../components/Tooltip.jsx";

// Lobby: pick avatar + name, connect VLC, create or join a room.
export default function Lobby({ me, setMe, onEnter, onTestVlc, onAutoSetup, onOpenAudio, vlcTest, vlcAuto, agentReady }) {
  const [code, setCode] = useState("");
  const [vlcPass, setVlcPass] = useState("");
  const [vlcState, setVlcState] = useState(me.vlcConnected ? "connected" : "idle");
  const [vlcError, setVlcError] = useState("");

  // React to the real result the agent sends back after pinging local VLC.
  useEffect(() => {
    if (!vlcTest) return;
    if (vlcTest.ok) {
      setVlcState("connected");
      setVlcError("");
      setMe((m) => ({ ...m, vlcConnected: true }));
    } else {
      setVlcState("idle");
      setVlcError(vlcTest.error || "Couldn't connect.");
      setMe((m) => ({ ...m, vlcConnected: false }));
    }
  }, [vlcTest]);

  // React to auto-setup: on success the agent hands back the password it set.
  useEffect(() => {
    if (!vlcAuto) return;
    if (vlcAuto.ok) {
      setVlcPass(vlcAuto.password);
      setVlcState("connected");
      setVlcError("");
      setMe((m) => ({ ...m, vlcConnected: true }));
    } else {
      setVlcState("idle");
      setVlcError(vlcAuto.error || "Auto-setup failed.");
    }
  }, [vlcAuto]);

  function testVlc() {
    setVlcState("testing");
    setVlcError("");
    onTestVlc(vlcPass);
  }

  function autoSetup() {
    setVlcState("setup");
    setVlcError("");
    onAutoSetup(vlcPass); // empty = agent generates one and returns it
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: 400, background: "var(--surface-1)", borderRadius: 12, padding: 24 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>Watch together</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "6px 0 0" }}>
            Play the same file, perfectly in sync.
          </p>
        </div>

        <Label>Pick your avatar</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {AVATARS.map((a) => (
            <button key={a} onClick={() => setMe((m) => ({ ...m, avatar: a }))}
              aria-label={`Avatar ${a}`}
              style={{ width: 40, height: 40, padding: 0, borderRadius: "50%", fontSize: 19,
                background: me.avatar === a ? "var(--bg-accent)" : "var(--surface-2)",
                border: me.avatar === a ? "2px solid var(--border-accent)" : "0.5px solid var(--border)" }}>
              {a}
            </button>
          ))}
        </div>

        <Label>Display name</Label>
        <input type="text" value={me.name} onChange={(e) => setMe((m) => ({ ...m, name: e.target.value }))}
          style={{ width: "100%", marginBottom: 18 }} />

        <VlcRow state={vlcState} pass={vlcPass} setPass={setVlcPass} onTest={testVlc}
          onAutoSetup={autoSetup} error={vlcError} disabled={!agentReady} />


        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <input type="text" placeholder="Enter room code" value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ flex: 1 }} />
          <button disabled={!code || !agentReady}
            onClick={() => onEnter({ create: false, code, vlcPassword: vlcPass })}>Join</button>
        </div>

        <Divider />

        <button className="primary" style={{ width: "100%", marginTop: 8 }} disabled={!agentReady}
          onClick={() => onEnter({ create: true, vlcPassword: vlcPass })}>
          + Create a new room
        </button>

        <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 14 }}>
          {agentReady ? (
            <Tooltip text="In VLC: Settings → Interface → enable Web (HTTP), set a password, paste it above.">
              How do I turn on VLC's remote control?
            </Tooltip>
          ) : (
            "Connecting to your local agent…"
          )}
        </p>
      </div>
    </div>
  );
}

function VlcRow({ state, pass, setPass, onTest, onAutoSetup, error, disabled }) {
  const connected = state === "connected";
  const busy = state === "testing" || state === "setup";
  return (
    <div style={{ background: "var(--surface-2)", border: `0.5px solid ${connected ? "var(--border-success)" : error ? "var(--border-danger, #a33)" : "var(--border)"}`,
      borderRadius: "var(--radius)", padding: "10px 12px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%",
          background: connected ? "var(--fill-success)" : "var(--text-muted)" }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>
            {connected ? "VLC connected" : "Connect your VLC"}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
            {connected ? "localhost:8080 · ready"
              : state === "setup" ? "Configuring VLC and restarting it…"
              : "Let us set it up, or enter your password"}
          </p>
        </div>
        <button onClick={onTest} disabled={disabled || busy} style={{ fontSize: 12, padding: "4px 10px", height: 28 }}>
          {busy ? "…" : connected ? "Re-test" : "Test"}
        </button>
      </div>
      {!connected && (
        <>
          <input type="password" placeholder="VLC password" value={pass}
            onChange={(e) => setPass(e.target.value)} style={{ width: "100%", marginTop: 8 }} />
          <button onClick={onAutoSetup} disabled={disabled || busy}
            style={{ width: "100%", marginTop: 8, fontSize: 12, height: 30 }}>
            {state === "setup" ? "Setting up VLC…" : "⚡ Set up VLC for me (restarts VLC)"}
          </button>
        </>
      )}
      {error && (
        <p style={{ fontSize: 11, color: "var(--text-danger, #e66)", margin: "8px 0 0" }}>{error}</p>
      )}
    </div>
  );
}

const Label = ({ children }) => (
  <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 8px", color: "var(--text-secondary)" }}>{children}</p>
);

const Divider = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
    <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>or</span>
    <div style={{ flex: 1, height: "0.5px", background: "var(--border)" }} />
  </div>
);
