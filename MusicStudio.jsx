import { useState, useEffect, useRef, useCallback } from "react";
import { PitchDetector } from "pitchy";

// ── constants ──────────────────────────────────────────────────────────────────
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const INST_OPTIONS = ["Piano","Guitar","Voice"];
const INST_ICONS = { Piano:"🎹", Guitar:"🎸", Voice:"🎤" };
const INST_COLORS = { Piano:"#a78bfa", Guitar:"#fb923c", Voice:"#f472b6" };

// Volume gate — same values as the article
const MIN_VOLUME_DB = -48;
const MAX_VOLUME_DB = -12;

// ── note info from frequency ───────────────────────────────────────────────────
// We use 440Hz as the mathematical reference for MIDI conversion.
// This is the universal standard — A4=440Hz = MIDI 69.
// The "441Hz" on phone tuners just means their A4 target is 441Hz,
// but the note-to-frequency math is still anchored to the 12-TET scale.
const A4_HZ = 440;
const A4_MIDI = 69;

function freqToNoteInfo(freq) {
  if (!freq || freq <= 0) return null;

  // Step 1: Convert Hz to MIDI note number (continuous, not rounded yet)
  // midi=69 means A4=440Hz. Each semitone multiplies freq by 2^(1/12).
  // Inverting: midi = 12 * log2(freq / 440) + 69
  const midi = 12 * Math.log2(freq / A4_HZ) + A4_MIDI;

  // Step 2: Round to nearest semitone — this is our closest note
  const midiRounded = Math.round(midi);

  // Step 3: Note name — MIDI note 0 = C, 1 = C#, 2 = D ... 11 = B, 12 = C again
  // We use double-modulo to handle negative numbers safely in JS
  // e.g. MIDI 64 → 64 % 12 = 4 → NOTE_NAMES[4] = "E" ✓
  const noteIdx = ((midiRounded % 12) + 12) % 12;

  // Step 4: Octave number
  // MIDI 0=C-1, 12=C0, 24=C1, 36=C2, 48=C3, 60=C4, 72=C5
  // Formula: floor(midi / 12) - 1
  // e.g. MIDI 40 (E2): floor(40/12)-1 = floor(3.33)-1 = 3-1 = 2 ✓
  // e.g. MIDI 64 (E4): floor(64/12)-1 = floor(5.33)-1 = 5-1 = 4 ✓
  const octave = Math.floor(midiRounded / 12) - 1;

  // Step 5: Exact target frequency for the rounded note
  const targetFreq = A4_HZ * Math.pow(2, (midiRounded - A4_MIDI) / 12);

  // Step 6: Cents deviation from target (+ = sharp, - = flat)
  // 100 cents = 1 semitone
  const cents = Math.round(1200 * Math.log2(freq / targetFreq));

  return { note: NOTE_NAMES[noteIdx], octave, cents, freq: freq.toFixed(1), targetFreq };
}

// ── RMS volume in dB ──────────────────────────────────────────────────────────
function getRmsDb(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  return rms === 0 ? -Infinity : 20 * Math.log10(rms);
}

// ── Weighted median — trims outliers then takes middle value ──────────────────
function stableFreq(history) {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a - b);
  // Trim top 2 and bottom 2 outliers when we have enough samples
  // This rejects harmonic spikes and sub-harmonic dips completely
  const trimmed = sorted.length >= 8 ? sorted.slice(2, -2) : sorted;
  return trimmed[Math.floor(trimmed.length / 2)];
}


