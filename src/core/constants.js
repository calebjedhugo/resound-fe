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

// Creature movement constants
// Default max speed matches player running speed (8 units/sec)
export const DEFAULT_CREATURE_MAX_SPEED = 8.0;

// Default creature size (radius in world units)
export const DEFAULT_CREATURE_SIZE = 0.9;

// Player size (radius in world units, for force calculations)
export const PLAYER_SIZE = 0.5;

// Deceleration factor applied each frame (0-1)
// Lower = faster deceleration. Applied as: velocity *= factor
export const CREATURE_DECELERATION = 0.85;

// Force strength for attraction/repulsion (units/sec per consonant/dissonant source)
// Applied continuously every frame while harmonies exist
export const ATTRACTION_FORCE_STRENGTH = 15.0;
export const REPULSION_FORCE_STRENGTH = 15.0;

// Harmony timing: notes must fall on same subdivision to be considered simultaneous
// 16 = sixteenth notes, 8 = eighth notes, etc.
export const HARMONY_TIMING_SUBDIVISION = 16;
