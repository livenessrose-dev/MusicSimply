/**
 * hooks/useMic.js
 *
 * Opens the microphone, runs an autocorrelation pitch detector via
 * requestAnimationFrame, and returns { micOn, noteInfo, toggleMic }.
 *
 * noteInfo shape: { note, octave, cents, freq, targetFreq, midi }
 *
 * Usage:
 *   const { micOn, noteInfo, toggleMic } = useMic(audioCtxRef);
 */

import { useState, useRef, useCallback } from "react";
import { freqToNoteInfo } from "../audio/theory";

export function useMic(audioCtxRef) {
  const [micOn,    setMicOn]    = useState(false);
  const [noteInfo, setNoteInfo] = useState(null);

  const analyserRef   = useRef(null);
  const streamRef     = useRef(null);
  const rafRef        = useRef(null);

  // ── Pitch detection loop ──────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx      = audioCtxRef.current;
    if (!analyser || !ctx) return;

    const bufLen = analyser.fftSize;
    const buf    = new Float32Array(bufLen);
    analyser.getFloatTimeDomainData(buf);

    // Simple autocorrelation in the guitar/voice range (60 Hz – 1400 Hz)
    const sr   = ctx.sampleRate;
    const minP = Math.floor(sr / 1400);
    const maxP = Math.floor(sr / 60);

    let best = -1, bestD = 0;
    for (let d = minP; d <= maxP; d++) {
      let sum = 0;
      for (let i = 0; i < bufLen - d; i++) sum += buf[i] * buf[i + d];
      if (sum > bestD) { bestD = sum; best = d; }
    }

    // Gate on RMS to avoid noise false-positives
    let rms = 0;
    for (let i = 0; i < bufLen; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / bufLen);

    if (rms > 0.01 && best > 0) setNoteInfo(freqToNoteInfo(sr / best));
    else setNoteInfo(null);

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  // ── Toggle ────────────────────────────────────────────────────────────────
  async function toggleMic() {
    if (micOn) {
      setMicOn(false);
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      setNoteInfo(null);
      return;
    }

    try {
      // Ensure AudioContext exists
      if (!audioCtxRef.current)
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtxRef.current.state === "suspended")
        audioCtxRef.current.resume();

      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const src = audioCtxRef.current.createMediaStreamSource(streamRef.current);

      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 4096;
      src.connect(analyserRef.current);

      setMicOn(true);
      runLoop();
    } catch {
      alert("Microphone access denied. Please allow microphone access in your browser settings.");
    }
  }

  return { micOn, noteInfo, toggleMic };
}
