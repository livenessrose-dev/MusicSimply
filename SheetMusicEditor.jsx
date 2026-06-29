import { useState, useEffect, useRef, useCallback } from "react";
 
// ── Key signatures ─────────────────────────────────────────────────────────────
const KEY_SIGNATURES = {
  "C Major":  { vexKey: "C"  },
  "G Major":  { vexKey: "G"  },
  "D Major":  { vexKey: "D"  },
  "A Major":  { vexKey: "A"  },
  "E Major":  { vexKey: "E"  },
  "F Major":  { vexKey: "F"  },
  "Bb Major": { vexKey: "Bb" },
  "Eb Major": { vexKey: "Eb" },
  "A Minor":  { vexKey: "Am" },
  "D Minor":  { vexKey: "Dm" },
  "E Minor":  { vexKey: "Em" },
};
 
const DURATION_OPTIONS = [
  { key:"w",  label:"Whole",     symbol:"𝅝",  beats:4    },
  { key:"h",  label:"Half",      symbol:"𝅗𝅥",  beats:2    },
  { key:"q",  label:"Quarter",   symbol:"♩",  beats:1    },
  { key:"8",  label:"Eighth",    symbol:"♪",  beats:0.5  },
  { key:"16", label:"Sixteenth", symbol:"𝅘𝅥𝅯",  beats:0.25 },
];
 
// ── Pitch maps: staff Y-position → VexFlow pitch string ───────────────────────
// Each entry is [noteWithOctave, staffLineOffset] where 0 = middle line
// Treble: lines are E4,G4,B4,D5,F5 — spaces are F4,A4,C5,E5
// We store pitches top→bottom as they appear on staff
const TREBLE_STAFF_PITCHES = [
  "A/5","G/5","F/5","E/5","D/5","C/5","B/4","A/4","G/4","F/4","E/4","D/4","C/4","B/3","A/3"
];
const BASS_STAFF_PITCHES = [
  "C/4","B/3","A/3","G/3","F/3","E/3","D/3","C/3","B/2","A/2","G/2","F/2","E/2","D/2","C/2"
];
 
const DEFAULT_TREBLE = [
  { pitch:"C/4", duration:"q" },
  { pitch:"E/4", duration:"q" },
  { pitch:"G/4", duration:"q" },
  { pitch:"C/5", duration:"h" },
];
const DEFAULT_BASS = [
  { pitch:"C/3", duration:"w" },
];
 
// ── Layout constants (must match renderScore) ─────────────────────────────────
const STAVE_W    = 340;
const STAVE_PAD  = 70;
const TREBLE_Y   = 40;   // top of treble stave relative to row
const BASS_Y     = 145;  // top of bass stave relative to row
const SYSTEM_H   = 230;
const HEADER_Y   = 80;   // where row 0 starts in SVG
const STAFF_LINE_H = 10; // pixels between staff lines (VexFlow default ~10)
const STAFF_TOP_OFFSET = 35; // pixels from stave top to first (top) line
 
