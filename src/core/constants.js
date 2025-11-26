// World scale: 1 grid unit = 3 world units
// This allows grid coordinates (0-64) to map to comfortable world space (0-192)
export const WORLD_SCALE = 3;

// Recording range as percentage of audible range
// E.g., 0.5 means you must be within 50% of the audible range to record
export const RECORDING_RANGE_PERCENTAGE = 0.5;

// Playback beat tolerance in milliseconds
// If spacebar pressed within this time after a beat, playback starts immediately
// Otherwise, playback waits for the next beat
export const PLAYBACK_BEAT_TOLERANCE = 50;