// ── Semicircle Tuner ───────────────────────────────────────────────────────────
function SemicircleTuner({ noteInfo, micOn, onToggleMic }) {
  const cx = 160, cy = 155, r = 120;
  const labels = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];

  // Hold last valid reading so display never flickers to blank mid-note
  const lastValidRef = useRef(null);
  if (noteInfo) lastValidRef.current = noteInfo;
  const display = lastValidRef.current;  function centsToAngle(c) {
    return Math.PI + ((c + 50) / 100) * Math.PI;
  }
  function polarToXY(angle, radius) {
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  }

  const cents = display ? Math.max(-50, Math.min(50, display.cents)) : 0;
  const needleAngle = centsToAngle(cents);
  const needleTip = polarToXY(needleAngle, r - 10);
  const needleBase1 = polarToXY(needleAngle + Math.PI / 2, 6);
  const needleBase2 = polarToXY(needleAngle - Math.PI / 2, 6);

  const tuneColor = !noteInfo ? "#4b5563"
    : Math.abs(cents) <= 10 ? "#4ade80"
    : Math.abs(cents) <= 25 ? "#facc15"
    : "#f87171";

  const arcStart = polarToXY(Math.PI, r);
  const arcEnd = polarToXY(2 * Math.PI, r);
  const arcD = `M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`;
  const greenStart = polarToXY(centsToAngle(-10), r);
  const greenEnd = polarToXY(centsToAngle(10), r);
  const greenArcD = `M ${greenStart.x} ${greenStart.y} A ${r} ${r} 0 0 1 ${greenEnd.x} ${greenEnd.y}`;

  const ticks = labels.map(c => {
    const ang = centsToAngle(c);
    return {
      c,
      outer: polarToXY(ang, r + 4),
      inner: polarToXY(ang, r - (c % 10 === 0 ? 14 : 8)),
      labelPos: polarToXY(ang, r + 18),
    };
  });

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>

      {/* Fixed-height note display — no layout shift */}
      <div style={{ height:58, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center", textAlign:"center" }}>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:44, lineHeight:1,
          color: noteInfo ? tuneColor : "#4b5563", transition:"color 0.25s" }}>
          {display ? `${display.note}${display.octave}` : "—"}
        </div>
        <div style={{ fontSize:11, color:"#6b7280", marginTop:2, fontFamily:"monospace" }}>
          {display ? `${display.freq} Hz` : micOn ? "play a note..." : "tap Use Mic"}
        </div>
      </div>

      {/* SVG — needle moves via CSS transition, no JS animation loop needed */}
      <svg width={320} height={170} style={{ overflow:"visible" }}>
        <path d={arcD} fill="none" stroke="#1f2937" strokeWidth={22} strokeLinecap="round"/>
        <path d={greenArcD} fill="none" stroke="#4ade80" strokeWidth={6}
          strokeLinecap="round" opacity={0.28}/>
        <path d={arcD} fill="none" stroke={tuneColor} strokeWidth={3} strokeLinecap="round"
          opacity={noteInfo ? 0.45 : 0.08} style={{ transition:"stroke 0.25s, opacity 0.25s" }}/>

        {ticks.map(({ c, outer, inner, labelPos }) => (
          <g key={c}>
            <line x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
              stroke={c === 0 ? "#10b981" : "#374151"}
              strokeWidth={c % 10 === 0 ? 2 : 1}/>
            {c % 10 === 0 && (
              <text x={labelPos.x} y={labelPos.y} textAnchor="middle"
                dominantBaseline="middle" fontSize={9} fill="#6b7280" fontFamily="monospace">
                {c > 0 ? `+${c}` : c}
              </text>
            )}
          </g>
        ))}

        {/* center zero tick */}
        <line
          x1={polarToXY(centsToAngle(0), r + 4).x} y1={polarToXY(centsToAngle(0), r + 4).y}
          x2={polarToXY(centsToAngle(0), r - 20).x} y2={polarToXY(centsToAngle(0), r - 20).y}
          stroke="#10b981" strokeWidth={2.5}/>

        {/* needle — CSS transition gives smooth movement without animation overhead */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${cx},${cy} ${needleBase2.x},${needleBase2.y}`}
          fill={tuneColor}
          opacity={noteInfo ? 0.95 : 0.15}
          style={{ transition:"all 0.15s ease-out" }}/>
        <circle cx={cx} cy={cy} r={8} fill="#111827" stroke={tuneColor} strokeWidth={2.5}
          style={{ transition:"stroke 0.25s" }}/>
        <circle cx={cx} cy={cy} r={3.5} fill={tuneColor}
          style={{ transition:"fill 0.25s" }}/>

        {/* cents — shown inside SVG, no separate DOM element to flicker */}
        <text x={cx} y={cy - 26} textAnchor="middle" fontSize={13} fill={tuneColor}
          fontFamily="monospace" fontWeight="bold" style={{ transition:"fill 0.25s" }}>
          {noteInfo
            ? (cents > 0 ? `+${cents}¢` : `${cents}¢`)
            : display ? `${cents > 0 ? "+" : ""}${cents}¢` : ""}
        </text>
      </svg>

      {/* Mic toggle */}
      <button onClick={onToggleMic} style={{
        padding:"8px 24px", borderRadius:12, border:"none", cursor:"pointer",
        fontFamily:"'Fredoka One',cursive", fontSize:14, marginTop:2,
        background: micOn ? "#ef4444" : "#7c3aed", color:"#fff",
        transition:"background 0.2s"
      }}>
        {micOn ? "🛑 Stop Mic" : "🎤 Use Mic"}
      </button>
    </div>
  );
}

// ── Mini waveform display ──────────────────────────────────────────────────────
function Waveform({ active, color, hasData }) {
  const bars = 28;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:2, height:32, padding:"0 4px", flex:1 }}>
      {Array.from({ length: bars }, (_, i) => {
        const h = active
          ? `${4 + Math.random() * 24}px`
          : hasData ? `${4 + (Math.sin(i * 0.8) * 10 + 12)}px` : "3px";
        return (
          <div key={i} style={{
            width:4, height: hasData || active ? undefined : "3px",
            minHeight:3, maxHeight:28,
            background: color,
            borderRadius:2,
            opacity: hasData || active ? 0.85 : 0.25,
            flex:"0 0 auto",
          }}/>
        );
      })}
    </div>
  );
}

// ── Track Row ─────────────────────────────────────────────────────────────────
function TrackRow({ id, track, onUpdate, onRemove, globalPlaying }) {
  const [waveKey, setWaveKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const waveTimer = useRef(null);

  useEffect(() => {
    if (track.recording) {
      waveTimer.current = setInterval(() => setWaveKey(k => k + 1), 80);
    } else {
      clearInterval(waveTimer.current);
    }
    return () => clearInterval(waveTimer.current);
  }, [track.recording]);

  const instColor = INST_COLORS[track.instrument] || "#a78bfa";

  function handleRecClick() {
    if (track.recording) {
      onUpdate({ recording: false, hasData: true });
    } else {
      onUpdate({ recording: true, hasData: false, playing: false });
    }
  }
  function handlePlayClick() {
    onUpdate({ playing: !track.playing, recording: false });
  }

  return (
    <div style={{
      background: track.recording ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${track.recording ? "#ef444444" : expanded ? "#7c3aed44" : "#ffffff18"}`,
      borderRadius:14, padding:"10px 14px", display:"flex", flexDirection:"column", gap:8,
      transition:"all 0.2s"
    }}>
      {/* ── Collapsed row: always visible ── */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>

        {/* Track number + expand toggle */}
        <button onClick={() => setExpanded(e => !e)} style={{
          background:"transparent", border:"none", cursor:"pointer",
          display:"flex", alignItems:"center", gap:6, padding:0
        }}>
          <div style={{ fontFamily:"monospace", fontSize:12, color:"#6b7280", minWidth:22 }}>
            {String(id).padStart(2,"0")}
          </div>
          <div style={{ fontSize:10, color:"#4b5563", transition:"transform 0.2s",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</div>
        </button>

        {/* Instrument icon + name — only shown when a type is set */}
        <div style={{ display:"flex", alignItems:"center", gap:5, flex:1 }}>
          {track.instrument ? (
            <div style={{ display:"flex", alignItems:"center", gap:5,
              background: instColor+"18", borderRadius:8, padding:"2px 8px",
              border:`1px solid ${instColor}33` }}>
              <span style={{ fontSize:14 }}>{INST_ICONS[track.instrument]}</span>
              <span style={{ fontSize:12, fontWeight:700, color: instColor,
                fontFamily:"'Nunito',sans-serif" }}>{track.instrument}</span>
            </div>
          ) : (
            <span style={{ fontSize:12, color:"#4b5563", fontStyle:"italic" }}>
              click 01 to pick instrument
            </span>
          )}
        </div>

        {/* Mute */}
        <button onClick={() => onUpdate({ muted: !track.muted })} title="Mute"
          style={{
            width:26, height:26, borderRadius:7, border:"1px solid #374151",
            background: track.muted ? "#374151" : "transparent",
            color: track.muted ? "#f59e0b" : "#6b7280",
            fontSize:10, fontWeight:800, cursor:"pointer", fontFamily:"monospace"
          }}>M</button>

        {/* Solo */}
        <button onClick={() => onUpdate({ solo: !track.solo })} title="Solo"
          style={{
            width:26, height:26, borderRadius:7, border:"1px solid #374151",
            background: track.solo ? "#1d4ed8" : "transparent",
            color: track.solo ? "#93c5fd" : "#6b7280",
            fontSize:10, fontWeight:800, cursor:"pointer", fontFamily:"monospace"
          }}>S</button>

        {/* Remove */}
        <button onClick={onRemove}
          style={{
            width:26, height:26, borderRadius:7, border:"1px solid #374151",
            background:"transparent", color:"#6b7280", fontSize:14, cursor:"pointer"
          }}>×</button>
      </div>

      {/* ── Expanded: instrument selector ── */}
      {expanded && (
        <div style={{ display:"flex", gap:6, paddingLeft:28, flexWrap:"wrap" }}>
          <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase",
            letterSpacing:1, fontWeight:700, width:"100%", marginBottom:2 }}>
            Select Instrument
          </div>
          {INST_OPTIONS.map(inst => (
            <button key={inst} onClick={() => { onUpdate({ instrument: inst }); setExpanded(false); }}
              style={{
                padding:"6px 14px", borderRadius:10,
                border:`1.5px solid ${track.instrument === inst ? instColor : "#374151"}`,
                background: track.instrument === inst ? instColor+"22" : "#111827",
                color: track.instrument === inst ? instColor : "#9ca3af",
                fontSize:13, fontFamily:"'Nunito', sans-serif", fontWeight:700,
                cursor:"pointer", transition:"all 0.15s",
                display:"flex", alignItems:"center", gap:6
              }}>
              <span style={{ fontSize:18 }}>{INST_ICONS[inst]}</span> {inst}
            </button>
          ))}
        </div>
      )}

      {/* ── Transport row: record, play, waveform ── */}
      <div style={{ display:"flex", alignItems:"center", gap:8,
        background:"#111827", borderRadius:10, padding:"6px 10px" }}>
        {/* Record */}
        <button onClick={handleRecClick} style={{
          width:32, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
          background: track.recording ? "#ef4444" : "#374151",
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow: track.recording ? "0 0 0 4px rgba(239,68,68,0.25)" : "none",
          animation: track.recording ? "recPulse 1s infinite" : "none",
          flexShrink:0, transition:"background 0.2s"
        }}>
          <div style={{ width:10, height:10, borderRadius:"50%", background:"#fff" }}/>
        </button>

        {/* Play/Stop */}
        <button onClick={handlePlayClick} disabled={!track.hasData}
          style={{
            width:32, height:32, borderRadius:"50%", border:"none",
            cursor: track.hasData ? "pointer" : "not-allowed",
            background: track.playing ? instColor : track.hasData ? "#1f2937" : "#1a1f2e",
            display:"flex", alignItems:"center", justifyContent:"center",
            flexShrink:0, transition:"all 0.2s"
          }}>
          {track.playing
            ? <div style={{ display:"flex", gap:3 }}>
                <div style={{width:4,height:12,background:"#fff",borderRadius:1}}/>
                <div style={{width:4,height:12,background:"#fff",borderRadius:1}}/>
              </div>
            : <div style={{ width:0, height:0, borderLeft:"10px solid",
                borderTop:"6px solid transparent", borderBottom:"6px solid transparent",
                borderLeftColor: track.hasData ? "#fff" : "#374151", marginLeft:2 }}/>
          }
        </button>

        {/* Waveform */}
        <div key={waveKey} style={{ flex:1, display:"flex", alignItems:"center" }}>
          <Waveform active={track.recording} color={instColor} hasData={track.hasData}/>
        </div>

        {/* Status */}
        <div style={{ fontSize:11,
          color: track.recording ? "#ef4444" : track.hasData ? instColor : "#374151",
          minWidth:48, textAlign:"right", fontFamily:"monospace", fontWeight:700 }}>
          {track.recording ? "● REC" : track.playing ? "▶ PLY" : track.hasData ? "READY" : "EMPTY"}
        </div>
      </div>

      {/* Chord tag strip */}
      {track.hasData && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {(track.chords || []).map((c, i) => (
            <div key={i} style={{
              padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700,
              background: instColor + "22", color: instColor,
              border:`1px solid ${instColor}44`
            }}>{c}</div>
          ))}
          <button onClick={() => onUpdate({ chords: getChordSuggestions(track.instrument) })}
            style={{
              padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700,
              background:"transparent", color:"#6b7280", border:"1px dashed #374151", cursor:"pointer"
            }}>✨ find chords</button>
        </div>
      )}
    </div>
  );
}

