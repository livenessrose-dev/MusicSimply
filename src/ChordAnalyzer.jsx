/**
 * components/Chords/ChordAnalyzer.jsx
 *
 * Listens to noteInfo updates from the mic, accumulates recent notes,
 * detects the chord, tracks history, and shows suggested progressions.
 *
 * Props:
 *   noteInfo — from useMic() — { note, octave, midi, ... } | null
 */

import { useState, useEffect, useRef } from "react";
import { detectChordFromNotes, getProgressions } from "./audioTheory";
import { CHORD_TYPE_LABELS } from "./theory";

const ACCENT_COLORS = ["#a78bfa","#f472b6","#fb923c","#fbbf24"];

export default function ChordAnalyzer({ noteInfo }) {
  const [notes, setNotes] = useState([]);   // recently heard notes
  const [chord, setChord] = useState(null); // detected chord
  const [progs, setProgs] = useState([]);   // suggested progressions
  const [hist,  setHist]  = useState([]);   // chord name history

  const lastKeyRef = useRef(null);
  const timerRef   = useRef(null);

  // ── Accumulate notes from mic ─────────────────────────────────────────────
  useEffect(() => {
    if (!noteInfo) return;
    const key = `${noteInfo.note}${noteInfo.octave}`;
    if (key === lastKeyRef.current) return; // same note, skip
    lastKeyRef.current = key;

    setNotes(prev => {
      if (prev.some(n => n.note === noteInfo.note && n.oct === noteInfo.octave)) return prev;
      return [...prev.slice(-5), { note: noteInfo.note, oct: noteInfo.octave, midi: noteInfo.midi, time: Date.now() }];
    });

    // Debounce chord detection — wait for a short pause in playing
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setNotes(prev => {
        const recent = prev.filter(n => Date.now() - n.time < 3500);
        const ch     = detectChordFromNotes(recent.map(n => n.midi));
        setChord(ch);
        if (ch) {
          setProgs(getProgressions(ch.root));
          setHist(h => {
            const name = `${ch.root}${ch.type}`;
            if (h[h.length - 1] === name) return h;
            return [...h.slice(-7), name];
          });
        }
        return recent;
      });
    }, 700);
  }, [noteInfo]);

  function clearAll() {
    setNotes([]); setChord(null); setProgs([]);
    lastKeyRef.current = null;
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>

      {/* Heard notes */}
      <div style={{background:"#111827",borderRadius:12,padding:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontFamily:"'Fredoka One',cursive",fontSize:13,color:"#9ca3af"}}>🎵 Heard Notes</span>
          <div style={{flex:1}}/>
          {notes.length > 0 && (
            <button onClick={clearAll} style={{fontSize:10,padding:"2px 8px",borderRadius:6,border:"1px solid #374151",background:"transparent",color:"#6b7280",cursor:"pointer"}}>
              Clear
            </button>
          )}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,minHeight:28}}>
          {notes.length === 0
            ? <span style={{fontSize:11,color:"#374151"}}>Play something with the mic on…</span>
            : notes.map((n,i) => (
                <div key={i} style={{padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700,background:"#a78bfa22",color:"#a78bfa",border:"1px solid #a78bfa44",fontFamily:"'Fredoka One',cursive"}}>
                  {n.note}{n.oct}
                </div>
              ))
          }
        </div>
      </div>

      {/* Detected chord */}
      <div style={{background:"#111827",borderRadius:12,padding:12}}>
        <div style={{fontFamily:"'Fredoka One',cursive",fontSize:13,color:"#9ca3af",marginBottom:8}}>🎼 Chord Detected</div>
        {chord ? (
          <div>
            <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
              <span style={{fontFamily:"'Fredoka One',cursive",fontSize:34,color:"#f472b6",lineHeight:1}}>{chord.root}</span>
              <span style={{fontSize:18,color:"#fb923c",fontWeight:800}}>{chord.type}</span>
              {chord.partial && <span style={{fontSize:10,color:"#6b7280"}}>(partial)</span>}
            </div>
            <div style={{fontSize:11,color:"#6b7280"}}>
              {CHORD_TYPE_LABELS[chord.type] || chord.type} — intervals: {chord.intervals.join(", ")}
            </div>
          </div>
        ) : (
          <span style={{fontSize:12,color:"#374151"}}>Waiting for chord…</span>
        )}
      </div>

      {/* Chord history */}
      {hist.length > 0 && (
        <div style={{background:"#111827",borderRadius:12,padding:12}}>
          <div style={{fontFamily:"'Fredoka One',cursive",fontSize:13,color:"#9ca3af",marginBottom:8}}>📜 Chord History</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
            {hist.map((c,i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
                <div style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"#1f2937",color:"#10b981",border:"1px solid #10b98144"}}>{c}</div>
                {i < hist.length - 1 && <span style={{color:"#374151",fontSize:14}}>→</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested progressions */}
      {progs.length > 0 && (
        <div style={{background:"#111827",borderRadius:12,padding:12}}>
          <div style={{fontFamily:"'Fredoka One',cursive",fontSize:13,color:"#9ca3af",marginBottom:8}}>💡 Suggested Progressions</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {progs.map((p,i) => (
              <div key={i} style={{background:"#0d1117",borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:10,color:"#6b7280",marginBottom:4,fontFamily:"monospace"}}>{p.name}</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {p.chords.map((c,ci) => (
                    <div key={ci} style={{display:"flex",alignItems:"center",gap:4}}>
                      <div style={{
                        padding:"4px 12px", borderRadius:8, fontSize:13, fontWeight:800,
                        background: ACCENT_COLORS[ci] + "22",
                        color:      ACCENT_COLORS[ci],
                        border:    `1px solid ${ACCENT_COLORS[ci]}44`,
                        fontFamily:"'Fredoka One',cursive",
                      }}>
                        {c}
                      </div>
                      {ci < p.chords.length - 1 && <span style={{color:"#374151"}}>→</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
