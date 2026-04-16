/**
 * components/Piano/VirtualPiano.jsx
 *
 * Interactive two-octave piano with:
 *   - Sheet music staff showing active notes
 *   - Web Audio synthesis via playPianoNote()
 *   - Real-time chord detection
 *   - Recording → saved to global TrackContext
 *
 * Props:
 *   audioCtxRef  — React ref to an AudioContext (may be null initially)
 *   bpm          — current BPM (for quantization)
 *   quantizeOn   — boolean
 */

import { useState, useRef } from "react";
import { useTracks } from "../../context/TrackContext";
import { playPianoNote } from "../../audio/synth";
import { noteToFreq, detectChordFromNotes, getProgressions, qSnap } from "../../audio/theory";
import { NOTE_NAMES, PIANO_KEYS, WHITE_KEY_WIDTH, BLACK_KEY_WIDTH, WHITE_KEY_HEIGHT, BLACK_KEY_HEIGHT } from "../../constants";

// Diatonic order used for staff placement
const NOTE_ORDER = ["C","D","E","F","G","A","B"];
const WHITE_KEYS = PIANO_KEYS.filter(k => !k.black);

/** Return the left-edge pixel position of any key on the keyboard. */
function getKeyX(key) {
  if (!key.black) {
    return WHITE_KEYS.findIndex(k => k.note === key.note && k.oct === key.oct) * WHITE_KEY_WIDTH;
  }
  const nOrd  = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const idx   = nOrd.indexOf(key.note);
  const prevW = WHITE_KEYS.filter(k => k.oct === key.oct && nOrd.indexOf(k.note) < idx);
  const wIdx  = WHITE_KEYS.findIndex(k => k.note === prevW[prevW.length - 1]?.note && k.oct === key.oct);
  return wIdx * WHITE_KEY_WIDTH + WHITE_KEY_WIDTH - BLACK_KEY_WIDTH / 2;
}

