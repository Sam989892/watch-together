// Peer-to-peer voice chat over WebRTC. The audio flows DIRECTLY between the two
// machines (P2P) — the sync server only relays the small offer/answer/ICE
// signaling messages. Mic starts muted; enabling a track is what sends audio,
// so an idle/muted call uses no bandwidth.

const RTC_CONFIG = {
  // STUN finds each side's public address; TURN relays the audio when a router
  // won't allow a direct connection (common between two different home networks
  // / countries). These TURN servers are Metered's free Open Relay.
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  ],
};

export function createVoice({ sendSignal, onRemoteStream, onError, inputId = "" }) {
  let pc = null;
  let localStream = null;
  let peerId = null;
  let deviceId = inputId;   // chosen mic ("" = system default)
  let enabled = false;      // current mute state, preserved across device swaps

  function micConstraints() {
    return { audio: deviceId ? { deviceId: { exact: deviceId } } : true };
  }

  async function ensureMic() {
    if (localStream) return localStream;
    localStream = await navigator.mediaDevices.getUserMedia(micConstraints());
    localStream.getAudioTracks().forEach((t) => (t.enabled = enabled)); // muted until you unmute
    return localStream;
  }

  // Switch the live mic without dropping the call: grab the new device and
  // swap the outgoing track in place.
  async function setInputDevice(id) {
    deviceId = id || "";
    if (!localStream) return;
    const fresh = await navigator.mediaDevices.getUserMedia(micConstraints());
    const track = fresh.getAudioTracks()[0];
    track.enabled = enabled;
    const sender = pc?.getSenders().find((s) => s.track && s.track.kind === "audio");
    if (sender) await sender.replaceTrack(track);
    localStream.getTracks().forEach((t) => t.stop());
    localStream = fresh;
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
    enabled = on;
    localStream?.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  function close() {
    try { pc?.close(); } catch {}
    localStream?.getTracks().forEach((t) => t.stop());
    pc = null;
    localStream = null;
    peerId = null;
  }

  return { start, handleSignal, setMicEnabled, setInputDevice, close, get peerId() { return peerId; } };
}
