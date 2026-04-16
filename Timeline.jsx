/**
 * components/Timeline/Timeline.jsx
 *
 * DAW-style multi-track timeline:
 *   - Bar ruler with subdivision ticks + animated green playhead
 *   - Per-track label column (M / S / volume / remove)
 *   - Block lane visualizing note / drum events as mini dots
 *   - "Play All" fires piano notes and drum hits via Web Audio,
 *     and plays mic recordings via <Audio>
 *
 * Props:
 *   audioCtxRef — ref to AudioContext
 *   bpm         — current BPM
 */

import { useState, useRef } from "react";
import { useTracks } from "../../context/TrackContext";
import { playPianoNote } from "../../audio/synth";
import { playDrumSound }  from "../../audio/synth";
import { noteToFreq }     from "../../audio/theory";
import { NOTE_NAMES, DRUM_SOUNDS, DRUM_COLORS } from "../../constants";

const PX_PER_MS  = 0.1;
const TYPE_ICON  = { piano:"🎹", drum:"🥁", mic:"🎙" };
const TYPE_COLOR = { piano:"#a78bfa", drum:"#fbbf24", mic:"#f472b6" };

export default function Timeline({ audioCtxRef, bpm }) {
  const { tracks, removeTrack, updateTrack } = useTracks();

  const [playing,  setPlaying]  = useState(false);
  const [playhead, setPlayhead] = useState(0);   // ms elapsed
  const [loopLen,  setLoopLen]  = useState(4);   // bars

  const timerRef    = useRef(null);
  const audioElsRef = useRef({});

  const barMs   = (4 * 60000) / bpm;
  const totalMs = loopLen * barMs;
  const totalPx = totalMs * PX_PER_MS;

  // ── Playback ──────────────────────────────────────────────────────────────
  function playAll() {
    if (playing) {
      stopAll(); return;
    }
    const ctx = audioCtxRef.current;
    if (!ctx) { alert("Audio not ready — interact with the page first."); return; }
    if (ctx.state === "suspended") ctx.resume();

    const startWall = Date.now();

    tracks.forEach(track => {
      if (track.muted) return;
      const vol = track.volume ?? 0.8;

      if ((track.type === "piano" || track.type === "drum") && track.events) {
        track.events.forEach(ev => {
          const delaySec = ev.time / 1000;
          if (track.type === "piano" && ev.type === "note")
            playPianoNote(ctx, noteToFreq(ev.note, ev.oct), 1.0, vol * 0.5);
          if (track.type === "drum" && ev.type === "drum")
            playDrumSound(ctx, ev.sound, delaySec);
        });
      }

      if (track.type === "mic" && track.audioUrl) {
        const a = new Audio(track.audioUrl);
        a.volume = vol;
        audioElsRef.current[track.id] = a;
        a.play().catch(() => {});
      }
    });

    setPlaying(true);
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startWall;
      setPlayhead(elapsed % totalMs);
      if (elapsed >= totalMs) { clearInterval(timerRef.current); setPlaying(false); setPlayhead(0); }
    }, 33);
  }

  function stopAll() {
    clearInterval(timerRef.current);
    setPlaying(false); setPlayhead(0);
    Object.values(audioElsRef.current).forEach(a => { try { a.pause(); a.currentTime = 0; } catch {} });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>

      {/* Transport bar */}
      <div style={{background:"#111827",borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <span style={{fontFamily:"'Fredoka One',cursive",fontSize:15,color:"#9ca3af"}}>🗂 Timeline</span>
        <div style={{flex:1}}/>

        {/* Loop selector */}
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:"#6b7280"}}>Loop:</span>
          {[2,4,8].map(n => (
            <button key={n} onClick={() => setLoopLen(n)} style={{
              padding:"3px 9px", borderRadius:6, fontSize:11, cursor:"pointer",
              border:`1px solid ${loopLen===n ? "#a78bfa44" : "#374151"}`,
              background: loopLen===n ? "#a78bfa22" : "transparent",
              color:      loopLen===n ? "#a78bfa"   : "#6b7280",
            }}>{n} bars</button>
          ))}
        </div>

        <button onClick={stopAll} style={{width:32,height:32,borderRadius:"50%",border:"none",cursor:"pointer",background:"#1f2937",color:"#fff",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>⏹</button>
        <button onClick={playAll} style={{
          padding:"7px 20px", borderRadius:10, border:"none", cursor:"pointer",
          fontFamily:"'Fredoka One',cursive", fontSize:14,
          background:  playing ? "#ef4444"  : "#4ade80",
          color:       playing ? "#fff"     : "#0a0e1a",
          boxShadow:   playing ? "0 0 12px #ef444455" : "0 0 10px #4ade8044",
          transition:"all 0.2s",
        }}>
          {playing ? "⏹ Stop" : "▶ Play All"}
        </button>
      </div>

      {/* Empty state */}
      {tracks.length === 0 && (
        <div style={{textAlign:"center",padding:"40px 20px",color:"#374151",background:"#0d1117",borderRadius:12,border:"1px solid #1f2937"}}>
          <div style={{fontSize:32,marginBottom:8}}>🎵</div>
          <div style={{fontFamily:"'Fredoka One',cursive",fontSize:16,marginBottom:6}}>No tracks yet</div>
          <div style={{fontSize:12}}>Save a Piano take, Drum beat, or Recording from the other tabs</div>
        </div>
      )}

      {/* Track grid */}
      {tracks.length > 0 && (
        <div style={{background:"#0d1117",borderRadius:12,border:"1px solid #1f2937",overflow:"hidden"}}>

          {/* ── Ruler ── */}
          <div style={{display:"flex",background:"#111827",borderBottom:"1px solid #1f2937",paddingLeft:164,overflowX:"auto"}}>
            <div style={{position:"relative",height:24,width:totalPx,flexShrink:0}}>
              {/* Bar numbers */}
              {Array(loopLen + 1).fill(0).map((_, i) => (
                <div key={i} style={{position:"absolute",left:i*barMs*PX_PER_MS,top:0,height:"100%",borderLeft:"1px solid #374151",paddingLeft:3,display:"flex",alignItems:"center"}}>
                  <span style={{fontSize:9,color:"#6b7280",fontFamily:"monospace"}}>{i+1}</span>
                </div>
              ))}
              {/* Subdivision ticks */}
              {Array(loopLen * 4).fill(0).map((_, i) => (
                <div key={`t${i}`} style={{position:"absolute",left:i*(barMs/4)*PX_PER_MS,top:16,height:8,borderLeft:`1px solid ${i%4===0?"#374151":"#1f2937"}`}}/>
              ))}
              {/* Playhead */}
              <div style={{position:"absolute",left:playhead*PX_PER_MS,top:0,width:2,height:"100%",background:"#4ade80",boxShadow:"0 0 6px #4ade80",transition:"left 0.033s linear",zIndex:10}}/>
            </div>
          </div>

          {/* ── Track rows ── */}
          {tracks.map((track, ti) => (
            <div key={track.id} style={{display:"flex",borderBottom:"1px solid #1f2937"}}>

              {/* Label column */}
              <div style={{width:164,flexShrink:0,background:"#111827",padding:"8px 10px",display:"flex",flexDirection:"column",gap:4,borderRight:"1px solid #1f2937"}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:13}}>{TYPE_ICON[track.type] || "🎵"}</span>
                  <span style={{fontSize:11,fontWeight:700,color:track.color||TYPE_COLOR[track.type]||"#9ca3af",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:90}}>
                    {track.label}
                  </span>
                </div>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <button onClick={() => updateTrack(track.id,{muted:!track.muted})} style={{width:22,height:22,borderRadius:5,border:"1px solid #374151",background:track.muted?"#374151":"transparent",color:track.muted?"#f59e0b":"#6b7280",fontSize:8,fontWeight:800,cursor:"pointer"}}>M</button>
                  <button onClick={() => updateTrack(track.id,{solo:!track.solo})}   style={{width:22,height:22,borderRadius:5,border:"1px solid #374151",background:track.solo?"#1d4ed8":"transparent",color:track.solo?"#93c5fd":"#6b7280",fontSize:8,fontWeight:800,cursor:"pointer"}}>S</button>
                  <input type="range" min={0} max={1} step={0.05}
                    value={track.volume ?? 0.8}
                    onChange={e => updateTrack(track.id,{volume:+e.target.value})}
                    style={{flex:1,accentColor:track.color||"#a78bfa",height:12}}/>
                  <button onClick={() => removeTrack(track.id)} style={{width:20,height:20,borderRadius:4,border:"1px solid #374151",background:"transparent",color:"#6b7280",fontSize:10,cursor:"pointer"}}>×</button>
                </div>
              </div>

              {/* Lane */}
              <div style={{flex:1,position:"relative",height:62,background:ti%2===0?"#0a0e1a":"#0d1117",overflowX:"auto"}}>
                {/* Playhead in lane */}
                <div style={{position:"absolute",left:playhead*PX_PER_MS,top:0,width:2,height:"100%",background:"#4ade8066",zIndex:5,transition:"left 0.033s linear"}}/>
                {/* Measure lines */}
                {Array(loopLen + 1).fill(0).map((_, i) => (
                  <div key={i} style={{position:"absolute",left:i*barMs*PX_PER_MS,top:0,bottom:0,width:1,background:"#1f2937"}}/>
                ))}

                {/* ── Piano / Drum block ── */}
                {(track.type === "piano" || track.type === "drum") && track.events && (() => {
                  const dur = track.duration || 4000;
                  const bw  = Math.min(dur * PX_PER_MS, totalPx);
                  const bc  = track.color || TYPE_COLOR[track.type] || "#a78bfa";
                  return (
                    <div style={{position:"absolute",left:0,top:6,width:bw,height:50,borderRadius:6,background:bc+"28",border:`1px solid ${bc}55`,overflow:"hidden"}}>
                      <div style={{position:"absolute",top:2,left:6,fontSize:9,color:bc,fontFamily:"'Fredoka One',cursive",whiteSpace:"nowrap"}}>
                        {TYPE_ICON[track.type]} {track.label}
                      </div>
                      {/* Note dots for piano */}
                      {track.type === "piano" && track.events.slice(0, 80).map((ev, ei) => (
                        <div key={ei} style={{
                          position:"absolute",
                          left:  (ev.time / dur) * bw,
                          top:   16 + (NOTE_NAMES.indexOf(ev.note || "C") % 7) * 4 + 2,
                          width:4, height:4, borderRadius:"50%", background:bc, opacity:0.8,
                        }}/>
                      ))}
                      {/* Drum dots */}
                      {track.type === "drum" && track.events.map((ev, ei) => {
                        const di = DRUM_SOUNDS.indexOf(ev.sound);
                        return (
                          <div key={ei} style={{
                            position:"absolute",
                            left:  (ev.time / dur) * bw,
                            top:   14 + di * 5,
                            width:3, height:3, borderRadius:"50%",
                            background: DRUM_COLORS[di] || bc, opacity:0.9,
                          }}/>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* ── Mic block ── */}
                {track.type === "mic" && (
                  <div style={{position:"absolute",left:0,top:6,width:180,height:50,borderRadius:6,background:"#f472b622",border:"1px solid #f472b655",display:"flex",alignItems:"center",padding:"0 10px",gap:6}}>
                    <span style={{fontSize:14}}>🎙</span>
                    <span style={{fontSize:9,color:"#f472b6",fontFamily:"'Fredoka One',cursive"}}>{track.label}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tracks.length > 0 && (
        <div style={{fontSize:11,color:"#6b7280",textAlign:"center"}}>
          {tracks.length} track{tracks.length !== 1 ? "s" : ""} · {loopLen} bars · {bpm} BPM · {(totalMs / 1000).toFixed(1)}s
        </div>
      )}
    </div>
  );
}
