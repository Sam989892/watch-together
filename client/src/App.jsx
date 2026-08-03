import { useEffect, useRef, useState } from "react";
import { connect } from "./lib/room.js";
import { createVoice } from "./lib/voice.js";
import Lobby from "./screens/Lobby.jsx";
import Room from "./screens/Room.jsx";
import AudioSettings from "./components/AudioSettings.jsx";

// Voice chat is built (WebRTC) but disabled until relay reliability is sorted —
// shown as "coming soon" in the UI. Flip to true to re-enable.
const VOICE_ENABLED = false;

// Top-level state machine: lobby -> room. Owns the connection to the local
// agent (the agent, not the browser, talks to VLC + the sync server).
// Remember the last name + avatar between launches.
function loadMe() {
  try {
    const s = JSON.parse(localStorage.getItem("wt-me") || "{}");
    return { name: s.name || "Alex", avatar: s.avatar || "🦊", vlcConnected: false };
  } catch { return { name: "Alex", avatar: "🦊", vlcConnected: false }; }
}

export default function App() {
  const [screen, setScreen] = useState("lobby");
  const [me, setMe] = useState(loadMe);
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
  const [audio, setAudio] = useState({ inputId: "", outputId: "" }); // "" = system default
  const [showAudio, setShowAudio] = useState(false);
  const [net, setNet] = useState({ hosting: false, hostIp: null }); // who's hosting + share address
  const [alerts, setAlerts] = useState(true); // floating chat overlay + sound on/off
  const conn = useRef(null);
  const youId = useRef(null);      // our member id on the sync server
  const voice = useRef(null);      // WebRTC voice controller
  const audioEl = useRef(null);    // hidden <audio> that plays the peer

  function handle(msg) {
    switch (msg.type) {
      case "joined": youId.current = msg.youId; setRoomCode(msg.code); setScreen("room"); break;
      case "roster": setRoster(msg.members); break;
      case "system": setMessages((m) => [...m, { kind: "system", ...msg }]); break;
      case "chat":
        setMessages((m) => [...m, { kind: "chat", ...msg }]);
        // Pop the floating overlay for messages from the other person (not our own).
        if (msg.id !== youId.current) window.appOverlay?.notify({ from: msg.from, avatar: msg.avatar, text: msg.text });
        break;
      case "filecheck": setFileCheck(msg); break;
      case "vlc-test-result": setVlcTest(msg); break;
      case "vlc-autosetup-result": setVlcAuto(msg); break;
      case "vlc-status": setVlc(msg); break;
      case "net-info": setNet({ hosting: msg.hosting, hostIp: msg.hostIp }); break;
      case "voice": voice.current?.handleSignal(msg); break;
      case "link": setLinkDown(!msg.up); break;
      case "error": alert(msg.message); break;
    }
  }

  // Leave the room: drop the agent link (which ends our room membership), reset,
  // and reconnect a fresh link for the lobby.
  function leaveRoom() {
    voice.current?.close();
    voice.current = null;
    conn.current?.close();
    youId.current = null;
    setRoster([]); setMessages([]); setFileCheck(null); setMicOn(false);
    setNet({ hosting: false, hostIp: null });
    conn.current = connect(handle);
    conn.current.ready().then(() => setAgentReady(true));
    setScreen("lobby");
  }

  useEffect(() => {
    conn.current = connect(handle);
    conn.current.ready().then(() => setAgentReady(true));
    return () => { conn.current?.close(); voice.current?.close(); };
  }, []);

  // Remember the chosen name + avatar for next launch.
  useEffect(() => {
    try { localStorage.setItem("wt-me", JSON.stringify({ name: me.name, avatar: me.avatar })); } catch {}
  }, [me.name, me.avatar]);

  function toggleAlerts() {
    setAlerts((on) => { const next = !on; window.appOverlay?.setEnabled(next); return next; });
  }

  // Start a P2P voice call once a peer is in the room; tear it down when alone.
  useEffect(() => {
    if (!VOICE_ENABLED) return; // voice chat is "coming soon" — see the mic button
    const peer = roster.find((m) => m.id && m.id !== youId.current);
    if (peer && !voice.current) {
      voice.current = createVoice({
        inputId: audio.inputId,
        sendSignal: (payload) => conn.current?.send({ type: "voice", ...payload }),
        onRemoteStream: (stream) => {
          if (!audioEl.current) return;
          audioEl.current.srcObject = stream;
          if (audio.outputId && audioEl.current.setSinkId) audioEl.current.setSinkId(audio.outputId).catch(() => {});
        },
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

  // Apply audio device choices — live to an ongoing call, and stored for the next.
  function changeAudio(next) {
    setAudio(next);
    if (voice.current) voice.current.setInputDevice(next.inputId).catch(() => {});
    if (audioEl.current?.setSinkId) audioEl.current.setSinkId(next.outputId || "").catch(() => {});
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

  const audioModal = showAudio && (
    <AudioSettings inputId={audio.inputId} outputId={audio.outputId}
      onChange={changeAudio} onClose={() => setShowAudio(false)} />
  );

  if (screen === "lobby") {
    return (
      <>
        <Lobby me={me} setMe={setMe} onEnter={enterRoom} onTestVlc={testVlc}
          onAutoSetup={autoSetupVlc} onOpenAudio={() => setShowAudio(true)}
          vlcTest={vlcTest} vlcAuto={vlcAuto} agentReady={agentReady} />
        {audioModal}
      </>
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
        net={net}
        alerts={alerts}
        onToggleAlerts={toggleAlerts}
        onLeave={leaveRoom}
        send={(obj) => conn.current?.send(obj)}
      />
      {/* Peer voice plays here (P2P WebRTC audio). */}
      <audio ref={audioEl} autoPlay />
      {audioModal}
    </>
  );
}
