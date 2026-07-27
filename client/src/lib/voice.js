// Peer-to-peer voice chat over WebRTC. The audio flows DIRECTLY between the two
// machines (P2P) — the sync server only relays the small offer/answer/ICE
// signaling messages. Mic starts muted; enabling a track is what sends audio,
// so an idle/muted call uses no bandwidth.

const RTC_CONFIG = {
  // Public STUN is enough for most home networks. Strict/symmetric NATs would
  // additionally need a TURN relay (not bundled) to connect over the internet.
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export function createVoice({ sendSignal, onRemoteStream, onError }) {
  let pc = null;
  let localStream = null;
  let peerId = null;

  async function ensureMic() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStream.getAudioTracks().forEach((t) => (t.enabled = false)); // muted until you unmute
    return localStream;
  }

  function newPeer(toId) {
    peerId = toId;
    pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal({ to: toId, kind: "ice", candidate: e.candidate });
    };
    pc.ontrack = (e) => onRemoteStream(e.streams[0]);
    return pc;
  }

  function addLocalTracks() {
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
  }

  // Begin a call with a peer. Exactly one side is the initiator (decided by the
  // caller from a stable rule, e.g. lower id), so both don't offer at once.
  async function start(toId, initiator) {
    if (pc) return;
    try {
      await ensureMic();
      newPeer(toId);
      addLocalTracks();
      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ to: toId, kind: "offer", sdp: offer });
      }
    } catch (e) { onError?.(e); }
  }

  async function handleSignal(msg) {
    try {
      if (msg.kind === "offer") {
        if (!pc) { await ensureMic(); newPeer(msg.from); addLocalTracks(); }
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ to: msg.from, kind: "answer", sdp: answer });
      } else if (msg.kind === "answer") {
        await pc.setRemoteDescription(msg.sdp);
      } else if (msg.kind === "ice" && pc) {
        await pc.addIceCandidate(msg.candidate);
      }
    } catch (e) { onError?.(e); }
  }

  function setMicEnabled(on) {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  function close() {
    try { pc?.close(); } catch {}
    localStream?.getTracks().forEach((t) => t.stop());
    pc = null;
    localStream = null;
    peerId = null;
  }

  return { start, handleSignal, setMicEnabled, close, get peerId() { return peerId; } };
}