export default function SheetMusicEditor() {
  const [title,        setTitle]        = useState("");
  const [composer,     setComposer]     = useState("");
  const [lyricist,     setLyricist]     = useState("");
  const [tempo,        setTempo]        = useState(120);
  const [keySignature, setKeySignature] = useState("C Major");
  const [timeSig,      setTimeSig]      = useState("4/4");
  const [activeStaff,  setActiveStaff]  = useState("treble");
  const [selectedDur,  setSelectedDur]  = useState("q");
  const [trebleNotes,  setTrebleNotes]  = useState(DEFAULT_TREBLE);
  const [bassNotes,    setBassNotes]    = useState(DEFAULT_BASS);
  const [status,       setStatus]       = useState("");
  const [hoverPitch,   setHoverPitch]   = useState(null); // ghost note on hover
  const [hoverPos,     setHoverPos]     = useState(null); // {x,y} in SVG coords
 
  const scoreRef    = useRef(null);
  const overlayRef  = useRef(null);
  const svgSizeRef  = useRef({ w:800, h:400 }); // track SVG dimensions
 
  // ── Re-render score whenever notes or metadata change ─────────────────────
  useEffect(() => { renderScore(); }, [
    trebleNotes, bassNotes, keySignature, timeSig, title, composer, lyricist, tempo
  ]);
 
  // ── Main VexFlow render ────────────────────────────────────────────────────
  async function renderScore() {
    if (!scoreRef.current) return;
    try {
      const VF = await import("vexflow");
      const {
        Renderer, Stave, StaveNote, Voice, Formatter,
        Accidental, StaveConnector, Beam,
      } = VF.default?.Flow ?? VF.Flow ?? VF;
 
      const container = scoreRef.current;
      container.innerHTML = "";
 
      const [beatsPerBar, beatUnit] = timeSig.split("/").map(Number);
      const durBeats = { w:4, h:2, q:1, "8":0.5, "16":0.25 };
 
      function splitMeasures(notes) {
        const measures = [];
        let bar = [], beats = 0;
        for (const n of notes) {
          const b = durBeats[n.duration] ?? 1;
          if (beats + b > beatsPerBar && bar.length) {
            measures.push(bar); bar = []; beats = 0;
          }
          bar.push(n); beats += b;
        }
        if (bar.length) measures.push(bar);
        if (!measures.length) measures.push([]);
        return measures;
      }
 
      const trebleMeasures = splitMeasures(trebleNotes);
      const bassMeasures   = splitMeasures(bassNotes);
      const numMeasures    = Math.max(trebleMeasures.length, bassMeasures.length);
      const containerW     = container.clientWidth || 800;
      const measPerRow     = Math.max(1, Math.floor((containerW - STAVE_PAD) / STAVE_W));
      const numRows        = Math.ceil(numMeasures / measPerRow);
      const svgW           = STAVE_PAD + Math.min(numMeasures, measPerRow) * STAVE_W + 40;
      const svgH           = HEADER_Y + numRows * SYSTEM_H + 30;
 
      svgSizeRef.current = { w: svgW, h: svgH };
 
      const renderer = new Renderer(container, Renderer.Backends.SVG);
      renderer.resize(svgW, svgH);
      const ctx = renderer.getContext();
      const vexKey = KEY_SIGNATURES[keySignature]?.vexKey ?? "C";
 
      // Title / composer / lyricist / tempo
      const svg = container.querySelector("svg");
      const addText = (x, y, text, size, anchor, color="#111") => {
        const t = document.createElementNS("http://www.w3.org/2000/svg","text");
        t.setAttribute("x", x); t.setAttribute("y", y);
        t.setAttribute("text-anchor", anchor);
        t.setAttribute("font-size", size);
        t.setAttribute("font-family","Georgia, serif");
        t.setAttribute("fill", color);
        t.textContent = text;
        svg.appendChild(t);
      };
      if (title)    addText(svgW/2, 30, title,    22, "middle");
      if (composer) addText(svgW-16, 52, composer, 12, "end", "#444");
      if (lyricist) addText(16, 52, lyricist,      12, "start","#444");
      if (tempo)    addText(STAVE_PAD+4, 74, `♩= ${tempo}`, 12, "start","#222");
 
      for (let row = 0; row < numRows; row++) {
        const rowY   = HEADER_Y + row * SYSTEM_H;
        const startM = row * measPerRow;
        const endM   = Math.min(startM + measPerRow, numMeasures);
 
        for (let mi = startM; mi < endM; mi++) {
          const isFirst = mi === startM;
          const x = STAVE_PAD + (mi - startM) * STAVE_W;
 
          const trebleStave = new Stave(x, rowY + TREBLE_Y, STAVE_W);
          const bassStave   = new Stave(x, rowY + BASS_Y,   STAVE_W);
 
          if (isFirst && row === 0) {
            trebleStave.addClef("treble").addKeySignature(vexKey).addTimeSignature(timeSig);
            bassStave  .addClef("bass")  .addKeySignature(vexKey).addTimeSignature(timeSig);
          } else if (isFirst) {
            trebleStave.addClef("treble").addKeySignature(vexKey);
            bassStave  .addClef("bass")  .addKeySignature(vexKey);
          }
 
          trebleStave.setContext(ctx).draw();
          bassStave  .setContext(ctx).draw();
 
          if (isFirst) {
            new StaveConnector(trebleStave, bassStave)
              .setType(StaveConnector.type.BRACE).setContext(ctx).draw();
            new StaveConnector(trebleStave, bassStave)
              .setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
          }
 
          const buildVFNotes = (noteArr, clef) =>
            noteArr.map(n => {
              const sn = new StaveNote({
                clef, keys:[n.pitch],
                duration: n.duration + (n.rest ? "r" : ""),
              });
              if (!n.rest && n.pitch.includes("#")) sn.addModifier(new Accidental("#"), 0);
              if (!n.rest && n.pitch.includes("b")) sn.addModifier(new Accidental("b"), 0);
              return sn;
            });
 
          const drawVoice = (notes, stave, clef) => {
            if (!notes.length) return;
            try {
              const vfNotes = buildVFNotes(notes, clef);
              const voice   = new Voice({ num_beats:beatsPerBar, beat_value:beatUnit })
                .setStrict(false).addTickables(vfNotes);
              const beams = Beam.generateBeams(vfNotes);
              new Formatter().joinVoices([voice]).format([voice], STAVE_W - 30);
              voice.draw(ctx, stave);
              beams.forEach(b => b.setContext(ctx).draw());
            } catch {}
          };
 
          drawVoice(trebleMeasures[mi] || [], trebleStave, "treble");
          drawVoice(bassMeasures[mi]   || [], bassStave,   "bass");
        }
 
        // End barline
        const lastX = STAVE_PAD + (Math.min(endM - startM, measPerRow) - 1) * STAVE_W;
        const ft = new Stave(lastX, rowY + TREBLE_Y, STAVE_W);
        const fb = new Stave(lastX, rowY + BASS_Y,   STAVE_W);
        new StaveConnector(ft, fb)
          .setType(row === numRows-1
            ? StaveConnector.type.BOLD_DOUBLE_RIGHT
            : StaveConnector.type.SINGLE_RIGHT)
          .setContext(ctx).draw();
      }
      setStatus("");
    } catch (e) {
      setStatus("Render error: " + e.message);
    }
  }
 
  // ── Map a click/hover Y position to a pitch string ────────────────────────
  // Each staff has 5 lines, 4 spaces inside, plus ledger lines above/below.
  // We quantize the Y to the nearest half-space (each line or space = STAFF_LINE_H/2 px).
  function yToPitch(svgY, rowY, staffType) {
    const staffTopY = rowY + (staffType === "treble" ? TREBLE_Y : BASS_Y) + STAFF_TOP_OFFSET;
    // distance from top line of staff, in units of half-line-height
    const halfSteps = Math.round((svgY - staffTopY) / (STAFF_LINE_H / 2));
    const pitchList = staffType === "treble" ? TREBLE_STAFF_PITCHES : BASS_STAFF_PITCHES;
    // index 0 = top of treble (A5), increases downward
    // offset by 2 to account for ledger lines above top line
    const idx = Math.max(0, Math.min(pitchList.length - 1, halfSteps + 2));
    return pitchList[idx];
  }
 
  // ── Determine which row and staff was clicked ─────────────────────────────
  function svgCoordsToStaffInfo(e) {
    const container = scoreRef.current;
    if (!container) return null;
    const svg = container.querySelector("svg");
    if (!svg) return null;
 
    const rect = svg.getBoundingClientRect();
    const scaleX = svgSizeRef.current.w / rect.width;
    const scaleY = svgSizeRef.current.h / rect.height;
    const svgX = (e.clientX - rect.left) * scaleX;
    const svgY = (e.clientY - rect.top)  * scaleY;
 
    const [beatsPerBar] = timeSig.split("/").map(Number);
    const durBeats = { w:4, h:2, q:1, "8":0.5, "16":0.25 };
    const containerW = container.clientWidth || 800;
    const measPerRow = Math.max(1, Math.floor((containerW - STAVE_PAD) / STAVE_W));
 
    // Which row?
    const relY = svgY - HEADER_Y;
    const row  = Math.floor(relY / SYSTEM_H);
    if (row < 0) return null;
    const rowY = HEADER_Y + row * SYSTEM_H;
 
    // Which staff?
    const trebleTop = rowY + TREBLE_Y;
    const trebleBot = trebleTop + 80;
    const bassTop   = rowY + BASS_Y;
    const bassBot   = bassTop + 80;
 
    let staffType = null;
    if (svgY >= trebleTop - 30 && svgY <= trebleBot + 30) staffType = "treble";
    else if (svgY >= bassTop - 30 && svgY <= bassBot + 30) staffType = "bass";
    if (!staffType) return null;
 
    const pitch = yToPitch(svgY, rowY, staffType);
    return { svgX, svgY, staffType, pitch, rowY };
  }
 
  // ── Handle click on SVG → insert note ────────────────────────────────────
  function handleScoreClick(e) {
    const info = svgCoordsToStaffInfo(e);
    if (!info) return;
 
    const note = { pitch: info.pitch, duration: selectedDur, rest: false };
    if (info.staffType === "treble") {
      setTrebleNotes(n => [...n, note]);
      setActiveStaff("treble");
    } else {
      setBassNotes(n => [...n, note]);
      setActiveStaff("bass");
    }
  }
 
  // ── Handle hover → show ghost note ───────────────────────────────────────
  function handleScoreHover(e) {
    const info = svgCoordsToStaffInfo(e);
    if (!info) { setHoverPitch(null); setHoverPos(null); return; }
    setHoverPitch(info.pitch);
    setHoverPos({ x: info.svgX, y: info.svgY, staff: info.staffType });
    setActiveStaff(info.staffType);
  }
 
  function handleScoreLeave() {
    setHoverPitch(null);
    setHoverPos(null);
  }
 
  // ── Note entry helpers ────────────────────────────────────────────────────
  function addRest() {
    const rest = { pitch: activeStaff==="treble" ? "B/4" : "D/3", duration:selectedDur, rest:true };
    if (activeStaff==="treble") setTrebleNotes(n => [...n, rest]);
    else setBassNotes(n => [...n, rest]);
  }
  function undoLast() {
    if (activeStaff==="treble") setTrebleNotes(n => n.slice(0,-1));
    else setBassNotes(n => n.slice(0,-1));
  }
  function clearStaff() {
    if (activeStaff==="treble") setTrebleNotes([]);
    else setBassNotes([]);
  }
 
  // ── Styles ────────────────────────────────────────────────────────────────
  const accent      = "#7c3aed";
  const accentLight = "#a78bfa";
  const bg          = "#0a0e1a";
  const panel       = "#111827";
  const border      = "#1f2937";
 
  const selectedDurSymbol = DURATION_OPTIONS.find(d => d.key === selectedDur)?.symbol ?? "♩";
 
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column",
      background:bg, color:"#e5e7eb", fontFamily:"'Nunito',sans-serif",
      overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka+One&family=Nunito:wght@400;600;700;800&display=swap');
        * { box-sizing:border-box; }
        .meta-input { background:transparent; border:none; border-bottom:1.5px solid #1f2937;
          color:#e5e7eb; font-family:'Nunito',sans-serif; font-size:13px; padding:4px 0;
          width:100%; transition:border-color 0.2s; }
        .meta-input:focus { outline:none; border-bottom-color:#7c3aed; }
        .meta-input::placeholder { color:#374151; }
        .score-svg-wrap { position:relative; cursor:crosshair; }
        .score-svg-wrap svg { display:block; }
      `}</style>
 
      {/* ── Metadata bar ── */}
      <div style={{ background:panel, borderBottom:`1px solid ${border}`,
        padding:"10px 20px", display:"flex", gap:14, flexWrap:"wrap", alignItems:"flex-end" }}>
        <div style={{ flex:2, minWidth:130 }}>
          <div style={{ fontSize:9, color:"#4b5563", textTransform:"uppercase",
            letterSpacing:1, fontWeight:700, marginBottom:2 }}>Title</div>
          <input className="meta-input" placeholder="(Title)"
            value={title} onChange={e => setTitle(e.target.value)}/>
        </div>
        <div style={{ flex:1, minWidth:100 }}>
          <div style={{ fontSize:9, color:"#4b5563", textTransform:"uppercase",
            letterSpacing:1, fontWeight:700, marginBottom:2 }}>Composer</div>
          <input className="meta-input" placeholder="(Composer)"
            value={composer} onChange={e => setComposer(e.target.value)}/>
        </div>
        <div style={{ flex:1, minWidth:100 }}>
          <div style={{ fontSize:9, color:"#4b5563", textTransform:"uppercase",
            letterSpacing:1, fontWeight:700, marginBottom:2 }}>Lyricist</div>
          <input className="meta-input" placeholder="(Lyricist)"
            value={lyricist} onChange={e => setLyricist(e.target.value)}/>
        </div>
        <div style={{ minWidth:68 }}>
          <div style={{ fontSize:9, color:"#4b5563", textTransform:"uppercase",
            letterSpacing:1, fontWeight:700, marginBottom:2 }}>Tempo</div>
          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
            <span style={{ fontSize:11, color:"#6b7280" }}>♩=</span>
            <input type="number" className="meta-input" style={{ width:48 }}
              value={tempo} min={40} max={240}
              onChange={e => setTempo(Number(e.target.value))}/>
          </div>
        </div>
      </div>
 
      {/* ── Toolbar ── */}
      <div style={{ background:panel, borderBottom:`1px solid ${border}`,
        padding:"8px 20px", display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
 
        {/* Key */}
        <div style={{ display:"flex", gap:5, alignItems:"center" }}>
          <span style={{ fontSize:10, color:"#4b5563", fontWeight:700,
            textTransform:"uppercase", letterSpacing:1 }}>Key</span>
          <select value={keySignature} onChange={e => setKeySignature(e.target.value)}
            style={{ background:"#1f2937", border:`1px solid ${border}`, color:"#e5e7eb",
              borderRadius:7, padding:"3px 7px", fontSize:12, cursor:"pointer" }}>
            {Object.keys(KEY_SIGNATURES).map(k => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
 
        {/* Time */}
        <div style={{ display:"flex", gap:3, alignItems:"center" }}>
          <span style={{ fontSize:10, color:"#4b5563", fontWeight:700,
            textTransform:"uppercase", letterSpacing:1 }}>Time</span>
          {["4/4","3/4","2/4","6/8","2/2"].map(t => (
            <button key={t} onClick={() => setTimeSig(t)} style={{
              padding:"3px 9px", borderRadius:7,
              border:`1.5px solid ${timeSig===t ? accent : border}`,
              background: timeSig===t ? accent+"22" : "transparent",
              color: timeSig===t ? accentLight : "#6b7280",
              fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"monospace"
            }}>{t}</button>
          ))}
        </div>
 
        {/* Duration — selecting this changes what gets entered on click */}
        <div style={{ display:"flex", gap:3, alignItems:"center" }}>
          <span style={{ fontSize:10, color:"#4b5563", fontWeight:700,
            textTransform:"uppercase", letterSpacing:1 }}>Duration</span>
          {DURATION_OPTIONS.map(d => (
            <button key={d.key} onClick={() => setSelectedDur(d.key)}
              title={d.label} style={{
                padding:"3px 9px", borderRadius:7,
                border:`1.5px solid ${selectedDur===d.key ? "#fb923c" : border}`,
                background: selectedDur===d.key ? "#fb923c22" : "transparent",
                color: selectedDur===d.key ? "#fb923c" : "#6b7280",
                fontSize:18, cursor:"pointer", lineHeight:1
              }}>{d.symbol}</button>
          ))}
        </div>
 
        <div style={{ flex:1 }}/>
 
        {/* Active staff indicator */}
        <div style={{ display:"flex", gap:3 }}>
          {[["treble","𝄞"],["bass","𝄢"]].map(([s,sym]) => (
            <button key={s} onClick={() => setActiveStaff(s)} style={{
              padding:"3px 11px", borderRadius:7,
              border:`1.5px solid ${activeStaff===s ? "#f472b6" : border}`,
              background: activeStaff===s ? "#f472b622" : "transparent",
              color: activeStaff===s ? "#f472b6" : "#6b7280",
              fontSize:13, fontWeight:700, cursor:"pointer"
            }}>{sym} {s.charAt(0).toUpperCase()+s.slice(1)}</button>
          ))}
        </div>
 
        <button onClick={addRest} style={{
          padding:"3px 10px", borderRadius:7, border:`1px solid ${border}`,
          background:"transparent", color:"#9ca3af", fontSize:12, fontWeight:700, cursor:"pointer"
        }}>𝄽 Rest</button>
        <button onClick={undoLast} style={{
          padding:"3px 10px", borderRadius:7, border:`1px solid ${border}`,
          background:"transparent", color:"#f87171", fontSize:12, fontWeight:700, cursor:"pointer"
        }}>⌫ Undo</button>
        <button onClick={clearStaff} style={{
          padding:"3px 10px", borderRadius:7, border:`1px solid ${border}`,
          background:"transparent", color:"#6b7280", fontSize:12, fontWeight:700, cursor:"pointer"
        }}>🗑 Clear</button>
      </div>
 
      {/* ── Hint bar ── */}
      <div style={{ background:"#0d1117", borderBottom:`1px solid ${border}`,
        padding:"5px 20px", display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:11, color:"#4b5563" }}>
          Select a duration above, then
          <strong style={{ color:"#fb923c" }}> click anywhere on the staff </strong>
          to place a note.
          {hoverPitch && (
            <span style={{ color:"#a78bfa", marginLeft:8 }}>
              → {hoverPitch} {selectedDurSymbol}
            </span>
          )}
        </span>
      </div>
 
      {/* ── Score area ── */}
      <div style={{ flex:1, overflowY:"auto", overflowX:"auto", padding:16 }}>
        {status && (
          <div style={{ fontSize:11, color:"#f59e0b", marginBottom:8,
            background:"#1f1500", padding:"6px 12px", borderRadius:8 }}>
            {status}
          </div>
        )}
 
        {/* White score canvas with click/hover handlers */}
        <div style={{ background:"#fff", borderRadius:14, padding:"16px",
          minHeight:280, overflowX:"auto", position:"relative" }}>
 
          {/* Transparent overlay to capture mouse events */}
          <div
            className="score-svg-wrap"
            onClick={handleScoreClick}
            onMouseMove={handleScoreHover}
            onMouseLeave={handleScoreLeave}
            style={{ position:"relative", userSelect:"none" }}>
 
            {/* VexFlow renders here */}
            <div ref={scoreRef} style={{ minHeight:200 }}/>
 
            {/* Ghost note preview on hover */}
            {hoverPos && hoverPitch && (() => {
              const { w, h } = svgSizeRef.current;
              const container = scoreRef.current;
              const svg = container?.querySelector("svg");
              if (!svg) return null;
              const rect = svg.getBoundingClientRect();
              const scaleX = rect.width  / w;
              const scaleY = rect.height / h;
              const px = hoverPos.x * scaleX;
              const py = hoverPos.y * scaleY;
              return (
                <div style={{
                  position:"absolute",
                  left: px - 22,
                  top:  py - 22,
                  pointerEvents:"none",
                  background:"rgba(124,58,237,0.15)",
                  border:"2px solid #7c3aed",
                  borderRadius:"50%",
                  width:44, height:44,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:11, fontWeight:700, color:"#7c3aed",
                  fontFamily:"monospace",
                }}>
                  {hoverPitch.split("/")[0]}
                  <span style={{ fontSize:8, opacity:0.7 }}>{hoverPitch.split("/")[1]}</span>
                </div>
              );
            })()}
          </div>
        </div>
 
        {/* Summary strip */}
        <div style={{ marginTop:12, display:"flex", gap:10, flexWrap:"wrap" }}>
          {[
            ["𝄞 Treble", trebleNotes.length+" notes", accentLight],
            ["𝄢 Bass",   bassNotes.length+" notes",   "#f472b6" ],
            ["Key",      keySignature,                 "#fb923c" ],
            ["Time",     timeSig,                      "#4ade80" ],
          ].map(([label, val, color]) => (
            <div key={label} style={{ background:panel, borderRadius:9,
              padding:"6px 12px", border:`1px solid ${border}`, fontSize:12 }}>
              <span style={{ color:"#4b5563" }}>{label}: </span>
              <span style={{ color, fontWeight:700 }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}