export default function VirtualPiano({ audioCtxRef, bpm, quantizeOn }) {
  const { addTrack } = useTracks();
  const [activeNotes, setActiveNotes] = useState([]);
  const [chordHist,   setChordHist]   = useState([]);
  const [recording,   setRecording]   = useState(false);
  const recEventsRef = useRef([]);
  const recStartRef  = useRef(0);

  const totalW = WHITE_KEYS.length * WHITE_KEY_WIDTH;

  // ── Key interaction ───────────────────────────────────────────────────────
  function handleDown(key) {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    playPianoNote(ctx, noteToFreq(key.note, key.oct), 1.5);

    setActiveNotes(prev => {
      if (prev.some(n => n.note === key.note && n.oct === key.oct)) return prev;
      const upd  = [...prev, key];
      const midi = upd.map(k => { const i = NOTE_NAMES.indexOf(k.note); return (k.oct + 1) * 12 + i; });
      const ch   = detectChordFromNotes(midi);
      if (ch) {
        setChordHist(h => {
          const name = `${ch.root}${ch.type}`;
          if (h[h.length - 1]?.name === name) return h;
          return [...h.slice(-7), { name, notes: upd.map(k => `${k.note}${k.oct}`) }];
        });
      }
      return upd;
    });

    // Record event
    if (recording) {
      let t = Date.now() - recStartRef.current;
      if (quantizeOn) t = qSnap(t, bpm);
      recEventsRef.current.push({ type:"note", note: key.note, oct: key.oct, time: t });
    }
  }

  function handleUp(key) {
    setTimeout(() => {
      setActiveNotes(prev => prev.filter(n => !(n.note === key.note && n.oct === key.oct)));
    }, 150);
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  function toggleRec() {
    if (recording) {
      const events = recEventsRef.current;
      if (events.length > 0) {
        addTrack({ type:"piano", label:"Piano Take", events, duration: Date.now() - recStartRef.current });
      }
      setRecording(false);
    } else {
      recEventsRef.current = [];
      recStartRef.current  = Date.now();
      setRecording(true);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>

      {/* Controls row */}
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={toggleRec} style={{
          padding:"6px 16px", borderRadius:10, border:"none", cursor:"pointer",
          background: recording ? "#ef4444" : "#374151", color:"#fff",
          fontFamily:"'Fredoka One',cursive", fontSize:13,
          animation: recording ? "recPulse 1s infinite" : "none",
          boxShadow: recording ? "0 0 10px #ef444466" : "none",
        }}>
          {recording ? "⏹ Stop Rec" : "● Record"}
        </button>
        <span style={{fontSize:11,color:"#6b7280"}}>
          {recording ? "Recording — stop to save to Timeline" : "Click keys to play"}
        </span>
        {quantizeOn && (
          <span style={{fontSize:10,color:"#fbbf24",background:"#fbbf2422",padding:"2px 8px",borderRadius:6}}>
            ⚡ Quantize
          </span>
        )}
      </div>

      {/* Keyboard + staff wrapper */}
      <div style={{overflowX:"auto",paddingBottom:4}} onMouseLeave={() => setActiveNotes([])}>

        {/* ── Sheet music staff ── */}
        <div style={{
          position:"relative", width:totalW, height:74,
          background:"#faf7f0", borderRadius:"8px 8px 0 0",
          borderBottom:"2px solid #d4c9a0", overflow:"hidden",
        }}>
          {/* Five staff lines */}
          {[15,23,31,39,47].map((y,i) => (
            <div key={i} style={{position:"absolute",left:8,right:8,top:y,height:1,background:"#8a7a5a",opacity:0.5}}/>
          ))}
          {/* Treble clef */}
          <div style={{position:"absolute",left:8,top:3,fontSize:52,lineHeight:1,color:"#8a7a5a",opacity:0.65,fontFamily:"serif"}}>𝄞</div>

          {/* Active note heads */}
          {activeNotes.map((n, i) => {
            const base = n.note.replace("#","");
            const pos  = (n.oct - 4) * 7 + NOTE_ORDER.indexOf(base);
            const y    = 51 - pos * 4;
            const x    = 88 + i * 24;
            return (
              <g key={i} style={{position:"absolute"}}>
                {/* Ledger line for middle C */}
                {pos === 0 && <div style={{position:"absolute",left:x-4,top:y,width:18,height:1,background:"#8a7a5a"}}/>}
                {/* Sharp symbol */}
                {n.note.includes("#") && <div style={{position:"absolute",left:x-12,top:y-5,fontSize:10,color:"#4a3a2a",fontWeight:"bold"}}>♯</div>}
                {/* Note head */}
                <div style={{position:"absolute",left:x,top:y-5,width:12,height:9,borderRadius:"50%",background:"#2a1a0a",transform:"rotate(-15deg)"}}/>
                {/* Stem */}
                <div style={{position:"absolute",left:x+10,top:y-22,width:1.5,height:20,background:"#2a1a0a"}}/>
              </g>
            );
          })}
        </div>

        {/* ── Keys ── */}
        <div style={{position:"relative",width:totalW,height:WHITE_KEY_HEIGHT}}>
          {/* White keys */}
          {WHITE_KEYS.map((key, i) => {
            const active = activeNotes.some(n => n.note === key.note && n.oct === key.oct);
            return (
              <div key={`w${key.note}${key.oct}`}
                onMouseDown={() => handleDown(key)}
                onMouseUp={() => handleUp(key)}
                style={{
                  position:"absolute", left: i * WHITE_KEY_WIDTH, top:0,
                  width: WHITE_KEY_WIDTH - 1, height: WHITE_KEY_HEIGHT,
                  background: active
                    ? "linear-gradient(180deg,#e8d5b0,#c9a84c)"
                    : "linear-gradient(180deg,#fefefe,#f0ebe0)",
                  border:"1px solid #b0a080", borderRadius:"0 0 6px 6px",
                  cursor:"pointer",
                  boxShadow: active ? "inset 0 -4px 8px rgba(180,140,60,0.4)" : "inset 0 -4px 6px rgba(0,0,0,0.06)",
                  display:"flex", alignItems:"flex-end", justifyContent:"center", paddingBottom:5,
                  zIndex:1,
                }}>
                <span style={{fontSize:7,color:active?"#6b4a00":"#b0a080",fontFamily:"'Fredoka One',cursive"}}>
                  {key.note}{key.oct}
                </span>
              </div>
            );
          })}

          {/* Black keys */}
          {PIANO_KEYS.filter(k => k.black).map(key => {
            const active = activeNotes.some(n => n.note === key.note && n.oct === key.oct);
            return (
              <div key={`b${key.note}${key.oct}`}
                onMouseDown={() => handleDown(key)}
                onMouseUp={() => handleUp(key)}
                style={{
                  position:"absolute", left: getKeyX(key), top:0,
                  width: BLACK_KEY_WIDTH, height: BLACK_KEY_HEIGHT,
                  background: active
                    ? "linear-gradient(180deg,#8b6914,#5a4009)"
                    : "linear-gradient(180deg,#2a2018,#0f0c06)",
                  borderRadius:"0 0 5px 5px", cursor:"pointer",
                  boxShadow: active ? "0 3px 6px rgba(200,160,40,0.5)" : "0 4px 8px rgba(0,0,0,0.5)",
                  zIndex:3,
                }}/>
            );
          })}
        </div>
      </div>

      {/* Chord history strip */}
      {chordHist.length > 0 && (
        <div style={{background:"#111827",borderRadius:10,padding:10}}>
          <div style={{fontFamily:"'Fredoka One',cursive",fontSize:12,color:"#9ca3af",marginBottom:6}}>
            🎼 Piano Chords Played
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {chordHist.map((h,i) => (
              <div key={i} style={{
                padding:"3px 10px", borderRadius:8, fontSize:12, fontWeight:800,
                background:"#a78bfa22", color:"#a78bfa", border:"1px solid #a78bfa33",
                fontFamily:"'Fredoka One',cursive",
              }}>
                {h.name}
              </div>
            ))}
          </div>
          {chordHist.length >= 2 && (
            <div style={{fontSize:10,color:"#6b7280",marginTop:4}}>
              Suggested next: {getProgressions(chordHist[chordHist.length - 1]?.name?.match(/^[A-G]#?/)?.[0] || "C")[0]?.chords?.join(" → ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
