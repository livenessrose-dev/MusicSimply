/**
 * components/Drums/DrumMachine.jsx
 *
 * 16-step drum sequencer styled like a percussion sheet-music staff.
 * Saves the current pattern to global TrackContext via "💾 Save Beat".
 *
 * Props:
 *   audioCtxRef — ref to AudioContext
 *   bpm         — global BPM (used as initial value; local slider overrides)
 */

import { useState, useEffect, useRef } from "react";
import { useTracks } from "../../context/TrackContext";
import { playDrumSound } from "../../audio/synth";
import { DRUM_SOUNDS, DRUM_COLORS, DRUM_STEPS } from "../../constants";

const BEAT_MARKERS = [0, 4, 8, 12]; // bar/beat dividers

export default function DrumMachine({ audioCtxRef, bpm: globalBpm }) {
  const { addTrack } = useTracks();

  const [pattern,  setPattern]  = useState(() =>
    Object.fromEntries(DRUM_SOUNDS.map(d => [d, Array(DRUM_STEPS).fill(false)]))
  );
  const [playing,  setPlaying]  = useState(false);
  const [step,     setStep]     = useState(-1);
  const [localBpm, setLocalBpm] = useState(globalBpm || 120);
  const [swing,    setSwing]    = useState(0);

  const stepRef    = useRef(-1);
  const patternRef = useRef(pattern);
  const timerRef   = useRef(null);

  // Keep ref in sync so the interval callback always reads fresh pattern
  useEffect(() => { patternRef.current = pattern; }, [pattern]);

  // ── Sequencer tick ────────────────────────────────────────────────────────
  function tick() {
    stepRef.current = (stepRef.current + 1) % DRUM_STEPS;
    const s   = stepRef.current;
    const ctx = audioCtxRef.current;
    setStep(s);
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    const swingOffset = s % 2 === 1 ? swing * 0.018 : 0;
    DRUM_SOUNDS.forEach(d => {
      if (patternRef.current[d][s]) playDrumSound(ctx, d, swingOffset);
    });
  }

  function startStop() {
    if (playing) {
      clearInterval(timerRef.current);
      setPlaying(false); setStep(-1); stepRef.current = -1;
      return;
    }
    setPlaying(true);
    timerRef.current = setInterval(tick, (60 / localBpm / 4) * 1000);
  }

  // Restart interval when BPM or swing changes mid-playback
  useEffect(() => {
    if (!playing) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(tick, (60 / localBpm / 4) * 1000);
    return () => clearInterval(timerRef.current);
  }, [localBpm, swing, playing]);

  // ── Pattern helpers ───────────────────────────────────────────────────────
  function toggleCell(drum, stepIdx) {
    setPattern(p => ({ ...p, [drum]: p[drum].map((v, i) => i === stepIdx ? !v : v) }));
  }

  function clearPattern() {
    setPattern(Object.fromEntries(DRUM_SOUNDS.map(d => [d, Array(DRUM_STEPS).fill(false)])));
  }

  function randomPattern() {
    const probs = [0, 0, 0, 0, 0.2, 0.15, 0.05, 0.05]; // per drum
    setPattern(Object.fromEntries(DRUM_SOUNDS.map((d, di) => [
      d,
      Array(DRUM_STEPS).fill(false).map((_, i) => {
        if (d === "Kick")   return i === 0 || i === 8;
        if (d === "Snare")  return i === 4 || i === 12;
        if (d === "Hi-Hat") return i % 2 === 0;
        return Math.random() < probs[di] * 0.5;
      }),
    ])));
  }

  function saveLoop() {
    const msPerStep = (60 / localBpm / 4) * 1000;
    const events    = [];
    DRUM_SOUNDS.forEach(d => {
      pattern[d].forEach((on, i) => {
        if (on) events.push({ type:"drum", sound: d, time: i * msPerStep });
      });
    });
    events.sort((a, b) => a.time - b.time);
    addTrack({
      type: "drum",
      label: "Drum Beat",
      events,
      pattern: { ...pattern },
      bpm: localBpm,
      duration: DRUM_STEPS * msPerStep,
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{background:"#0d1117",borderRadius:16,overflow:"hidden",border:"1px solid #1f2937"}}>

      {/* Header / controls */}
      <div style={{background:"#111827",padding:"10px 14px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #1f2937",flexWrap:"wrap"}}>
        <span style={{fontFamily:"'Fredoka One',cursive",fontSize:15,color:"#fbbf24"}}>🥁 Drum Machine</span>
        <div style={{flex:1}}/>

        {/* BPM */}
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span style={{fontSize:10,color:"#6b7280"}}>BPM</span>
          <input type="range" min={60} max={200} value={localBpm}
            onChange={e => setLocalBpm(+e.target.value)}
            style={{width:70,accentColor:"#fbbf24"}}/>
          <span style={{fontSize:12,fontFamily:"monospace",color:"#fbbf24",minWidth:30}}>{localBpm}</span>
        </div>

        {/* Swing */}
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span style={{fontSize:10,color:"#6b7280"}}>Swing</span>
          <input type="range" min={0} max={50} value={swing}
            onChange={e => setSwing(+e.target.value)}
            style={{width:55,accentColor:"#a78bfa"}}/>
        </div>

        <button onClick={randomPattern} style={{padding:"3px 9px",borderRadius:7,border:"1px solid #374151",background:"transparent",color:"#9ca3af",fontSize:11,cursor:"pointer"}} title="Random pattern">🎲</button>
        <button onClick={clearPattern}  style={{padding:"3px 9px",borderRadius:7,border:"1px solid #374151",background:"transparent",color:"#9ca3af",fontSize:11,cursor:"pointer"}} title="Clear pattern">🗑</button>

        <button onClick={saveLoop} style={{
          padding:"4px 12px", borderRadius:8, border:"1px solid #fbbf2466",
          background:"#fbbf2422", color:"#fbbf24", fontSize:12, cursor:"pointer",
          fontFamily:"'Fredoka One',cursive",
        }}>
          💾 Save Beat
        </button>

        <button onClick={startStop} style={{
          padding:"6px 14px", borderRadius:10, border:"none", cursor:"pointer",
          background: playing ? "#ef4444" : "#fbbf24",
          color:      playing ? "#fff"    : "#0a0e1a",
          fontFamily:"'Fredoka One',cursive", fontSize:13,
          boxShadow:  playing ? "0 0 10px #ef444466" : "none",
        }}>
          {playing ? "⏹ Stop" : "▶ Play"}
        </button>
      </div>

      {/* Step grid */}
      <div style={{padding:"8px 10px",overflowX:"auto"}}>

        {/* Beat number labels */}
        <div style={{display:"flex",marginBottom:2,paddingLeft:76}}>
          {Array(DRUM_STEPS).fill(0).map((_, i) => (
            <div key={i} style={{
              width:32, textAlign:"center", fontSize:8, flexShrink:0,
              color:       BEAT_MARKERS.includes(i) ? "#fbbf24" : "#374151",
              fontFamily:  "monospace",
              fontWeight:  BEAT_MARKERS.includes(i) ? 700 : 400,
              borderLeft:  BEAT_MARKERS.includes(i) ? "1px solid #374151" : "none",
            }}>
              {BEAT_MARKERS.includes(i) ? Math.floor(i / 4) + 1 : "·"}
            </div>
          ))}
        </div>

        {/* Drum rows — percussion staff style */}
        {DRUM_SOUNDS.map((drum, di) => (
          <div key={drum} style={{display:"flex",alignItems:"center",marginBottom:2}}>
            {/* Label */}
            <div style={{width:76,fontSize:10,fontWeight:700,paddingRight:6,color:DRUM_COLORS[di],textAlign:"right",flexShrink:0}}>
              {drum}
            </div>

            {/* Staff line + cells */}
            <div style={{position:"relative",display:"flex"}}>
              {/* Horizontal staff line */}
              <div style={{position:"absolute",left:0,right:0,top:"50%",height:1,background:"#1f2937",zIndex:0}}/>
              {/* Vertical beat dividers */}
              {BEAT_MARKERS.map(b => (
                <div key={b} style={{position:"absolute",left:b*32,top:0,bottom:0,width:1,background:"#374151",zIndex:1}}/>
              ))}

              {Array(DRUM_STEPS).fill(0).map((_, si) => {
                const active  = pattern[drum][si];
                const current = step === si && playing;
                return (
                  <div key={si}
                    onClick={() => toggleCell(drum, si)}
                    style={{
                      width:32, height:28, flexShrink:0, zIndex:2,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      cursor:"pointer",
                      background: current ? DRUM_COLORS[di] + "22" : "transparent",
                      transition:"background 0.05s",
                    }}>
                    {active
                      ? <div style={{
                          width:13, height:10, borderRadius:"50%", transform:"rotate(-20deg)",
                          background: current ? DRUM_COLORS[di] : DRUM_COLORS[di] + "bb",
                          boxShadow:  current ? `0 0 7px ${DRUM_COLORS[di]}` : "none",
                        }}/>
                      : <div style={{
                          width:11, height:8, borderRadius:"50%", transform:"rotate(-20deg)",
                          border:`1px solid ${DRUM_COLORS[di]}33`,
                        }}/>
                    }
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
