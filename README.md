File Structure

```
MusicStudio/
├── MusicStudio.jsx               ← Root entry point (thin shell, mount this)
│
└── src/
    ├── constants/
    │   └── index.js              ← Every magic string/number: NOTE_NAMES,
    │                               CHORD_INTERVALS, DRUM_SOUNDS, PIANO_KEYS,
    │                               TABS, TRACK_COLORS, GUITAR_STRINGS, etc.
    │
    ├── context/
    │   └── TrackContext.jsx      ← Global DAW store (useReducer).
    │                               Call useTracks() anywhere to read/write tracks.
    │                               Track shapes are documented here.
    │
    ├── audio/
    │   ├── theory.js             ← Pure music-theory functions (no React, no DOM).
    │   │                           noteToFreq, freqToNoteInfo, detectChordFromNotes,
    │   │                           getProgressions, qSnap (quantize)
    │   │
    │   └── synth.js              ← Web Audio synthesis.
    │                               playPianoNote(ctx, freq, duration, vol)
    │                               playDrumSound(ctx, name, when)
    │
    ├── hooks/
    │   ├── useMic.js             ← Opens mic, runs pitch detector loop.
    │   │                           Returns { micOn, noteInfo, toggleMic }
    │   │
    │   └── useMetronome.js       ← Audible click + beat LED index (0–3).
    │                               Returns current beat number.
    │
    └── components/
        ├── Tuner/
        │   └── SemicircleTuner.jsx   ← SVG arc tuner + string reference grid
        │
        ├── Chords/
        │   └── ChordAnalyzer.jsx     ← Mic note accumulator + chord/progression UI
        │
        ├── Piano/
        │   └── VirtualPiano.jsx      ← 2-octave keyboard + sheet-music staff + recording
        │
        ├── Drums/
        │   └── DrumMachine.jsx       ← 16-step percussion sequencer
        │
        ├── Tracks/
        │   └── RecordingTracks.jsx   ← Mic recording list with waveform canvas
        │
        └── Timeline/
            └── Timeline.jsx          ← DAW lane view + Play All engine
```

---

## How to add a new feature

### Add a new tab 
1. Add the label to `TABS` in `src/constants/index.js`
2. Create `src/components/ChordDict/ChordDictionary.jsx`
3. Import it in `MusicStudio.jsx` and add `{tab === 6 && <ChordDictionary/>}`

### Add a new drum sound
1. Add the name to `DRUM_SOUNDS` in `src/constants/index.js`
2. Add its hex colour to `DRUM_COLORS` (same index)
3. Add a synthesis case in `src/audio/synth.js` → `playDrumSound()`

### Add a new chord type
1. Add `"name": [interval, interval, …]` to `CHORD_INTERVALS` in `src/constants/index.js`
2. Optionally add a human-readable label to `CHORD_TYPE_LABELS`

### Add a new track type (e.g. sampler)
1. Document its shape at the top of `src/context/TrackContext.jsx`
2. Handle it in the `Timeline` block-render section
3. Handle playback in `Timeline.jsx → playAll()`

### Change the BPM default or key range
All in `src/constants/index.js` — one file to change, guaranteed consistent everywhere.

---

## Data flow

```
useMic() ──► noteInfo ──► SemicircleTuner   (display)
                     └──► ChordAnalyzer     (detect chords)
                     └──► VirtualPiano      (for keyboard midi comparison)

VirtualPiano  ──► addTrack({ type:"piano", events, … })  ──► TrackContext
DrumMachine   ──► addTrack({ type:"drum",  events, … })  ──► TrackContext
RecordingTracks ► addTrack({ type:"mic",   audioUrl, … }) ──► TrackContext

TrackContext.tracks ──► Timeline (read + play all)
```
