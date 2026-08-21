/**
 * hooks/useMetronome.js
 *
 * Plays an audible click and returns the current beat index (0–3).
 * Beat 0 = downbeat (higher pitch). Beats 1–3 = subdivisions.
 *
 * Usage:
 *   const beat = useMetronome(audioCtxRef, bpm, enabled);
 *   // beat is -1 when disabled, 0–3 while running
 */

import { useState, useEffect, useRef } from "react";

export function useMetronome(audioCtxRef, bpm, enabled) {
  const [beat, setBeat]   = useState(-1);
  const beatRef           = useRef(0);
  const timerRef          = useRef(null);

  useEffect(() => {
    if (!enabled) {
      clearInterval(timerRef.current);
      setBeat(-1);
      return;
    }

    const intervalMs = 60000 / bpm;

    timerRef.current = setInterval(() => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();

      const b = beatRef.current % 4;
      beatRef.current++;
      setBeat(b);

      // Click tone
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.connect(g);
      g.connect(ctx.destination);

      osc.frequency.value = b === 0 ? 1000 : 700;
      g.gain.setValueAtTime(b === 0 ? 0.3 : 0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.07);
    }, intervalMs);

    return () => clearInterval(timerRef.current);
  }, [enabled, bpm]); // Re-creates interval when BPM or enabled changes

  return beat;
}
