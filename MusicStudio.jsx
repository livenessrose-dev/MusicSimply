/**
 * MusicStudio.jsx  —  Root entry point
 *
 * This file is intentionally thin. It:
 *   1. Wraps everything in <TrackProvider>
 *   2. Owns the single shared AudioContext ref
 *   3. Renders the top bar (BPM, metronome, mic status)
 *   4. Renders the tab bar
 *   5. Mounts the correct tab component
 *
 * To add a new tab:
 *   - Add its label to TABS in src/constants/index.js
 *   - Import the component here
 *   - Add a {tab === N && <YourComponent/>} line in the content section
 */

import { useState, useRef } from "react";

// ── Context ───────────────────────────────────────────────────────────────────
import { TrackProvider, useTracks } from "./src/context/TrackContext";

// ── Hooks ─────────────────────────────────────────────────────────────────────
import { useMic }        from "./src/hooks/useMic";
import { useMetronome }  from "./src/hooks/useMetronome";

// ── Tab components ────────────────────────────────────────────────────────────
import SemicircleTuner   from "./src/components/Tuner/SemicircleTuner";
import ChordAnalyzer     from "./src/components/Chords/ChordAnalyzer";
import VirtualPiano      from "./src/components/Piano/VirtualPiano";
import DrumMachine       from "./src/components/Drums/DrumMachine";
import RecordingTracks   from "./src/components/Tracks/RecordingTracks";
import Timeline          from "./src/components/Timeline/Timeline";

// ── Constants ─────────────────────────────────────────────────────────────────
import { TABS } from "./src/constants";

