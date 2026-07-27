import { useEffect, useRef, useState } from "react";

// Audio settings + mic test. Pick input (mic) and output (speaker) — both default
// to the system default — and watch a live level bar to confirm the mic works.
export default function AudioSettings({ inputId, outputId, onChange, onClose }) {
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [level, setLevel] = useState(0); // 0..1 live mic level
  const [err, setErr] = useState("");
  const stream = useRef(null);
  const ctx = useRef(null);
  const raf = useRef(null);

  const outputSelectable =
    typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  async function loadDevices() {
    const devs = await navigator.mediaDevices.enumerateDevices();
    setInputs(devs.filter((d) => d.kind === "audioinput"));
    setOutputs(devs.filter((d) => d.kind === "audiooutput"));
  }

  function stopMeter() {
    cancelAnimationFrame(raf.current);
    ctx.current?.close().catch(() => {});
    stream.current?.getTracks().forEach((t) => t.stop());
    ctx.current = null;
    stream.current = null;
    setLevel(0);
  }

  // Open the chosen mic and drive the level bar from its RMS energy.
  async function startMeter(deviceId) {
    stopMeter();
    setErr("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      loadDevices(); // labels only appear once permission is granted
      const audioCtx = new AudioContext();
      ctx.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream.current).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) { const x = (v - 128) / 128; sum += x * x; }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setErr(e?.name === "NotAllowedError" ? "Microphone permission was denied." : "Couldn't open the microphone.");
    }
  }

  useEffect(() => {
    startMeter(inputId);
    return stopMeter;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function pickInput(id) { onChange({ inputId: id, outputId }); startMeter(id); }
  function pickOutput(id) { onChange({ inputId, outputId: id }); }

  // Short tone through the selected speaker, to confirm output.
  async function testSpeaker() {
    try {
      const c = new AudioContext();
      const dest = c.createMediaStreamDestination();
      const osc = c.createOscillator();
      const gain = c.createGain();
      gain.gain.value = 0.15;
      osc.frequency.value = 440;
      osc.connect(gain).connect(dest);
      const el = new Audio();
      el.srcObject = dest.stream;
      if (outputSelectable && outputId) { try { await el.setSinkId(outputId); } catch {} }
      osc.start();
      await el.play();
      setTimeout(() => { osc.stop(); c.close().catch(() => {}); }, 500);
    } catch { /* ignore */ }
  }

  const pct = Math.round(level * 100);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface-2)", borderRadius: 12,
        padding: 24, width: 420, maxWidth: "90vw", boxShadow: "var(--shadow-popover)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>🎧 Audio & mic test</span>
          <button aria-label="Close" onClick={onClose} style={{ border: "none", background: "none", fontSize: 16 }}>✕</button>
        </div>

        <Field label="Microphone (input)">
          <select value={inputId} onChange={(e) => pickInput(e.target.value)} style={selectStyle}>
            <option value="">Default</option>
            {inputs.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>
            ))}
          </select>
        </Field>

        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 6px" }}>
          Speak — the bar should move:
        </p>
        <div style={{ height: 12, borderRadius: 6, background: "var(--surface-1)",
          border: "0.5px solid var(--border)", overflow: "hidden", marginBottom: 4 }}>
          <div style={{ height: "100%", width: `${pct}%`,
            background: pct > 4 ? "var(--fill-success)" : "var(--text-muted)", transition: "width 60ms linear" }} />
        </div>
        <p style={{ fontSize: 11, color: pct > 4 ? "var(--text-success)" : "var(--text-muted)", margin: "0 0 16px" }}>
          {err ? "" : pct > 4 ? "✓ Mic is picking up sound" : "…no sound yet"}
        </p>

        <Field label="Speaker (output)">
          <div style={{ display: "flex", gap: 8 }}>
            <select value={outputId} disabled={!outputSelectable}
              onChange={(e) => pickOutput(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
              <option value="">Default</option>
              {outputs.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>
              ))}
            </select>
            <button onClick={testSpeaker} style={{ fontSize: 12, padding: "4px 10px", height: 30 }}>Test sound</button>
          </div>
        </Field>
        {!outputSelectable && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Your browser can't switch speakers — the system default is used.
          </p>
        )}

        {err && <p style={{ fontSize: 12, color: "var(--text-danger, #e66)", margin: "12px 0 0" }}>{err}</p>}
      </div>
    </div>
  );
}

const selectStyle = { width: "100%", height: 32, fontSize: 13, background: "var(--surface-1)",
  border: "0.5px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text-primary)", padding: "0 8px" };

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 6px", color: "var(--text-secondary)" }}>{label}</p>
    {children}
  </div>
);
