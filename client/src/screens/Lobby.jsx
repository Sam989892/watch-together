import { useEffect, useRef, useState } from "react";
import { AVATARS, APP_VERSION, copyText } from "../lib/room.js";
import { myId, recentRooms, friends, addFriend, removeFriend, sharedRoomCode } from "../lib/store.js";
import Tooltip from "../components/Tooltip.jsx";

// Lobby: pick avatar + name, connect VLC, create or join a room.
export default function Lobby({ me, setMe, onEnter, onTestVlc, onAutoSetup, onOpenAudio, vlcTest, vlcAuto, agentReady }) {
  const [code, setCode] = useState("");
  const [vlcPass, setVlcPass] = useState(() => { try { return localStorage.getItem("wt-vlcpass") || ""; } catch { return ""; } });
  const [vlcState, setVlcState] = useState(me.vlcConnected ? "connected" : "idle");
  const [vlcError, setVlcError] = useState("");
  const [friendList, setFriendList] = useState(friends);
  const uid = myId();
  const recent = recentRooms();
  const autoTried = useRef(false);

  // Remember the VLC password so it doesn't have to be retyped each launch.
  useEffect(() => { try { localStorage.setItem("wt-vlcpass", vlcPass); } catch {} }, [vlcPass]);

  // Auto-connect VLC on launch if we already know the password — no clicking Test.
  useEffect(() => {
    if (agentReady && vlcPass && vlcState === "idle" && !autoTried.current) {
      autoTried.current = true;
      testVlc();
    }
  }, [agentReady, vlcState]); // eslint-disable-line react-hooks/exhaustive-deps

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

        {recent.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <Label>Recent rooms</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {recent.map((c) => (
                <button key={c} disabled={!agentReady}
                  onClick={() => onEnter({ create: false, code: c, vlcPassword: vlcPass, rejoin: true })}
                  style={{ fontSize: 12, fontFamily: "var(--font-mono)", padding: "4px 10px", height: 28 }}>↻ {c}</button>
              ))}
            </div>
          </div>
        )}

        <FriendsSection uid={uid} list={friendList} setList={setFriendList} disabled={!agentReady}
          onWatch={(fid) => onEnter({ create: false, code: sharedRoomCode(uid, fid), vlcPassword: vlcPass, rejoin: true })} />

        <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 14 }}>
          {agentReady ? (
            <Tooltip text="In VLC: Settings → Interface → enable Web (HTTP), set a password, paste it above.">
              How do I turn on VLC's remote control?
            </Tooltip>
          ) : (
            "Connecting to your local agent…"
          )}
        </p>
        <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 6, opacity: 0.7 }}>
          v{APP_VERSION}
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

// Friends = saved people. Share your code once, add each other, then "Watch"
// drops you both into the same room (a code both sides compute from the two ids).
function FriendsSection({ uid, list, setList, onWatch, disabled }) {
  const [fid, setFid] = useState("");
  const [fname, setFname] = useState("");
  const [copied, setCopied] = useState(false);

  function add() {
    if (!fid.trim()) return;
    setList(addFriend(fid, fname));
    setFid(""); setFname("");
  }

  return (
    <div style={{ marginTop: 20, borderTop: "0.5px solid var(--border)", paddingTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <Label>Friends</Label>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
          your code:
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{uid}</span>
          <button aria-label="Copy your friend code"
            onClick={async () => { if (await copyText(uid)) { setCopied(true); setTimeout(() => setCopied(false), 1200); } }}
            style={{ border: "none", background: "none", padding: 0, fontSize: 12, color: copied ? "var(--fill-success)" : "inherit" }}>
            {copied ? "✓" : "⧉"}
          </button>
        </span>
      </div>

      {list.map((f) => (
        <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
          <button disabled={disabled} onClick={() => onWatch(f.id)}
            style={{ fontSize: 12, padding: "4px 12px", height: 28 }}>Watch</button>
          <button aria-label="Remove friend" onClick={() => setList(removeFriend(f.id))}
            style={{ border: "none", background: "none", fontSize: 13, color: "var(--text-muted)" }}>✕</button>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: list.length ? 4 : 0 }}>
        <input type="text" placeholder="Friend's code" value={fid} onChange={(e) => setFid(e.target.value.trim())}
          style={{ flex: 1.3, fontSize: 12 }} />
        <input type="text" placeholder="Name" value={fname} onChange={(e) => setFname(e.target.value)}
          style={{ flex: 1, fontSize: 12 }} />
        <button disabled={!fid.trim()} onClick={add} style={{ fontSize: 12, padding: "4px 10px", height: 30 }}>Add</button>
      </div>
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
