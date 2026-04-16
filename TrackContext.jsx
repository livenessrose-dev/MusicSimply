/**
 * TrackContext — global shared store for all recorded tracks.
 *
 * A "track" is one of three shapes:
 *   { type:"piano", label, events, duration, color, muted, solo, volume }
 *   { type:"drum",  label, events, pattern, bpm, duration, color, muted, solo, volume }
 *   { type:"mic",   label, audioUrl, duration, color, muted, solo, volume }
 *
 * Any component in the tree can call useTracks() to read or modify the list.
 * Adding a new track type: add it to the reducer ADD case and give it a shape here.
 */

import { createContext, useContext, useReducer, useCallback } from "react";
import { TRACK_COLORS } from "../constants";

// ─────────────────────────────────────────────────────────────────────────────
// Reducer
// ─────────────────────────────────────────────────────────────────────────────

function trackReducer(state, action) {
  switch (action.type) {
    case "ADD":
      return [
        ...state,
        {
          ...action.track,
          id:     Date.now(),
          color:  TRACK_COLORS[state.length % TRACK_COLORS.length],
          muted:  false,
          solo:   false,
          volume: 0.8,
        },
      ];

    case "REMOVE":
      return state.filter(t => t.id !== action.id);

    case "UPDATE":
      return state.map(t => t.id === action.id ? { ...t, ...action.patch } : t);

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context + Provider
// ─────────────────────────────────────────────────────────────────────────────

const TrackCtx = createContext(null);

export function TrackProvider({ children }) {
  const [tracks, dispatch] = useReducer(trackReducer, []);

  const addTrack    = useCallback(track       => dispatch({ type:"ADD",    track }),       []);
  const removeTrack = useCallback(id          => dispatch({ type:"REMOVE", id }),          []);
  const updateTrack = useCallback((id, patch) => dispatch({ type:"UPDATE", id, patch }),   []);

  return (
    <TrackCtx.Provider value={{ tracks, addTrack, removeTrack, updateTrack }}>
      {children}
    </TrackCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useTracks() {
  const ctx = useContext(TrackCtx);
  if (!ctx) throw new Error("useTracks must be used inside <TrackProvider>");
  return ctx;
}
