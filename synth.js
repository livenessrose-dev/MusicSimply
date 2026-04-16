/**
 * audio/synth.js
 * Web Audio synthesis — piano tones and drum sounds.
 * All functions take an AudioContext as the first argument.
 * None of them import React or touch state.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Piano
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Play a piano-like tone at `freq` Hz.
 * Uses a triangle fundamental + sine harmonics with exponential decay.
 *
 * @param {AudioContext} ctx
 * @param {number}       freq      - Frequency in Hz
 * @param {number}       duration  - Release time in seconds (default 1.5)
 * @param {number}       vol       - Master gain 0–1 (default 0.4)
 */
export function playPianoNote(ctx, freq, duration = 1.5, vol = 0.4) {
  const now    = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);

  // Fundamental + 4 harmonics
  const harmonics = [1, 2, 3, 4, 5];
  const amps      = [0.7, 0.3, 0.15, 0.08, 0.04];

  harmonics.forEach((h, i) => {
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g);
    g.connect(master);
    osc.type          = i === 0 ? "triangle" : "sine";
    osc.frequency.value = freq * h;
    g.gain.setValueAtTime(amps[i], now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.start(now);
    osc.stop(now + duration + 0.1);
  });

  master.gain.setValueAtTime(vol, now);
  master.gain.exponentialRampToValueAtTime(0.001, now + duration);
}

// ─────────────────────────────────────────────────────────────────────────────
// Drums
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Synthesize and play a drum hit.
 *
 * @param {AudioContext} ctx
 * @param {string}       name  - One of the DRUM_SOUNDS values
 * @param {number}       when  - Offset from ctx.currentTime in seconds (default 0)
 */
export function playDrumSound(ctx, name, when = 0) {
  const t = ctx.currentTime + when;
  const g = ctx.createGain();
  g.connect(ctx.destination);

  switch (name) {
    case "Kick": {
      const osc = ctx.createOscillator();
      osc.connect(g);
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.4);
      g.gain.setValueAtTime(1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.start(t); osc.stop(t + 0.4);
      break;
    }

    case "Snare": {
      const buf = _noiseBuffer(ctx, 0.2);
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(g);
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      src.start(t);
      break;
    }

    case "Hi-Hat":
    case "Open HH": {
      const dur = name === "Open HH" ? 0.3 : 0.06;
      const buf = _noiseBuffer(ctx, dur, 0.3);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = "highpass"; filt.frequency.value = 7000;
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.start(t);
      break;
    }

    case "Clap": {
      // Three quick noise bursts
      for (let b = 0; b < 3; b++) {
        const buf = _noiseBuffer(ctx, 0.05);
        const src = ctx.createBufferSource(); src.buffer = buf;
        const gg  = ctx.createGain();
        src.connect(gg); gg.connect(ctx.destination);
        const bt = t + b * 0.012;
        gg.gain.setValueAtTime(0.5, bt);
        gg.gain.exponentialRampToValueAtTime(0.001, bt + 0.05);
        src.start(bt);
      }
      break;
    }

    case "Tom": {
      const osc = ctx.createOscillator(); osc.connect(g);
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
      g.gain.setValueAtTime(0.8, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.start(t); osc.stop(t + 0.3);
      break;
    }

    // Crash / Ride / fallback — filtered noise with long decay
    default: {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d   = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++)
        d[i] = (Math.random() * 2 - 1) * Math.exp(-i / ctx.sampleRate * 10) * 0.5;
      const src  = ctx.createBufferSource(); src.buffer = buf;
      const filt = ctx.createBiquadFilter(); filt.type = "bandpass"; filt.frequency.value = 4000;
      src.connect(filt); filt.connect(g);
      g.gain.setValueAtTime(0.5, t);
      src.start(t);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function _noiseBuffer(ctx, durationSec, amplitude = 1) {
  const len = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * amplitude;
  return buf;
}
