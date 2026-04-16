/**
 * components/Tracks/RecordingTracks.jsx
 *
 * Manages a list of mic-recording tracks.  Each track can:
 *   - Start / stop recording via MediaRecorder
 *   - Display an animated waveform while recording, then a real waveform after
 *   - Play back the recorded audio
 *   - Auto-save finished recordings to global TrackContext
 *
 * Props:
 *   audioCtxRef — ref to AudioContext (used to decode + draw waveform)
 */

import { useState, useRef } from "react";
import { useTracks } from "../../context/TrackContext";

const INST_COLORS = { Piano:"#a78bfa", Guitar:"#fb923c", Voice:"#f472b6" };

function makeTrack(id) {
  return { id, label:`Track ${id}`, instrument:"Piano", recording:false, hasData:false, muted:false, audioUrl:null };
}

export default function RecordingTracks({ audioCtxRef }) {
  const { addTrack } = useTracks();

  const [tracks,  setTracks]  = useState([makeTrack(1)]);
  const [nextId,  setNextId]  = useState(2);

  // Refs keyed by track id
  const audioRefs  = useRef({});
  const mrRefs     = useRef({});
  const chunksRefs = useRef({});
  const canvasRefs = useRef({});

  // ── Track list helpers ────────────────────────────────────────────────────
  function addLocalTrack() {
    setTracks(ts => [...ts, makeTrack(nextId)]);
    setNextId(n => n + 1);
  }
  function upd(id, patch) { setTracks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t)); }
  function rem(id)        { setTracks(ts => ts.filter(t => t.id !== id)); }

  // ── Recording ─────────────────────────────────────────────────────────────
  async function startRec(id) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRefs.current[id] = [];

      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRefs.current[id].push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunksRefs.current[id], { type:"audio/webm" });
        const url  = URL.createObjectURL(blob);
        upd(id, { recording: false, hasData: true, audioUrl: url });
        stream.getTracks().forEach(t => t.stop());

        // Save to global Timeline
        addTrack({ type:"mic", label:"Mic Recording", audioUrl: url, duration: 0 });

        // Decode + draw waveform
        const ctx = audioCtxRef.current;
        if (ctx && canvasRefs.current[id]) {
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          drawWaveform(audioBuffer.getChannelData(0), canvasRefs.current[id]);
        }
      };

      mr.start();
      mrRefs.current[id] = mr;
      upd(id, { recording: true, hasData: false });
    } catch {
      alert("Mic access is needed to record.");
    }
  }

  function stopRec(id) {
    const mr = mrRefs.current[id];
    if (mr && mr.state !== "inactive") mr.stop();
  }

  function drawWaveform(data, canvas) {
    const c = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    c.strokeStyle = "#a78bfa";
    c.lineWidth   = 1.2;
    c.beginPath();
    const step = Math.ceil(data.length / W);
    for (let i = 0; i < W; i++) {
      let mn = 1, mx = -1;
      for (let j = 0; j < step; j++) {
        const s = data[i * step + j] || 0;
        if (s < mn) mn = s;
        if (s > mx) mx = s;
      }
      c.moveTo(i, (1 + mn) / 2 * H);
      c.lineTo(i, (1 + mx) / 2 * H);
    }
    c.stroke();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>

      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontFamily:"'Fredoka One',cursive",fontSize:15,color:"#9ca3af"}}>🎙 Recording Tracks</span>
        <div style={{flex:1}}/>
        <button onClick={addLocalTrack} style={{padding:"5px 12px",borderRadius:8,border:"1px dashed #374151",background:"transparent",color:"#9ca3af",fontSize:12,cursor:"pointer"}}>
          + Add Track
        </button>
      </div>

      {tracks.map(track => {
        const col = INST_COLORS[track.instrument] || "#a78bfa";
        return (
          <div key={track.id} style={{
            background: track.recording ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.025)",
            border: `1px solid ${track.recording ? "#ef444444" : "#ffffff12"}`,
            borderRadius:12, padding:"10px 12px", display:"flex", flexDirection:"column", gap:7,
          }}>
            {/* Top row: label + instrument + M/× */}
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input
                value={track.label}
                onChange={e => upd(track.id, { label: e.target.value })}
                style={{background:"transparent",border:"1px solid #374151",borderRadius:6,padding:"2px 8px",color:"#e5e7eb",fontSize:12,width:110}}
              />
              <div style={{display:"flex",gap:4}}>
                {["Piano","Guitar","Voice"].map(inst => (
                  <button key={inst} onClick={() => upd(track.id, { instrument: inst })} style={{
                    padding:"2px 7px", borderRadius:6,
                    border:`1px solid ${track.instrument===inst ? col : "#374151"}`,
                    background: track.instrument===inst ? col+"22" : "transparent",
                    color: track.instrument===inst ? col : "#6b7280",
                    fontSize:10, cursor:"pointer",
                  }}>{inst}</button>
                ))}
              </div>
              <div style={{flex:1}}/>
              <button onClick={() => upd(track.id, { muted: !track.muted })} style={{width:24,height:24,borderRadius:5,border:"1px solid #374151",background:track.muted?"#374151":"transparent",color:track.muted?"#f59e0b":"#6b7280",fontSize:9,fontWeight:800,cursor:"pointer"}}>M</button>
              <button onClick={() => rem(track.id)}                          style={{width:24,height:24,borderRadius:5,border:"1px solid #374151",background:"transparent",color:"#6b7280",fontSize:12,cursor:"pointer"}}>×</button>
            </div>

            {/* Transport + waveform row */}
            <div style={{display:"flex",alignItems:"center",gap:8,background:"#111827",borderRadius:8,padding:"5px 10px"}}>
              {/* Record button */}
              <button
                onClick={() => track.recording ? stopRec(track.id) : startRec(track.id)}
                style={{width:28,height:28,borderRadius:"50%",border:"none",cursor:"pointer",background:track.recording?"#ef4444":"#374151",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",animation:track.recording?"recPulse 1s infinite":"none"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:"#fff"}}/>
              </button>

              {/* Play button (only shown after recording) */}
              {track.audioUrl && (
                <button
                  onClick={() => { const a = audioRefs.current[track.id]; if (a) a.paused ? a.play() : a.pause(); }}
                  style={{width:28,height:28,borderRadius:"50%",border:"none",cursor:"pointer",background:col+"44",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{width:0,height:0,borderLeft:"9px solid",borderTop:"5px solid transparent",borderBottom:"5px solid transparent",borderLeftColor:"#fff",marginLeft:2}}/>
                </button>
              )}

              {/* Waveform area */}
              <div style={{flex:1,height:30,position:"relative"}}>
                {track.hasData ? (
                  <canvas
                    ref={el => canvasRefs.current[track.id] = el}
                    width={300} height={30}
                    style={{width:"100%",height:"100%"}}/>
                ) : (
                  <div style={{display:"flex",gap:1.5,alignItems:"center",height:"100%"}}>
                    {Array(30).fill(0).map((_,i) => (
                      <div key={i} style={{
                        width:3, borderRadius:1.5, flexShrink:0,
                        height: track.recording ? `${4 + Math.random() * 20}px` : "3px",
                        background: col,
                        opacity: track.recording ? 0.8 : 0.2,
                      }}/>
                    ))}
                  </div>
                )}
              </div>

              {/* Status label */}
              <div style={{fontSize:10,color:track.recording?"#ef4444":track.hasData?col:"#374151",minWidth:42,textAlign:"right",fontFamily:"monospace",fontWeight:700}}>
                {track.recording ? "● REC" : track.hasData ? "READY" : "EMPTY"}
              </div>
            </div>

            {/* Hidden audio element */}
            {track.audioUrl && (
              <audio ref={el => audioRefs.current[track.id] = el} src={track.audioUrl} style={{display:"none"}}/>
            )}
          </div>
        );
      })}

      <div style={{background:"#111827",borderRadius:10,padding:12,fontSize:11,color:"#6b7280",lineHeight:1.6}}>
        💡 Press <span style={{color:"#ef4444"}}>●</span> to record from mic.
        Recordings auto-save to the <span style={{color:"#a78bfa"}}>Timeline</span> tab.
      </div>
    </div>
  );
}
