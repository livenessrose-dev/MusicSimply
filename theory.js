/**
 * audio/theory.js
 * Pure music-theory functions — no Web Audio, no React.
 * Safe to import anywhere.
 */

import { NOTE_NAMES, CHORD_INTERVALS, CHORD_PROGRESSIONS } from "../constants";

// ─────────────────────────────────────────────────────────────────────────────
// Frequency ↔ note conversion
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a note name + octave to Hz (equal temperament, A4 = 440 Hz). */
export function noteToFreq(note, octave) {
  const idx = NOTE_NAMES.indexOf(note);
  return 440 * Math.pow(2, ((octave + 1) * 12 + idx - 69) / 12);
}

/**
 * Convert a raw frequency to a { note, octave, cents, freq, targetFreq, midi }
 * object.  Returns null for invalid input.
 */
export function freqToNoteInfo(freq) {
  if (!freq || freq <= 0) return null;
  const midi      = Math.round(12 * Math.log2(freq / 440) + 69);
  const noteIdx   = ((midi % 12) + 12) % 12;
  const octave    = Math.floor(midi / 12) - 1;
  const targetFreq = 440 * Math.pow(2, (midi - 69) / 12);
  const cents     = Math.round(1200 * Math.log2(freq / targetFreq));
  return { note: NOTE_NAMES[noteIdx], octave, cents, freq: freq.toFixed(1), targetFreq, midi };
}

// ─────────────────────────────────────────────────────────────────────────────
// Chord detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given an array of MIDI note numbers, return the best-matching chord or null.
 * Returns { root, type, intervals, partial? }.
 */
export function detectChordFromNotes(midiNotes) {
  if (!midiNotes || midiNotes.length < 2) return null;

  // Deduplicate pitch classes
  const pcs = [...new Set(midiNotes.map(m => ((m % 12) + 12) % 12))].sort((a, b) => a - b);

  // Try every pitch class as root — exact match first
  for (const root of pcs) {
    const ivs = pcs.map(p => ((p - root + 12) % 12)).sort((a, b) => a - b);
    for (const [name, pat] of Object.entries(CHORD_INTERVALS)) {
      if (pat.length === ivs.length && pat.every((v, i) => ivs[i] === v)) {
        return { root: NOTE_NAMES[root], type: name, intervals: ivs };
      }
    }
  }

  // Partial match (at least a triad skeleton)
  for (const root of pcs) {
    const ivs = pcs.map(p => ((p - root + 12) % 12));
    if (ivs.includes(4) && ivs.includes(7)) return { root: NOTE_NAMES[root], type: "maj", partial: true };
    if (ivs.includes(3) && ivs.includes(7)) return { root: NOTE_NAMES[root], type: "min", partial: true };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chord progressions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given a root note name, return an array of named progressions, each with
 * { name, chords: string[] } transposed to that root.
 */
export function getProgressions(rootNote) {
  const ri = NOTE_NAMES.indexOf(rootNote);
  if (ri === -1) return [];

  return Object.entries(CHORD_PROGRESSIONS).slice(0, 5).map(([name, semis]) => ({
    name,
    chords: semis.slice(0, 4).map(s => {
      const noteIdx = (ri + s) % 12;
      const isMinor = [2, 9].includes(s % 12);
      return NOTE_NAMES[noteIdx] + (isMinor ? "m" : "");
    }),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Quantization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snap a timestamp (ms) to the nearest 16th-note grid at the given BPM.
 */
export function qSnap(timeMs, bpm) {
  const divMs = (60000 / bpm) / 4; // 16th note duration
  return Math.round(timeMs / divMs) * divMs;
}