const CHORD_SETS = {
  Piano: [["C Maj","G Maj","Am","F Maj"],["Dm","Em","C Maj","G Maj"],["F Maj","C Maj","Dm","Bb Maj"]],
  Guitar: [["Em","G Maj","D Maj","C Maj"],["Am","F Maj","C Maj","G Maj"],["G Maj","Cadd9","Em7","Dsus2"]],
  Voice:  [["C Maj","Am","F Maj","G Maj"],["Dm","Bb Maj","F Maj","C Maj"],["Em","Am","C Maj","G Maj"]],
};
function getChordSuggestions(inst) {
  const sets = CHORD_SETS[inst] || CHORD_SETS.Piano;
  return sets[Math.floor(Math.random() * sets.length)];
}

// ── VexFlow Sheet Music Notation ───────────────────────────────────────────────
function SheetMusicEditor() {
  const canvasRef = useRef(null);
  const [selectedNote, setSelectedNote] = useState("q"); // q=quarter, h=half, w=whole, 8=eighth
  const [selectedPitch, setSelectedPitch] = useState("C/4");
  const [notes, setNotes] = useState([
    { pitch:"C/4", duration:"q" },
    { pitch:"E/4", duration:"q" },
    { pitch:"G/4", duration:"q" },
    { pitch:"C/5", duration:"h" },
  ]);
  const [clef, setClef] = useState("treble");
  const [timeSignature, setTimeSignature] = useState("4/4");
  const [status, setStatus] = useState("");

  const PITCHES = [
    "C/5","B/4","A/4","G/4","F/4","E/4","D/4","C/4",
    "B/3","A/3","G/3","F/3","E/3","D/3","C/3"
  ];
  const DURATIONS = [
    { key:"w", label:"𝅝", name:"Whole" },
    { key:"h", label:"𝅗𝅥", name:"Half" },
    { key:"q", label:"♩", name:"Quarter" },
    { key:"8", label:"♪", name:"Eighth" },
  ];

  useEffect(() => {
    renderScore();
  }, [notes, clef, timeSignature]);

  async function renderScore() {
    if (!canvasRef.current) return;
    try {
      const VF = (await import("vexflow")).default || (await import("vexflow"));
      const Vex = VF.Vex || VF;
      const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = VF.Flow || VF;

      const canvas = canvasRef.current;
      canvas.innerHTML = "";

      const renderer = new Renderer(canvas, Renderer.Backends.SVG);
      renderer.resize(Math.max(600, notes.length * 80 + 120), 180);
      const ctx = renderer.getContext();
      ctx.setFont("Arial", 10);

      const staveWidth = Math.max(500, notes.length * 75 + 80);
      const stave = new Stave(10, 20, staveWidth);
      stave.addClef(clef).addTimeSignature(timeSignature);
      stave.setContext(ctx).draw();

      if (notes.length === 0) return;

      // Build VexFlow notes
      const vfNotes = notes.map(n => {
        const sn = new StaveNote({ clef, keys:[n.pitch], duration: n.duration });
        // Add accidental if needed
        if (n.pitch.includes("#")) sn.addModifier(new Accidental("#"), 0);
        if (n.pitch.includes("b")) sn.addModifier(new Accidental("b"), 0);
        return sn;
      });

      // Split into beats based on time sig
      const [beatsPerMeasure] = timeSignature.split("/").map(Number);
      const durationValues = { w:4, h:2, q:1, "8":0.5 };
      let currentBeats = 0;
      let measureNotes = [];
      const measures = [];

      for (const n of vfNotes) {
        const dur = durationValues[n.duration] ?? 1;
        if (currentBeats + dur > beatsPerMeasure && measureNotes.length > 0) {
          measures.push([...measureNotes]);
          measureNotes = [];
          currentBeats = 0;
        }
        measureNotes.push(n);
        currentBeats += dur;
      }
      if (measureNotes.length) measures.push(measureNotes);

      // Render first measure (keep it simple for kids)
      const voice = new Voice({ num_beats: beatsPerMeasure, beat_value: 4 }).setStrict(false);
      voice.addTickables(vfNotes);
      new Formatter().joinVoices([voice]).format([voice], staveWidth - 60);
      voice.draw(ctx, stave);

      setStatus("");
    } catch (e) {
      setStatus("Loading notation library... " + e.message);
    }
  }

  function addNote() {
    setNotes(n => [...n, { pitch: selectedPitch, duration: selectedNote }]);
  }
  function removeLastNote() {
    setNotes(n => n.slice(0, -1));
  }
  function clearAll() {
    setNotes([]);
  }

  const noteColor = "#a78bfa";

  return (
    <div style={{ flex:1, overflowY:"auto", padding:20, display:"flex", flexDirection:"column", gap:16 }}>
      {/* Controls */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:12, alignItems:"flex-start" }}>

        {/* Clef */}
        <div style={{ background:"#111827", borderRadius:12, padding:12, border:"1px solid #1f2937" }}>
          <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:6 }}>Clef</div>
          <div style={{ display:"flex", gap:4 }}>
            {["treble","bass"].map(c => (
              <button key={c} onClick={() => setClef(c)} style={{
                padding:"4px 12px", borderRadius:8, border:`1.5px solid ${clef===c?"#7c3aed":"#374151"}`,
                background: clef===c?"#7c3aed22":"transparent", color: clef===c?"#a78bfa":"#6b7280",
                fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Nunito',sans-serif"
              }}>{c.charAt(0).toUpperCase()+c.slice(1)}</button>
            ))}
          </div>
        </div>

        {/* Time signature */}
        <div style={{ background:"#111827", borderRadius:12, padding:12, border:"1px solid #1f2937" }}>
          <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:6 }}>Time</div>
          <div style={{ display:"flex", gap:4 }}>
            {["4/4","3/4","2/4","6/8"].map(t => (
              <button key={t} onClick={() => setTimeSignature(t)} style={{
                padding:"4px 10px", borderRadius:8, border:`1.5px solid ${timeSignature===t?"#7c3aed":"#374151"}`,
                background: timeSignature===t?"#7c3aed22":"transparent", color: timeSignature===t?"#a78bfa":"#6b7280",
                fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"monospace"
              }}>{t}</button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div style={{ background:"#111827", borderRadius:12, padding:12, border:"1px solid #1f2937" }}>
          <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:6 }}>Duration</div>
          <div style={{ display:"flex", gap:4 }}>
            {DURATIONS.map(d => (
              <button key={d.key} onClick={() => setSelectedNote(d.key)} title={d.name} style={{
                padding:"4px 12px", borderRadius:8, border:`1.5px solid ${selectedNote===d.key?"#f472b6":"#374151"}`,
                background: selectedNote===d.key?"#f472b622":"transparent",
                color: selectedNote===d.key?"#f472b6":"#6b7280",
                fontSize:18, cursor:"pointer"
              }}>{d.label}</button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ background:"#111827", borderRadius:12, padding:12, border:"1px solid #1f2937", display:"flex", gap:6, alignItems:"flex-end" }}>
          <button onClick={removeLastNote} style={{
            padding:"6px 12px", borderRadius:8, border:"1px solid #374151",
            background:"transparent", color:"#f87171", fontSize:12, fontWeight:700, cursor:"pointer"
          }}>⌫ Undo</button>
          <button onClick={clearAll} style={{
            padding:"6px 12px", borderRadius:8, border:"1px solid #374151",
            background:"transparent", color:"#6b7280", fontSize:12, fontWeight:700, cursor:"pointer"
          }}>🗑 Clear</button>
        </div>
      </div>

      {/* Note entry: piano-style pitch selector */}
      <div style={{ background:"#111827", borderRadius:14, padding:14, border:"1px solid #1f2937" }}>
        <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:10 }}>
          Pick a Note then tap Add ↓
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
          {PITCHES.map(p => {
            const noteName = p.split("/")[0];
            const isSharp = noteName.includes("#");
            const isSelected = selectedPitch === p;
            return (
              <button key={p} onClick={() => setSelectedPitch(p)} style={{
                width: isSharp ? 34 : 40, height: isSharp ? 50 : 64,
                borderRadius:8, border:`2px solid ${isSelected ? noteColor : isSharp ? "#374151" : "#1f2937"}`,
                background: isSelected ? noteColor : isSharp ? "#1f2937" : "#0d1117",
                color: isSelected ? "#fff" : isSharp ? "#9ca3af" : "#e5e7eb",
                fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"monospace",
                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end",
                paddingBottom:4, transition:"all 0.1s"
              }}>
                {noteName}<span style={{ fontSize:9, opacity:0.6 }}>{p.split("/")[1]}</span>
              </button>
            );
          })}
        </div>
        <button onClick={addNote} style={{
          padding:"8px 24px", borderRadius:10, border:"none", cursor:"pointer",
          background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color:"#fff",
          fontFamily:"'Fredoka One',cursive", fontSize:15, transition:"all 0.2s"
        }}>
          ➕ Add {selectedPitch.split("/")[0]} ({DURATIONS.find(d=>d.key===selectedNote)?.name})
        </button>
      </div>

      {/* Score canvas */}
      <div style={{ background:"#fff", borderRadius:14, padding:16, border:"1px solid #1f2937", overflowX:"auto" }}>
        <div style={{ fontSize:10, color:"#6b7280", marginBottom:6, fontWeight:700, textTransform:"uppercase", letterSpacing:1 }}>
          🎼 Score — {notes.length} note{notes.length !== 1 ? "s" : ""}
        </div>
        {status && <div style={{ fontSize:11, color:"#f59e0b", marginBottom:6 }}>{status}</div>}
        <div ref={canvasRef} style={{ minHeight:180 }}/>
      </div>

      {/* Note list */}
      {notes.length > 0 && (
        <div style={{ background:"#111827", borderRadius:12, padding:12, border:"1px solid #1f2937" }}>
          <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:8 }}>Notes</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
            {notes.map((n, i) => (
              <div key={i} style={{
                padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700,
                background:"#7c3aed22", color:"#a78bfa", border:"1px solid #7c3aed44",
                fontFamily:"monospace"
              }}>
                {n.pitch.split("/")[0]}{n.pitch.split("/")[1]} ({DURATIONS.find(d=>d.key===n.duration)?.name[0]})
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── OSMD Import Tab ────────────────────────────────────────────────────────────
function SheetImporter() {
  const containerRef = useRef(null);
  const osmdRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | loading | loaded | error
  const [fileName, setFileName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [zoom, setZoom] = useState(1.0);
  const [isDragging, setIsDragging] = useState(false);

  async function loadFile(file) {
    if (!file) return;
    setFileName(file.name);
    setStatus("loading");
    setErrorMsg("");
    try {
      const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
      if (osmdRef.current) {
        osmdRef.current = null;
        containerRef.current.innerHTML = "";
      }
      const osmd = new OpenSheetMusicDisplay(containerRef.current, {
        autoResize: true,
        backend: "svg",
        drawTitle: true,
        drawComposer: true,
        drawCredits: true,
      });
      osmdRef.current = osmd;
      const text = await file.text();
      await osmd.load(text);
      osmd.zoom = zoom;
      osmd.render();
      setStatus("loaded");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e.message);
    }
  }

  function handleFileInput(e) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }
  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }
  function handleZoomChange(z) {
    setZoom(z);
    if (osmdRef.current && status === "loaded") {
      osmdRef.current.zoom = z;
      osmdRef.current.render();
    }
  }

  return (
    <div style={{ flex:1, overflowY:"auto", padding:20, display:"flex", flexDirection:"column", gap:16 }}>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border:`2px dashed ${isDragging ? "#7c3aed" : "#374151"}`,
          borderRadius:16, padding:"32px 20px", textAlign:"center",
          background: isDragging ? "#7c3aed11" : "#111827",
          transition:"all 0.2s"
        }}>
        <div style={{ fontSize:40, marginBottom:8 }}>🎼</div>
        <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:18, color:"#9ca3af", marginBottom:4 }}>
          Drop a MusicXML file here
        </div>
        <div style={{ fontSize:12, color:"#4b5563", marginBottom:16 }}>
          Supports .xml, .musicxml, .mxl files exported from MuseScore, Finale, Sibelius, etc.
        </div>
        <label style={{
          padding:"8px 24px", borderRadius:10, border:"none", cursor:"pointer",
          background:"linear-gradient(135deg,#7c3aed,#a78bfa)", color:"#fff",
          fontFamily:"'Fredoka One',cursive", fontSize:14, display:"inline-block"
        }}>
          📂 Browse File
          <input type="file" accept=".xml,.musicxml,.mxl" onChange={handleFileInput}
            style={{ display:"none" }}/>
        </label>
      </div>

      {/* Status */}
      {status === "loading" && (
        <div style={{ background:"#111827", borderRadius:12, padding:16, border:"1px solid #1f2937",
          display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:16, height:16, borderRadius:"50%", border:"2px solid #7c3aed",
            borderTopColor:"transparent", animation:"spin 0.8s linear infinite" }}/>
          <span style={{ color:"#9ca3af", fontSize:13 }}>Loading {fileName}...</span>
        </div>
      )}
      {status === "error" && (
        <div style={{ background:"#1f0a0a", borderRadius:12, padding:16, border:"1px solid #ef444433" }}>
          <div style={{ color:"#f87171", fontSize:13, fontWeight:700 }}>❌ Could not load file</div>
          <div style={{ color:"#6b7280", fontSize:11, marginTop:4 }}>{errorMsg}</div>
          <div style={{ color:"#4b5563", fontSize:11, marginTop:4 }}>Make sure it's a valid MusicXML file exported from MuseScore.</div>
        </div>
      )}
      {status === "loaded" && (
        <div style={{ display:"flex", alignItems:"center", gap:10, background:"#0a1f0a",
          borderRadius:12, padding:"10px 16px", border:"1px solid #4ade8033" }}>
          <span style={{ color:"#4ade80", fontSize:13, fontWeight:700 }}>✅ {fileName}</span>
          <div style={{ flex:1 }}/>
          <span style={{ fontSize:11, color:"#6b7280" }}>Zoom:</span>
          {[0.5,0.75,1.0,1.25,1.5].map(z => (
            <button key={z} onClick={() => handleZoomChange(z)} style={{
              padding:"2px 8px", borderRadius:6, border:`1px solid ${zoom===z?"#7c3aed":"#374151"}`,
              background: zoom===z?"#7c3aed22":"transparent", color: zoom===z?"#a78bfa":"#6b7280",
              fontSize:11, fontWeight:700, cursor:"pointer"
            }}>{z}×</button>
          ))}
        </div>
      )}

      {/* OSMD render target */}
      <div style={{
        background:"#fff", borderRadius:14, padding:16,
        border:"1px solid #1f2937", minHeight: status === "loaded" ? 400 : 0,
        display: status === "loaded" ? "block" : "none", overflowX:"auto"
      }}>
        <div ref={containerRef}/>
      </div>

      {/* Instructions */}
      {status === "idle" && (
        <div style={{ background:"#111827", borderRadius:12, padding:16, border:"1px solid #1f2937" }}>
          <div style={{ fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:10 }}>
            How to export from MuseScore
          </div>
          {[
            "1. Open your score in MuseScore Studio",
            "2. Go to File → Export",
            "3. Choose MusicXML (.musicxml) as the format",
            "4. Save the file to your computer",
            "5. Drop it here or click Browse File above",
          ].map((s,i) => (
            <div key={i} style={{ fontSize:12, color:"#6b7280", marginBottom:5, display:"flex", gap:8 }}>
              <span style={{ color:"#7c3aed" }}>→</span> {s}
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
export default function MusicStudio() {
  const [micOn, setMicOn] = useState(false);
  const [noteInfo, setNoteInfo] = useState(null);
  const [tracks, setTracks] = useState([
    { id:1, instrument:"Piano", recording:false, playing:false, muted:false, solo:false, hasData:false, chords:[] },
    { id:2, instrument:"Guitar", recording:false, playing:false, muted:false, solo:false, hasData:false, chords:[] },
    { id:3, instrument:"Voice", recording:false, playing:false, muted:false, solo:false, hasData:false, chords:[] },
  ]);
  const [globalPlaying, setGlobalPlaying] = useState(false);
  const [bpm] = useState(120);
  const [nextId, setNextId] = useState(4);
  const [activeTab, setActiveTab] = useState("tracks"); // "tracks" | "tuner" | "lyrics"

  // Lyric writing state
  const [sections, setSections] = useState([
    { id:1, label:"Verse 1", text:"" },
    { id:2, label:"Chorus", text:"" },
  ]);
  const [activeSection, setActiveSection] = useState(1);
  const [songTitle, setSongTitle] = useState("");
  const [lyricNextId, setLyricNextId] = useState(3);
  const SECTION_TYPES = ["Verse","Chorus","Bridge","Pre-Chorus","Outro","Hook","Intro"];

  function addSection(type) {
    const count = sections.filter(s => s.label.startsWith(type)).length + 1;
    const label = count > 1 || type === "Chorus" || type === "Bridge" ? `${type} ${count}` : `${type} 1`;
    const newSec = { id: lyricNextId, label, text:"" };
    setSections(s => [...s, newSec]);
    setActiveSection(lyricNextId);
    setLyricNextId(n => n + 1);
  }
  function removeSection(id) {
    setSections(s => {
      const filtered = s.filter(sec => sec.id !== id);
      if (activeSection === id && filtered.length) setActiveSection(filtered[0].id);
      return filtered;
    });
  }
  function updateSectionText(id, text) {
    setSections(s => s.map(sec => sec.id === id ? { ...sec, text } : sec));
  }
  function updateSectionLabel(id, label) {
    setSections(s => s.map(sec => sec.id === id ? { ...sec, label } : sec));
  }
  const wordCount = sections.reduce((acc, s) => acc + (s.text.trim() ? s.text.trim().split(/\s+/).length : 0), 0);
  const lineCount = sections.reduce((acc, s) => acc + (s.text.trim() ? s.text.trim().split("\n").filter(Boolean).length : 0), 0);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const freqHistoryRef = useRef([]);
  const lastUpdateRef = useRef(0); // throttle React state updates

  const runTunerLoop = useCallback(() => {
    if (!analyserRef.current || !detectorRef.current) return;

    const buf = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(buf);

    // Volume gate — reject silence
    const db = getRmsDb(buf);
    const inputVolume = Math.min(100, Math.max(0,
      ((db - MIN_VOLUME_DB) / (MAX_VOLUME_DB - MIN_VOLUME_DB)) * 100
    ));

    const [pitch, clarity] = detectorRef.current.findPitch(buf, audioCtxRef.current.sampleRate);

    // Lower clarity to 0.90 — 0.96 was too strict and caused dropouts
    // Also require minimum volume so silence doesn't produce junk readings
    const inRange = pitch > 60 && pitch < 1400 && clarity > 0.90 && inputVolume > 5;

    if (inRange) {
      const history = freqHistoryRef.current;
      history.push(pitch);
      // Keep 20 frames (~330ms) — larger window = much more stable reading
      if (history.length > 20) history.shift();

      // Only update React state ~8 times/sec — slow enough to be readable
      // Fast enough to still feel responsive
      const now = performance.now();
      if (now - lastUpdateRef.current > 120) {
        lastUpdateRef.current = now;
        const freq = stableFreq(history);
        if (freq) setNoteInfo(freqToNoteInfo(freq));
      }
    } else {
      if (freqHistoryRef.current.length > 0) {
        freqHistoryRef.current = [];
        // Delay clearing display by 300ms so it doesn't flash null between notes
        setTimeout(() => setNoteInfo(null), 300);
      }
    }

    rafRef.current = requestAnimationFrame(runTunerLoop);
  }, []);

  async function toggleMic() {
    if (micOn) {
      setMicOn(false);
      cancelAnimationFrame(rafRef.current);
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
      detectorRef.current = null;
      freqHistoryRef.current = [];
      setNoteInfo(null);
      return;
    }
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      // Resume context if suspended (browser autoplay policy)
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // off — echo cancellation distorts pitch
          noiseSuppression: false, // off — noise suppression mangles harmonics
          autoGainControl: false,  // off — AGC causes volume jumps that confuse pitch detection
        },
        video: false
      });
      const src = audioCtxRef.current.createMediaStreamSource(micStreamRef.current);
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 4096; // bigger than 2048 = better low-string accuracy
      src.connect(analyserRef.current);
      detectorRef.current = PitchDetector.forFloat32Array(analyserRef.current.fftSize);
      freqHistoryRef.current = [];
      lastUpdateRef.current = 0;
      setMicOn(true);
      runTunerLoop();
    } catch {
      alert("Microphone access denied. Please allow mic access to use the tuner.");
    }
  }

  function updateTrack(id, patch) {
    setTracks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
  }
  function removeTrack(id) {
    setTracks(ts => ts.filter(t => t.id !== id));
  }
  function addTrack() {
    setTracks(ts => [...ts, { id: nextId, instrument:"Piano", recording:false, playing:false, muted:false, solo:false, hasData:false, chords:[] }]);
    setNextId(n => n + 1);
  }
  function toggleGlobalPlay() {
    const next = !globalPlaying;
    setGlobalPlaying(next);
    setTracks(ts => ts.map(t => ({ ...t, playing: t.hasData && next })));
  }

  return (
    <div style={{
      minHeight:"100vh", background:"#0a0e1a", fontFamily:"'Nunito', sans-serif",
      color:"#e5e7eb", display:"flex", flexDirection:"column"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');
        @keyframes recPulse { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)} 50%{box-shadow:0 0 0 8px rgba(239,68,68,0)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width:6px } ::-webkit-scrollbar-track { background:#111827 } ::-webkit-scrollbar-thumb { background:#374151; border-radius:3px }
        button:focus { outline: none; }
        .lyric-textarea { background:#0d1117; border:1.5px solid #1f2937; border-radius:10px; color:#e5e7eb; font-family:'Nunito',sans-serif; font-size:15px; line-height:1.8; padding:12px; resize:none; width:100%; transition:border-color 0.2s; }
        .lyric-textarea:focus { outline:none; border-color:#7c3aed; }
        .lyric-textarea::placeholder { color:#374151; }
        .section-tab { padding:6px 12px; border-radius:8px; border:1px solid #1f2937; background:transparent; color:#6b7280; font-family:'Nunito',sans-serif; font-size:12px; font-weight:700; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
        .section-tab.active { background:#7c3aed22; border-color:#7c3aed; color:#a78bfa; }
        .section-tab:hover:not(.active) { border-color:#374151; color:#9ca3af; }
        .title-input { background:transparent; border:none; border-bottom:1.5px solid #1f2937; color:#e5e7eb; font-family:'Fredoka One',cursive; font-size:18px; padding:4px 0; width:100%; transition:border-color 0.2s; }
        .title-input:focus { outline:none; border-bottom-color:#7c3aed; }
        .title-input::placeholder { color:#374151; }
        .label-input { background:transparent; border:none; color:#a78bfa; font-family:'Nunito',sans-serif; font-size:12px; font-weight:700; width:80px; cursor:text; }
        .label-input:focus { outline:none; }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background:"#111827", borderBottom:"1px solid #1f2937",
        padding:"8px 20px", display:"flex", alignItems:"center"
      }}>
        <div style={{ fontFamily:"'Fredoka One', cursive", fontSize:20,
          background:"linear-gradient(135deg,#a78bfa,#f472b6,#fb923c)",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          🎵 My Music Studio
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{
        background:"#111827", borderBottom:"1px solid #1f2937",
        padding:"0 20px", display:"flex", alignItems:"flex-end", gap:2
      }}>
        {[
          { key:"tracks", label:"🎛 Tracks" },
          { key:"tuner",  label:"🎸 Tuner"  },
          { key:"lyrics", label:"✍️ Lyrics"  },
          { key:"notation", label:"🎼 Notation" },
          { key:"import",   label:"📂 Import Score" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding:"10px 20px", border:"none", cursor:"pointer",
            fontFamily:"'Fredoka One', cursive", fontSize:14,
            background: activeTab === tab.key ? "#0a0e1a" : "transparent",
            color: activeTab === tab.key ? "#a78bfa" : "#6b7280",
            borderTop: activeTab === tab.key ? "2px solid #7c3aed" : "2px solid transparent",
            borderRadius:"8px 8px 0 0", transition:"all 0.15s",
          }}>{tab.label}</button>
        ))}
        <div style={{ flex:1 }}/>
        <div style={{ display:"flex", alignItems:"center", gap:8, paddingBottom:6 }}>
          <button onClick={toggleGlobalPlay} style={{
            width:32, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
            background: globalPlaying ? "#7c3aed" : "#1f2937", color:"#fff", fontSize:14,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow: globalPlaying ? "0 0 10px #7c3aed88" : "none", transition:"all 0.2s"
          }}>{globalPlaying ? "⏸" : "▶"}</button>
          <button style={{
            width:32, height:32, borderRadius:"50%", border:"none", cursor:"pointer",
            background:"#1f2937", color:"#fff", fontSize:14,
            display:"flex", alignItems:"center", justifyContent:"center"
          }} onClick={() => setTracks(ts => ts.map(t => ({ ...t, playing:false, recording:false })))}>⏹</button>
          <div style={{ display:"flex", alignItems:"center", gap:4, background:"#1f2937", borderRadius:8, padding:"4px 10px" }}>
            <span style={{ fontSize:11, color:"#6b7280" }}>BPM</span>
            <span style={{ fontSize:14, fontWeight:800, color:"#fff", fontFamily:"monospace" }}>{bpm}</span>
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>

        {/* TRACKS TAB */}
        {activeTab === "tracks" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflowY:"auto" }}>
            <div style={{
              background:"#111827", borderBottom:"1px solid #1f2937",
              padding:"8px 20px", display:"flex", alignItems:"center"
            }}>
              <span style={{ fontSize:12, color:"#4b5563" }}>
                Click a track number to expand and select its instrument
              </span>
              <div style={{ flex:1 }}/>
              <button onClick={addTrack} style={{
                padding:"5px 14px", borderRadius:10, border:"1px dashed #374151",
                background:"transparent", color:"#9ca3af", fontSize:12, fontWeight:700,
                fontFamily:"'Nunito', sans-serif", cursor:"pointer"
              }}>+ Add Track</button>
            </div>

            <div style={{ flex:1, padding:14, display:"flex", flexDirection:"column", gap:8, overflowY:"auto" }}>
              {tracks.map(track => (
                <TrackRow
                  key={track.id}
                  id={track.id}
                  track={track}
                  onUpdate={patch => updateTrack(track.id, patch)}
                  onRemove={() => removeTrack(track.id)}
                  globalPlaying={globalPlaying}
                />
              ))}
              {tracks.length === 0 && (
                <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
                  justifyContent:"center", color:"#374151", gap:8, padding:40 }}>
                  <div style={{ fontSize:40 }}>🎵</div>
                  <div style={{ fontFamily:"'Fredoka One', cursive", fontSize:18 }}>Add a track to get started!</div>
                </div>
              )}
              <div style={{ border:"1.5px dashed #1f2937", borderRadius:14,
                padding:"20px 16px", textAlign:"center", color:"#374151", marginTop:4 }}>
                <div style={{ fontSize:18, marginBottom:4 }}>🎵</div>
                <div style={{ fontSize:12 }}>Drop an audio file here</div>
              </div>
            </div>

            {/* Chord strip */}
            <div style={{ background:"#111827", borderTop:"1px solid #1f2937",
              padding:"10px 20px", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'Fredoka One', cursive", fontSize:13, color:"#9ca3af" }}>💡 Chord Ideas:</span>
              {tracks.filter(t => t.hasData && t.chords.length).flatMap(t => t.chords).slice(0,8).map((c,i) => (
                <div key={i} style={{ padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700,
                  background:"#1f2937", color:"#a78bfa", border:"1px solid #374151" }}>{c}</div>
              ))}
              {tracks.every(t => !t.hasData) && (
                <span style={{ fontSize:11, color:"#374151" }}>Record a track and tap ✨ find chords</span>
              )}
            </div>
          </div>
        )}

        {/* TUNER TAB */}
        {activeTab === "tuner" && (
          <div style={{ flex:1, overflowY:"auto", display:"flex", justifyContent:"center", padding:30 }}>
            <div style={{ maxWidth:500, width:"100%", display:"flex", flexDirection:"column", gap:16 }}>
              <SemicircleTuner noteInfo={noteInfo} micOn={micOn} onToggleMic={toggleMic}/>

              {/* String reference */}
              <div style={{ background:"#111827", borderRadius:14, padding:14, border:"1px solid #1f2937" }}>
                <div style={{ fontSize:11, color:"#4b5563", textTransform:"uppercase", letterSpacing:1,
                  fontWeight:700, marginBottom:8 }}>Standard Tuning Reference</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8 }}>
                  {[["E2",82.4],["A2",110],["D3",146.8],["G3",196],["B3",246.9],["E4",329.6]].map(([n,f]) => (
                    <div key={n} style={{ background:"#0d1117", borderRadius:10, padding:"8px 4px",
                      textAlign:"center", border:"1px solid #374151" }}>
                      <div style={{ fontFamily:"'Fredoka One', cursive", fontSize:20, color:"#a78bfa" }}>{n.slice(0,-1)}</div>
                      <div style={{ fontSize:9, color:"#4b5563", fontFamily:"monospace" }}>{n}</div>
                      <div style={{ fontSize:9, color:"#374151", fontFamily:"monospace" }}>{f}Hz</div>
                    </div>
                  ))}
                </div>
              </div>

              {noteInfo && (
                <div style={{ background:"#111827", borderRadius:14, padding:14, border:"1px solid #1f2937",
                  display:"flex", gap:20 }}>
                  <div>
                    <div style={{ fontSize:11, color:"#4b5563", marginBottom:2 }}>detected</div>
                    <div style={{ fontFamily:"monospace", fontSize:20, color:"#10b981", fontWeight:700 }}>{noteInfo.freq} Hz</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#4b5563", marginBottom:2 }}>target</div>
                    <div style={{ fontFamily:"monospace", fontSize:20, color:"#6b7280", fontWeight:700 }}>{noteInfo.targetFreq.toFixed(1)} Hz</div>
                  </div>
                  <div>
                    <div style={{ fontSize:11, color:"#4b5563", marginBottom:2 }}>note</div>
                    <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:20, color:"#a78bfa" }}>{noteInfo.note}{noteInfo.octave}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* LYRICS TAB */}
        {activeTab === "lyrics" && (
          <div style={{ flex:1, overflowY:"auto", display:"flex", justifyContent:"center", padding:20 }}>
            <div style={{ maxWidth:700, width:"100%", display:"flex", flexDirection:"column", gap:14 }}>

              {/* Header */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:16, color:"#9ca3af" }}>✍️ Lyric Writer</div>
                <span style={{ fontSize:11, color:"#4b5563", fontFamily:"monospace" }}>{wordCount}w · {lineCount}L</span>
              </div>

              {/* Song title */}
              <input className="title-input" placeholder="Untitled Song..."
                value={songTitle} onChange={e => setSongTitle(e.target.value)}/>

              {/* Section tabs */}
              <div>
                <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:6 }}>Sections</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:8 }}>
                  {sections.map(sec => (
                    <button key={sec.id}
                      className={`section-tab${activeSection === sec.id ? " active" : ""}`}
                      onClick={() => setActiveSection(sec.id)}>{sec.label}</button>
                  ))}
                </div>
                <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  {SECTION_TYPES.map(type => (
                    <button key={type} onClick={() => addSection(type)} style={{
                      padding:"3px 8px", borderRadius:6, border:"1px dashed #374151",
                      background:"transparent", color:"#4b5563", fontSize:11, cursor:"pointer",
                      fontFamily:"'Nunito',sans-serif", fontWeight:700
                    }}>+ {type}</button>
                  ))}
                </div>
              </div>

              {/* Active section editor */}
              {sections.filter(s => s.id === activeSection).map(sec => (
                <div key={sec.id} style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, background:"#7c3aed22",
                      borderRadius:8, padding:"4px 10px", border:"1px solid #7c3aed44" }}>
                      <span>🎵</span>
                      <input className="label-input" value={sec.label}
                        onChange={e => updateSectionLabel(sec.id, e.target.value)}/>
                    </div>
                    {sections.length > 1 && (
                      <button onClick={() => removeSection(sec.id)} style={{
                        background:"transparent", border:"none", color:"#4b5563", fontSize:16, cursor:"pointer"
                      }}>×</button>
                    )}
                  </div>
                  <textarea className="lyric-textarea" rows={10}
                    placeholder={`Write your ${sec.label.toLowerCase()} lyrics here...\n\nTip: press Enter for a new line`}
                    value={sec.text} onChange={e => updateSectionText(sec.id, e.target.value)}/>
                  <div style={{ fontSize:11, color:"#374151", textAlign:"right", fontFamily:"monospace" }}>
                    {sec.text.trim() ? sec.text.trim().split(/\s+/).length : 0} words ·{" "}
                    {sec.text.trim() ? sec.text.trim().split("\n").filter(Boolean).length : 0} lines
                  </div>
                </div>
              ))}

              {/* Full preview */}
              {sections.some(s => s.text.trim()) && (
                <div>
                  <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:8 }}>Full Song Preview</div>
                  <div style={{ background:"#111827", borderRadius:12, padding:16, display:"flex", flexDirection:"column", gap:12 }}>
                    {songTitle && <div style={{ fontFamily:"'Fredoka One',cursive", fontSize:16, color:"#a78bfa" }}>{songTitle}</div>}
                    {sections.filter(s => s.text.trim()).map(s => (
                      <div key={s.id}>
                        <div style={{ fontSize:10, color:"#7c3aed", fontWeight:700, textTransform:"uppercase", letterSpacing:1, marginBottom:3 }}>{s.label}</div>
                        <div style={{ fontSize:13, color:"#d1d5db", lineHeight:1.8, whiteSpace:"pre-wrap" }}>{s.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tips */}
              <div style={{ background:"#111827", borderRadius:12, padding:14, border:"1px solid #1f2937" }}>
                <div style={{ fontSize:10, color:"#4b5563", textTransform:"uppercase", letterSpacing:1, fontWeight:700, marginBottom:8 }}>💡 Writing Tips</div>
                {["Try AABB rhyme: lines 1&2 rhyme, 3&4 rhyme","Chorus = the part you repeat","Verse = tells the story","Bridge = a surprise twist","Count syllables to match the beat"].map((tip,i) => (
                  <div key={i} style={{ fontSize:12, color:"#6b7280", display:"flex", gap:6, marginBottom:4 }}>
                    <span style={{ color:"#7c3aed" }}>•</span> {tip}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* NOTATION TAB */}
        {activeTab === "notation" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ background:"#111827", borderBottom:"1px solid #1f2937",
              padding:"8px 20px", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontFamily:"'Fredoka One',cursive", fontSize:14, color:"#9ca3af" }}>🎼 Sheet Music Editor</span>
              <span style={{ fontSize:11, color:"#4b5563" }}>— powered by VexFlow</span>
            </div>
            <SheetMusicEditor/>
          </div>
        )}

        {/* IMPORT TAB */}
        {activeTab === "import" && (
          <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ background:"#111827", borderBottom:"1px solid #1f2937",
              padding:"8px 20px", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontFamily:"'Fredoka One',cursive", fontSize:14, color:"#9ca3af" }}>📂 Import Score</span>
              <span style={{ fontSize:11, color:"#4b5563" }}>— MusicXML via OpenSheetMusicDisplay</span>
            </div>
            <SheetImporter/>
          </div>
        )}

      </div>

    </div>
  );
}