import { useState, useEffect, useRef } from "react";

// ── Layout constants ───────────────────────────────────────────────────────
const MEASURE_W       = 90;   // px per measure on the ruler / lanes
const TOTAL_MEASURES  = 8;
const LANE_LEFT_OFFSET = 160; // px — width of the track-info column, so lanes line up under the ruler

const TIME_SIG_OPTIONS = ["4/4", "3/4", "2/4", "6/8"];

const DEFAULT_TRACKS = [
  { id:1, name:"Piano",  icon:"🎹", color:"#a78bfa", muted:false, soloed:false, armed:false, sampleName:null },
  { id:2, name:"Guitar", icon:"🎸", color:"#fb923c", muted:false, soloed:false, armed:false, sampleName:null },
  { id:3, name:"Voice",  icon:"🎤", color:"#f472b6", muted:false, soloed:false, armed:false, sampleName:null },
];

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const t = Math.floor((sec * 10) % 10);
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${t}`;
}

// ── Sampler ─────────────────────────────────────────────────────────────
// A sampler plays back a recorded audio clip instead of synthesizing a
// waveform. The only real trick: to make one recording sound at a *different*
// pitch, you change its playback speed — exactly like a record player.
// 12 semitones = 1 octave = a doubling of frequency, so shifting by `n`
// semitones means multiplying speed by 2^(n/12). That's the whole idea.
//
// This class has zero React in it on purpose — it's plain Web Audio API,
// so you could drop it into a vanilla JS page or a different framework
// unchanged. React's job below is just to *own* one of these per track.
class Sampler {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.buffer = null;   // the decoded audio, once loaded — null until then
    this.rootNote = 60;   // MIDI note the sample "is" (60 = middle C) — used to compute pitch shift
  }

  // Decode a File (e.g. from a drag-and-drop or <input type="file">) into
  // an AudioBuffer — audio data sitting in memory, ready to play instantly.
  async loadFromFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
    this.name = file.name;
  }

  // Play the loaded sample. `midiNote` defaults to the root note, i.e. no
  // pitch shift — just play the recording back as-is.
  play(midiNote = this.rootNote, velocity = 1) {
    if (!this.buffer) return null;

    const semitones = midiNote - this.rootNote;
    const playbackRate = Math.pow(2, semitones / 12);

    // AudioBufferSourceNode is a ONE-SHOT play head — it can only be
    // started once and then it's done. That's why we create a brand new
    // one on every single play() call instead of reusing one.
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = playbackRate;

    // A gain node is our volume knob — used here for velocity, and it's
    // also where you'd add fade-in/out envelopes to avoid audio clicks.
    const gain = this.ctx.createGain();
    gain.gain.value = velocity;

    source.connect(gain).connect(this.ctx.destination);
    source.start();
    return source; // caller can call source.stop() to cut it off early
  }
}

export default function MusicStudioTracks() {
  const [tracks,      setTracks]      = useState(DEFAULT_TRACKS);
  const [nextId,      setNextId]      = useState(4);
  const [bpm,         setBpm]         = useState(120);
  const [timeSig,     setTimeSig]     = useState("4/4");
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLooping,   setIsLooping]   = useState(false);
  const [elapsedSec,  setElapsedSec]  = useState(0);

  const intervalRef = useRef(null);

  // ── Audio engine ────────────────────────────────────────────────────────
  // One shared AudioContext for the whole page (browsers require it to be
  // created/resumed from a real user gesture, e.g. a click — so we create
  // it lazily on first use rather than on mount).
  const audioCtxRef  = useRef(null);
  const samplersRef  = useRef({}); // { [trackId]: Sampler }

  function getSampler(trackId) {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!samplersRef.current[trackId]) {
      samplersRef.current[trackId] = new Sampler(audioCtxRef.current);
    }
    return samplersRef.current[trackId];
  }

  async function loadSampleIntoTrack(trackId, file) {
    if (audioCtxRef.current?.state === "suspended") await audioCtxRef.current.resume();
    const sampler = getSampler(trackId);
    await sampler.loadFromFile(file);
    setTracks(t => t.map(tr => tr.id === trackId ? { ...tr, sampleName: file.name } : tr));
  }

  function playTrackSample(trackId) {
    const sampler = samplersRef.current[trackId];
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    sampler?.play();
  }

  // ── Derived timing ──────────────────────────────────────────────────────
  const beatsPerMeasure = parseInt(timeSig.split("/")[0], 10) || 4;
  const secPerBeat      = 60 / bpm;
  const secPerMeasure   = secPerBeat * beatsPerMeasure;
  const totalSec        = secPerMeasure * TOTAL_MEASURES;
  const currentMeasureIdx = Math.min(
    TOTAL_MEASURES - 1,
    Math.floor(elapsedSec / secPerMeasure)
  );
  const playheadPx = Math.min(
    TOTAL_MEASURES * MEASURE_W,
    (elapsedSec / secPerMeasure) * MEASURE_W
  );

  // ── Transport ticking ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setElapsedSec(prev => {
        const next = prev + 0.1;
        if (next >= totalSec) {
          if (isLooping) return 0;
          setIsPlaying(false);
          setIsRecording(false);
          return totalSec;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, isLooping, totalSec]);

  // ── Close the audio context when this page unmounts ────────────────────
  useEffect(() => {
    return () => { audioCtxRef.current?.close(); };
  }, []);

  function togglePlay() {
    if (isPlaying) { setIsPlaying(false); setIsRecording(false); }
    else setIsPlaying(true);
  }
  function toggleRecord() {
    if (isRecording) { setIsRecording(false); setIsPlaying(false); }
    else { setIsRecording(true); setIsPlaying(true); }
  }
  function rewind() {
    setIsPlaying(false);
    setIsRecording(false);
    setElapsedSec(0);
  }

  function addTrack() {
    setTracks(t => [...t, {
      id: nextId, name:"New Track", icon:"🎵", color:"#38bdf8",
      muted:false, soloed:false, armed:false,
    }]);
    setNextId(n => n + 1);
  }
  function removeTrack(id)  { setTracks(t => t.filter(tr => tr.id !== id)); }
  function toggleMute(id)   { setTracks(t => t.map(tr => tr.id===id ? {...tr, muted:!tr.muted}   : tr)); }
  function toggleSolo(id)   { setTracks(t => t.map(tr => tr.id===id ? {...tr, soloed:!tr.soloed} : tr)); }
  function toggleArm(id)    { setTracks(t => t.map(tr => tr.id===id ? {...tr, armed:!tr.armed}   : tr)); }

  // ── Styles ──────────────────────────────────────────────────────────────
  const accent      = "#7c3aed";
  const accentLight = "#a78bfa";
  const bg          = "#0a0e1a";
  const panel       = "#111827";
  const border      = "#1f2937";

  const iconBtnStyle = {
    width:34, height:34, borderRadius:9, border:`1px solid ${border}`,
    background:"transparent", color:"#e5e7eb", fontSize:15,
    display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
  };
  const labelStyle = {
    fontSize:10, color:"#4b5563", fontWeight:700, textTransform:"uppercase", letterSpacing:1,
  };
  const smallBtn = (active, activeColor="#a78bfa") => ({
    width:24, height:24, borderRadius:6, cursor:"pointer",
    border:`1px solid ${active ? activeColor : border}`,
    background: active ? activeColor+"22" : "transparent",
    color: active ? activeColor : "#6b7280",
    fontSize:11, fontWeight:800,
  });

  const measures = Array.from({ length: TOTAL_MEASURES });

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column",
      background:bg, color:"#e5e7eb", fontFamily:"'Nunito', sans-serif", minHeight:0 }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap');
        @keyframes recordPulse {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
          70%  { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
        .track-lane { scrollbar-width: thin; }
      `}</style>

      {/* ── Transport bar ── */}
      <div style={{ background:panel, borderBottom:`1px solid ${border}`,
        padding:"10px 20px", display:"flex", alignItems:"center" }}>

        <div style={{ flex:1 }}/>

        {/* Centered playback controls */}
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <button onClick={rewind} title="Rewind to start" style={iconBtnStyle}>⏮</button>

          <button onClick={togglePlay} title={isPlaying ? "Pause" : "Play"} style={{
            ...iconBtnStyle, width:38, height:38, fontSize:16,
            border:`1.5px solid ${isPlaying ? accent : border}`,
            background: isPlaying ? accent+"22" : "transparent",
            color: isPlaying ? accentLight : "#e5e7eb",
          }}>{isPlaying ? "⏸" : "▶"}</button>

          <button onClick={toggleRecord} title="Record" style={{
            width:34, height:34, borderRadius:"50%", border:"none", cursor:"pointer",
            background: isRecording ? "#ef4444" : "#3f1d1d",
            animation: isRecording ? "recordPulse 1.1s infinite" : "none",
          }}/>

          <button onClick={() => setIsLooping(v => !v)} title="Loop" style={{
            ...iconBtnStyle,
            border:`1.5px solid ${isLooping ? accent : border}`,
            background: isLooping ? accent+"22" : "transparent",
            color: isLooping ? accentLight : "#6b7280",
          }}>🔁</button>

          <div style={{ fontFamily:"monospace", fontSize:14, fontWeight:700,
            background:bg, border:`1px solid ${border}`, borderRadius:7,
            padding:"5px 12px", minWidth:78, textAlign:"center" }}>
            {formatTime(elapsedSec)}
          </div>
        </div>

        {/* Right-aligned BPM + time signature */}
        <div style={{ flex:1, display:"flex", justifyContent:"flex-end", alignItems:"center", gap:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={labelStyle}>BPM</span>
            <input type="number" value={bpm} min={40} max={240}
              onChange={e => setBpm(Number(e.target.value))}
              style={{ width:52, background:bg, border:`1px solid ${border}`, color:"#e5e7eb",
                borderRadius:6, padding:"4px 6px", fontSize:13, fontWeight:700, textAlign:"center" }}/>
          </div>
          <div style={{ display:"flex", gap:3 }}>
            {TIME_SIG_OPTIONS.map(t => (
              <button key={t} onClick={() => setTimeSig(t)} style={{
                padding:"4px 9px", borderRadius:6,
                border:`1.5px solid ${timeSig===t ? accent : border}`,
                background: timeSig===t ? accent+"22" : "transparent",
                color: timeSig===t ? accentLight : "#6b7280",
                fontSize:12, fontWeight:700, fontFamily:"monospace", cursor:"pointer",
              }}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Hint + Add Track ── */}
      <div style={{ padding:"8px 20px", display:"flex", alignItems:"center",
        borderBottom:`1px solid ${border}` }}>
        <span style={{ fontSize:12, color:"#6b7280" }}>
          Click a track name to expand and select its instrument
        </span>
        <div style={{ flex:1 }}/>
        <button onClick={addTrack} style={{
          padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer",
          background:accent, color:"#fff", fontSize:12, fontWeight:800,
        }}>+ Add Track</button>
      </div>

      {/* ── Measure ruler ── */}
      <div style={{ display:"flex", padding:"10px 20px 0" }}>
        <div style={{ width:LANE_LEFT_OFFSET, flexShrink:0 }}/>
        <div className="track-lane" style={{ position:"relative", display:"flex", overflowX:"auto" }}>
          {measures.map((_, i) => (
            <div key={i} style={{
              width:MEASURE_W, height:30, position:"relative", flexShrink:0,
              borderRight:`1px solid ${border}`,
              background: i===currentMeasureIdx
                ? "linear-gradient(180deg, #7f1d1d, #450a0a)"
                : "transparent",
            }}>
              <span style={{ position:"absolute", top:4, left:7, fontSize:12, fontWeight:800,
                color: i===currentMeasureIdx ? "#fff" : "#9ca3af" }}>{i+1}</span>
              {Array.from({ length: beatsPerMeasure }).map((_, b) => (
                b > 0 && (
                  <div key={b} style={{ position:"absolute", top:18, bottom:0,
                    left:(b / beatsPerMeasure) * MEASURE_W, width:1,
                    background:"rgba(255,255,255,0.1)" }}/>
                )
              ))}
            </div>
          ))}
          {/* Playhead scrubber */}
          <div style={{ position:"absolute", top:22, left:playheadPx - 5,
            width:10, height:10, borderRadius:"50%", background:"#fff",
            boxShadow:"0 0 6px rgba(255,255,255,0.8)", pointerEvents:"none" }}/>
          <div style={{ position:"absolute", top:30, bottom:0, left:playheadPx,
            width:1.5, background:"rgba(255,255,255,0.35)", pointerEvents:"none" }}/>
        </div>
      </div>

      {/* ── Track list ── */}
      <div style={{ flex:1, overflowY:"auto", padding:"4px 20px 0" }}>
        {tracks.map((tr, i) => (
          <div key={tr.id} style={{ display:"flex", alignItems:"stretch",
            borderBottom:`1px solid ${border}`, padding:"10px 0" }}>

            {/* Track info column */}
            <div style={{ width:LANE_LEFT_OFFSET, flexShrink:0,
              display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:11, color:"#4b5563", width:14 }}>{i+1}</span>
              <button onClick={() => toggleArm(tr.id)} title="Arm for recording" style={{
                width:20, height:20, borderRadius:"50%", border:"none", cursor:"pointer",
                background: tr.armed ? "#ef4444" : "#374151",
                animation: tr.armed && isRecording ? "recordPulse 1.1s infinite" : "none",
              }}/>
              <span style={{
                display:"flex", alignItems:"center", gap:5,
                padding:"3px 9px", borderRadius:7,
                background:tr.color+"22", color:tr.color, fontSize:12, fontWeight:700,
              }}>{tr.icon} {tr.name}</span>
            </div>

            {/* Waveform lane — drop an audio file here to load it into this track's sampler */}
            <div className="track-lane"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) loadSampleIntoTrack(tr.id, file);
              }}
              style={{ position:"relative", flex:1, overflowX:"auto", minHeight:44 }}>
              <div style={{ position:"absolute", inset:0, display:"flex" }}>
                {measures.map((_, mi) => (
                  <div key={mi} style={{ width:MEASURE_W, flexShrink:0,
                    borderRight:`1px solid ${border}`,
                    background: mi===currentMeasureIdx ? "rgba(127,29,29,0.15)" : "transparent" }}/>
                ))}
              </div>
              <div style={{ position:"absolute", top:0, bottom:0, left:playheadPx,
                width:1.5, background:"rgba(255,255,255,0.3)", pointerEvents:"none" }}/>
              <div style={{ position:"relative", display:"flex", alignItems:"center",
                justifyContent:"space-between", height:"100%", padding:"0 10px" }}>
                <div style={{ display:"flex", gap:8 }}>
                  <button style={{ width:26, height:26, borderRadius:"50%", border:"none",
                    cursor:"pointer", background:"#374151", color:"#e5e7eb", fontSize:11 }}>⏺</button>
                  <button onClick={() => playTrackSample(tr.id)} disabled={!tr.sampleName} style={{
                    width:26, height:26, borderRadius:"50%", border:"none",
                    cursor: tr.sampleName ? "pointer" : "default",
                    background: tr.sampleName ? tr.color+"33" : "#374151",
                    color: tr.sampleName ? tr.color : "#e5e7eb", fontSize:11,
                    opacity: tr.sampleName ? 1 : 0.5,
                  }}>▶</button>
                </div>
                <span style={{ fontSize:11, color: tr.sampleName ? "#9ca3af" : "#4b5563", letterSpacing:1 }}>
                  {tr.sampleName ?? "DROP AUDIO HERE"}
                </span>
              </div>
            </div>

            {/* Mute / Solo / Delete */}
            <div style={{ display:"flex", gap:5, alignItems:"center", marginLeft:10 }}>
              <button onClick={() => toggleMute(tr.id)} style={smallBtn(tr.muted, "#facc15")}>M</button>
              <button onClick={() => toggleSolo(tr.id)} style={smallBtn(tr.soloed, "#4ade80")}>S</button>
              <button onClick={() => removeTrack(tr.id)} style={smallBtn(false)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Drop zone — dropping here creates a brand-new track loaded with that file ── */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          const id = nextId;
          setTracks(t => [...t, {
            id, name: file.name.replace(/\.[^/.]+$/, ""), icon:"🎵", color:"#38bdf8",
            muted:false, soloed:false, armed:false, sampleName:null,
          }]);
          setNextId(n => n + 1);
          loadSampleIntoTrack(id, file);
        }}
        style={{ margin:20, padding:"28px 20px", textAlign:"center",
        border:`1.5px dashed ${border}`, borderRadius:10, color:"#4b5563" }}>
        <div style={{ fontSize:20, marginBottom:4 }}>🎵</div>
        Drop an audio file here
      </div>
    </div>
  );
}