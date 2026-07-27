import { useEffect, useRef, useState } from "react";
import { connect } from "./lib/room.js";
import { createVoice } from "./lib/voice.js";
import Lobby from "./screens/Lobby.jsx";
import Room from "./screens/Room.jsx";

// Top-level state machine: lobby -> room. Owns the connection to the local
// agent (the agent, not the browser, talks to VLC + the sync server).
export default function App() {
  const [screen, setScreen] = useState("lobby");
  const [me, setMe] = useState({ name: "Alex", avatar: "🦊", vlcConnected: false });
  const [roomCode, setRoomCode] = useState("");
  const [roster, setRoster] = useState([]);
  const [messages, setMessages] = useState([]);
  const [fileCheck, setFileCheck] = useState(null);
  // Real local VLC state, pushed by the agent ~1x/sec. Single source of truth
  // for the Room screen — we never guess playback state in the UI.
  const [vlc, setVlc] = useState({ playing: false, time: 0, duration: 0, file: null });
  const [vlcTest, setVlcTest] = useState(null); // last { ok, error, file } from the agent
  const [vlcAuto, setVlcAuto] = useState(null); // last auto-setup result { ok, error, password }
  const [agentReady, setAgentReady] = useState(false);
  const [linkDown, setLinkDown] = useState(false); // sync-server link dropped, reconnecting
  const [micOn, setMicOn] = useState(false);
  const conn = useRef(null);
  const youId = useRef(null);      // our member id on the sync server
  const voice = useRef(null);      // WebRTC voice controller
  const audioEl = useRef(null);    // hidden <audio> that plays the peer

  function handle(msg) {
    switch (msg.type) {
      case "joined": youId.current = msg.youId; setRoomCode(msg.code); setScreen("room"); break;
      case "roster": setRoster(msg.members); break;
      case "system": setMessages((m) => [...m, { kind: "system", ...msg }]); break;
      case "chat": setMessages((m) => [...m, { kind: "chat", ...msg }]); break;
      case "filecheck": setFileCheck(msg); break;
      case "vlc-test-result": setVlcTest(msg); break;
      case "vlc-autosetup-result": setVlcAuto(msg); break;
      case "vlc-status": setVlc(msg); break;
      case "voice": voice.current?.handleSignal(msg); break;
      case "link": setLinkDown(!msg.up); break;
      case "error": alert(msg.message); break;
    }
  }

  useEffect(() => {
    conn.current = connect(handle);
    conn.current.ready().then(() => setAgentReady(true));
    return () => { conn.current?.close(); voice.current?.close(); };
  }, []);

  // Start a P2P voice call once a peer is in the room; tear it down when alone.
  useEffect(() => {
    const peer = roster.find((m) => m.id && m.id !== youId.current);
    if (peer && !voice.current) {
      voice.current = createVoice({
        sendSignal: (payload) => conn.current?.send({ type: "voice", ...payload }),
        onRemoteStream: (stream) => { if (audioEl.current) audioEl.current.srcObject = stream; },
        onError: (e) => console.warn("voice:", e?.message || e),
      });
      // One side initiates (stable rule: smaller id), so they don't both offer.
      voice.current.start(peer.id, String(youId.current) < String(peer.id));
    } else if (!peer && voice.current) {
      voice.current.close();
      voice.current = null;
      setMicOn(false);
    }
  }, [roster]);

  function toggleMic() {
    setMicOn((on) => {
      const next = !on;
      voice.current?.setMicEnabled(next);
      conn.current?.send({ type: "presence", micOn: next });
      return next;
    });
  }

  function testVlc(vlcPassword) {
    conn.current?.send({ type: "vlc-test", vlcPassword });
  }

  function autoSetupVlc(vlcPassword) {
    conn.current?.send({ type: "vlc-autosetup", vlcPassword });
  }

  function enterRoom({ create, code, vlcPassword, serverUrl }) {
    conn.current?.send({
      type: create ? "create" : "join",
      code,
      name: me.name,
      avatar: me.avatar,
      vlcPassword,
      serverUrl, // blank = the app's own built-in server (you host)
    });
  }

  if (screen === "lobby") {
    return (
      <Lobby me={me} setMe={setMe} onEnter={enterRoom} onTestVlc={testVlc}
        onAutoSetup={autoSetupVlc} vlcTest={vlcTest} vlcAuto={vlcAuto} agentReady={agentReady} />
    );
  }
  return (
    <>
      {linkDown && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, textAlign: "center",
          background: "#7a2b2b", color: "#fff", fontSize: 12, padding: "6px 12px" }}>
          Reconnecting to the sync server…
        </div>
      )}
      <Room
        me={me}
        roomCode={roomCode}
        roster={roster}
        messages={messages}
        fileCheck={fileCheck}
        vlc={vlc}
        micOn={micOn}
        onToggleMic={toggleMic}
        send={(obj) => conn.current?.send(obj)}
      />
      {/* Peer voice plays here (P2P WebRTC audio). */}
      <audio ref={audioEl} autoPlay />
    </>
  );
}
