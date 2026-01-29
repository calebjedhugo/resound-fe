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

// Clap constants
// Fixed range for clap effect (world units)
// Matches typical recording range (50% of 15-unit audible range)
export const CLAP_RANGE = 7.5;

// Default displacement when creature is clapped (fraction of whole note)
// 1/16 = sixteenth note, 1/8 = eighth note, etc. (can be overridden per puzzle/creature)
export const DEFAULT_CLAP_DISPLACEMENT = 0.0625;

// Visual feedback duration for clap effect (seconds)
export const CLAP_VISUAL_FADE_DURATION = 0.3;

// Height of one elevation level in world units
// Equal to WORLD_SCALE so one elevation step = one grid cell vertically
export const ELEVATION_HEIGHT = 3.0;

// Maximum elevation difference (in levels) at which entities still collide
// Entities more than this apart vertically are on different floors and pass through each other
export const ELEVATION_COLLISION_THRESHOLD = 0.5;
