/**
 * components/Tuner/SemicircleTuner.jsx
 *
 * Props:
 *   noteInfo   — from useMic() — { note, octave, cents, freq } | null
 *   micOn      — boolean
 *   onToggleMic — () => void
 */

import { GUITAR_STRINGS } from "../../constants";

export default function SemicircleTuner({ noteInfo, micOn, onToggleMic }) {
  const cx = 150, cy = 145, r = 110;
  const labels = [-50,-40,-30,-20,-10,0,10,20,30,40,50];

  const cToA  = c => Math.PI + ((c + 50) / 100) * Math.PI;
  const polar = (a, rad) => ({ x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) });

  const na  = noteInfo ? cToA(Math.max(-50, Math.min(50, noteInfo.cents))) : cToA(0);
  const tip = polar(na, r - 10);
  const b1  = polar(na + Math.PI / 2, 5);
  const b2  = polar(na - Math.PI / 2, 5);

  const col = !noteInfo           ? "#4b5563"
    : Math.abs(noteInfo.cents) <= 10  ? "#4ade80"
    : Math.abs(noteInfo.cents) <= 25  ? "#facc15"
    : "#f87171";

  const aS = polar(Math.PI,     r);
  const aE = polar(2 * Math.PI, r);
  const gS = polar(cToA(-10),   r);
  const gE = polar(cToA(10),    r);

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
      {/* Note name */}
      <div style={{textAlign:"center"}}>
        <div style={{fontFamily:"'Fredoka One',cursive",fontSize:40,color:noteInfo?col:"#6b7280",lineHeight:1}}>
          {noteInfo ? `${noteInfo.note}${noteInfo.octave}` : "—"}
        </div>
        <div style={{fontSize:10,color:"#9ca3af"}}>
          {noteInfo ? `${noteInfo.freq} Hz` : "no signal"}
        </div>
      </div>

      {/* Arc meter */}
      <svg width={300} height={158} style={{overflow:"visible"}}>
        {/* Track */}
        <path d={`M${aS.x} ${aS.y} A${r} ${r} 0 0 1 ${aE.x} ${aE.y}`}
          fill="none" stroke="#1f2937" strokeWidth={20} strokeLinecap="round"/>
        {/* Green zone */}
        <path d={`M${gS.x} ${gS.y} A${r} ${r} 0 0 1 ${gE.x} ${gE.y}`}
          fill="none" stroke="#4ade80" strokeWidth={6} strokeLinecap="round" opacity={0.3}/>
        {/* Colored overlay */}
        <path d={`M${aS.x} ${aS.y} A${r} ${r} 0 0 1 ${aE.x} ${aE.y}`}
          fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" opacity={noteInfo?0.5:0.1}/>

        {/* Tick marks */}
        {labels.map(c => {
          const a   = cToA(c);
          const out = polar(a, r + 4);
          const inn = polar(a, r - (c % 10 === 0 ? 14 : 8));
          const lp  = polar(a, r + 16);
          return (
            <g key={c}>
              <line x1={out.x} y1={out.y} x2={inn.x} y2={inn.y}
                stroke={c === 0 ? "#10b981" : "#374151"}
                strokeWidth={c % 10 === 0 ? 2 : 1}/>
              {c % 10 === 0 && (
                <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={8} fill="#6b7280" fontFamily="monospace">
                  {c > 0 ? `+${c}` : c}
                </text>
              )}
            </g>
          );
        })}

        {/* Needle */}
        <polygon
          points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${cx},${cy} ${b2.x},${b2.y}`}
          fill={col} opacity={noteInfo ? 0.95 : 0.3}
          style={{transition:"all 0.08s ease-out"}}/>
        <circle cx={cx} cy={cy} r={6} fill={col}/>
        <circle cx={cx} cy={cy} r={2.5} fill="#111827"/>

        {/* Cents label */}
        <text x={cx} y={cy - 18} textAnchor="middle" fontSize={11}
          fill={col} fontFamily="monospace" fontWeight="bold">
          {noteInfo ? (noteInfo.cents > 0 ? `+${noteInfo.cents}¢` : `${noteInfo.cents}¢`) : "0¢"}
        </text>
      </svg>

      {/* Status */}
      <div style={{fontSize:12,fontWeight:700,color:col,minHeight:18}}>
        {noteInfo && (
          Math.abs(noteInfo.cents) <= 10 ? "✅ In Tune!"
          : noteInfo.cents > 0           ? "🔼 Sharp"
          :                                "🔽 Flat"
        )}
      </div>

      {/* Mic button */}
      <button onClick={onToggleMic} style={{
        padding:"7px 18px", borderRadius:10, border:"none", cursor:"pointer",
        fontFamily:"'Fredoka One',cursive", fontSize:13,
        background: micOn ? "#ef4444" : "#7c3aed", color:"#fff",
      }}>
        {micOn ? "🛑 Stop Mic" : "🎤 Use Mic"}
      </button>

      {/* Guitar string reference */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:4,width:"100%",marginTop:4}}>
        {GUITAR_STRINGS.map(([n, f]) => (
          <div key={n} style={{background:"#1f2937",borderRadius:6,padding:"4px 2px",textAlign:"center",border:"1px solid #374151"}}>
            <div style={{fontFamily:"'Fredoka One',cursive",fontSize:14,color:"#a78bfa"}}>{n.slice(0,-1)}</div>
            <div style={{fontSize:8,color:"#4b5563",fontFamily:"monospace"}}>{f}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
