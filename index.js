// ─────────────────────────────────────────────────────────────────────────────
// Music theory constants
// ─────────────────────────────────────────────────────────────────────────────

export const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

export const CHORD_INTERVALS = {
  "maj":  [0,4,7],
  "min":  [0,3,7],
  "7":    [0,4,7,10],
  "maj7": [0,4,7,11],
  "min7": [0,3,7,10],
  "dim":  [0,3,6],
  "aug":  [0,4,8],
  "sus2": [0,2,7],
  "sus4": [0,5,7],
};

export const CHORD_PROGRESSIONS = {
  "I–V–vi–IV":    [0,7,9,5],
  "I–IV–V":       [0,5,7],
  "I–vi–IV–V":    [0,9,5,7],
  "ii–V–I":       [2,7,0],
  "vi–IV–I–V":    [9,5,0,7],
  "12-bar blues": [0,0,0,0,5,5,0,0,7,5,0,7],
};

export const CHORD_TYPE_LABELS = {
  "maj":  "Major",
  "min":  "Minor",
  "7":    "Dom 7",
  "maj7": "Major 7",
  "min7": "Minor 7",
  "dim":  "Diminished",
  "aug":  "Augmented",
  "sus2": "Sus2",
  "sus4": "Sus4",
};

// ─────────────────────────────────────────────────────────────────────────────
// Drum constants
// ─────────────────────────────────────────────────────────────────────────────

export const DRUM_SOUNDS = ["Kick","Snare","Hi-Hat","Open HH","Clap","Tom","Crash","Ride"];

export const DRUM_COLORS = [
  "#f87171","#fb923c","#fbbf24","#a3e635",
  "#34d399","#38bdf8","#a78bfa","#f472b6",
];

export const DRUM_STEPS = 16;

// ─────────────────────────────────────────────────────────────────────────────
// Piano keyboard layout (2 octaves: C4–B5)
// ─────────────────────────────────────────────────────────────────────────────

export const PIANO_KEYS = [
  {note:"C", oct:4,black:false},{note:"C#",oct:4,black:true},
  {note:"D", oct:4,black:false},{note:"D#",oct:4,black:true},
  {note:"E", oct:4,black:false},{note:"F", oct:4,black:false},
  {note:"F#",oct:4,black:true}, {note:"G", oct:4,black:false},
  {note:"G#",oct:4,black:true}, {note:"A", oct:4,black:false},
  {note:"A#",oct:4,black:true}, {note:"B", oct:4,black:false},
  {note:"C", oct:5,black:false},{note:"C#",oct:5,black:true},
  {note:"D", oct:5,black:false},{note:"D#",oct:5,black:true},
  {note:"E", oct:5,black:false},{note:"F", oct:5,black:false},
  {note:"F#",oct:5,black:true}, {note:"G", oct:5,black:false},
  {note:"G#",oct:5,black:true}, {note:"A", oct:5,black:false},
  {note:"A#",oct:5,black:true}, {note:"B", oct:5,black:false},
];

export const WHITE_KEY_WIDTH = 36;   // px
export const BLACK_KEY_WIDTH = 22;   // px
export const WHITE_KEY_HEIGHT = 140; // px
export const BLACK_KEY_HEIGHT = 88;  // px

// ─────────────────────────────────────────────────────────────────────────────
// App UI
// ─────────────────────────────────────────────────────────────────────────────

export const TABS = [
  "🎸 Tuner",
  "🎼 Chords",
  "🎹 Piano",
  "🥁 Drums",
  "🎙 Tracks",
  "🗂 Timeline",
];

// Cycling palette assigned to new tracks
export const TRACK_COLORS = [
  "#a78bfa","#f472b6","#fb923c","#fbbf24",
  "#4ade80","#38bdf8","#f87171","#34d399",
];

// Guitar standard tuning reference (label, Hz)
export const GUITAR_STRINGS = [
  ["E2", 82.4],
  ["A2", 110],
  ["D3", 146.8],
  ["G3", 196],
  ["B3", 246.9],
  ["E4", 329.6],
];