// ─────────────────────────────────────────────────────────────────────────────
// Inner app (inside TrackProvider so useTracks() works)
// ─────────────────────────────────────────────────────────────────────────────
function AppInner() {
  const [tab,      setTab]      = useState(0);
  const [bpm,      setBpm]      = useState(120);
  const [metro,    setMetro]    = useState(false);
  const [quantize, setQuantize] = useState(true);

  const { tracks } = useTracks();

  // Single shared AudioContext — created lazily on first user gesture
  const audioCtxRef = useRef(null);

  function ensureCtx() {
    if (!audioCtxRef.current)
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtxRef.current.state === "suspended")
      audioCtxRef.current.resume();
    return audioCtxRef.current;
  }

  // Mic + pitch detection
  const { micOn, noteInfo, toggleMic } = useMic(audioCtxRef);

  // Metronome — returns current beat index (0–3), or -1 when off
  const metroBeat = useMetronome(audioCtxRef, bpm, metro);

  // Badge count on the Timeline tab
  function tabBadge(i) {
    if (i === 5 && tracks.length > 0) return tracks.length;
    return null;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#0a0e1a",fontFamily:"'Nunito',sans-serif",color:"#e5e7eb",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');
        @keyframes recPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
          50%     { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
        * { box-sizing: border-box; }
        button:focus { outline: none; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#111827; }
        ::-webkit-scrollbar-thumb { background:#374151; border-radius:3px; }
        input[type=range] { cursor: pointer; }
      `}</style>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{background:"#111827",borderBottom:"1px solid #1f2937",padding:"8px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0,flexWrap:"wrap"}}>
        {/* Title */}
        <div style={{fontFamily:"'Fredoka One',cursive",fontSize:20,background:"linear-gradient(135deg,#a78bfa,#f472b6,#fb923c)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
          🎵 My Music Studio
        </div>
        <div style={{flex:1}}/>

        {/* Metronome beat LEDs */}
        <div style={{display:"flex",gap:3,alignItems:"center"}}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width:8, height:8, borderRadius:"50%",
              background:  metro && metroBeat === i ? (i===0 ? "#f472b6" : "#a78bfa") : "#1f2937",
              boxShadow:   metro && metroBeat === i ? (i===0 ? "0 0 6px #f472b6" : "0 0 5px #a78bfa") : "none",
              transition:"background 0.05s",
            }}/>
          ))}
        </div>

        {/* BPM */}
        <div style={{display:"flex",alignItems:"center",gap:6,background:"#1f2937",borderRadius:8,padding:"4px 10px"}}>
          <span style={{fontSize:10,color:"#6b7280"}}>BPM</span>
          <input type="range" min={60} max={200} value={bpm}
            onChange={e => setBpm(+e.target.value)}
            style={{width:70,accentColor:"#a78bfa"}}/>
          <span style={{fontSize:13,fontWeight:800,color:"#fff",fontFamily:"monospace",minWidth:28}}>{bpm}</span>
        </div>

        {/* Metronome toggle */}
        <button onClick={() => { ensureCtx(); setMetro(m => !m); }} style={{
          padding:"4px 10px", borderRadius:8, fontSize:12, cursor:"pointer",
          border:`1px solid ${metro ? "#a78bfa44" : "#374151"}`,
          background: metro ? "#a78bfa22" : "transparent",
          color:      metro ? "#a78bfa"   : "#6b7280",
        }}>
          🎙 Metro
        </button>

        {/* Quantize toggle */}
        <button onClick={() => setQuantize(q => !q)} style={{
          padding:"4px 10px", borderRadius:8, fontSize:12, cursor:"pointer",
          border:`1px solid ${quantize ? "#fbbf2444" : "#374151"}`,
          background: quantize ? "#fbbf2422" : "transparent",
          color:      quantize ? "#fbbf24"   : "#6b7280",
        }}>
          ⚡ Snap
        </button>

        {/* Mic status indicator */}
        <div style={{display:"flex",alignItems:"center",gap:5,background:"#1f2937",borderRadius:8,padding:"4px 10px"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:micOn?"#4ade80":"#374151",boxShadow:micOn?"0 0 5px #4ade80":"none"}}/>
          <span style={{fontSize:10,color:micOn?"#4ade80":"#6b7280"}}>{micOn ? "Mic ON" : "Mic OFF"}</span>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{background:"#0d1117",borderBottom:"1px solid #1f2937",padding:"0 14px",display:"flex",gap:1,flexShrink:0,overflowX:"auto"}}>
        {TABS.map((label, i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            padding:"9px 14px", border:"none", background:"transparent",
            cursor:"pointer", fontFamily:"'Fredoka One',cursive", fontSize:13,
            color:       tab === i ? "#a78bfa" : "#6b7280",
            borderBottom: tab === i ? "2px solid #a78bfa" : "2px solid transparent",
            whiteSpace:"nowrap", position:"relative",
          }}>
            {label}
            {/* Badge */}
            {tabBadge(i) && (
              <span style={{position:"absolute",top:6,right:6,width:16,height:16,borderRadius:"50%",background:"#f472b6",color:"#fff",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace"}}>
                {tabBadge(i)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div style={{flex:1,overflowY:"auto",padding:18}}>

        {/* 0 — Tuner */}
        {tab === 0 && (
          <div style={{maxWidth:380,margin:"0 auto"}}>
            <SemicircleTuner noteInfo={noteInfo} micOn={micOn} onToggleMic={toggleMic}/>
          </div>
        )}

        {/* 1 — Chord Analyzer */}
        {tab === 1 && (
          <div style={{maxWidth:520,margin:"0 auto",display:"flex",flexDirection:"column",gap:10}}>
            <div style={{background:"#111827",borderRadius:10,padding:"8px 14px",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:12,color:"#9ca3af"}}>Mic must be on for live chord detection</span>
              <div style={{flex:1}}/>
              <button onClick={toggleMic} style={{
                padding:"5px 12px", borderRadius:8, border:"none", cursor:"pointer",
                background: micOn ? "#ef4444" : "#7c3aed", color:"#fff",
                fontFamily:"'Fredoka One',cursive", fontSize:12,
              }}>
                {micOn ? "🛑 Stop" : "🎤 Start Mic"}
              </button>
            </div>
            <ChordAnalyzer noteInfo={noteInfo}/>
          </div>
        )}

        {/* 2 — Virtual Piano */}
        {tab === 2 && (
          <div style={{display:"flex",flexDirection:"column",gap:14,alignItems:"center"}}>
            <div style={{background:"#111827",borderRadius:12,padding:14,width:"100%",maxWidth:920}}>
              <div style={{fontFamily:"'Fredoka One',cursive",fontSize:15,color:"#a78bfa",marginBottom:10}}>
                🎹 Virtual Piano{" "}
                <span style={{fontSize:11,color:"#6b7280",fontFamily:"'Nunito',sans-serif",fontWeight:400}}>
                  — play + record takes to Timeline
                </span>
              </div>
              <VirtualPiano
                audioCtxRef={audioCtxRef}
                bpm={bpm}
                quantizeOn={quantize}
              />
            </div>
          </div>
        )}

        {/* 3 — Drum Machine */}
        {tab === 3 && (
          <div style={{maxWidth:920,margin:"0 auto"}}>
            <DrumMachine audioCtxRef={audioCtxRef} bpm={bpm}/>
          </div>
        )}

        {/* 4 — Recording Tracks */}
        {tab === 4 && <RecordingTracks audioCtxRef={audioCtxRef}/>}

        {/* 5 — Timeline */}
        {tab === 5 && <Timeline audioCtxRef={audioCtxRef} bpm={bpm}/>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export — wraps AppInner in the global TrackProvider
// ─────────────────────────────────────────────────────────────────────────────
export default function MusicStudio() {
  return (
    <TrackProvider>
      <AppInner/>
    </TrackProvider>
  );
}
